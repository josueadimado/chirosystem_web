"use client";

import {
  AdminScheduleCalendar,
  navigateFocusDate,
  schedulePeriodLabel,
  type ProviderBlock,
  type ScheduleAppointment,
} from "@/components/admin-schedule-calendar";
import { AdminDeskBookFromSlotModal, type DeskBookSlotSeed } from "@/components/admin-desk-book-from-slot-modal";
import { DoctorPageIntro, DoctorSectionLabel } from "@/components/doctor-shell";
import { useAppFeedback } from "@/components/app-feedback";
import { HelpTip } from "@/components/help-tip";
import { Loader } from "@/components/loader";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ApiError, apiGet, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import {
  addDays,
  endOfMonth,
  mondayOfWeekContaining,
  parseTimeToMinutes,
  startOfMonth,
  toIsoDate,
} from "@/lib/admin-schedule-utils";
import { formatWeekdayMonthDayYear } from "@/lib/format-date";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type CalendarStatus = { oauth_configured: boolean; connected: boolean };

type AppointmentRow = {
  id: number;
  patient: number;
  patient_name: string;
  provider: number;
  provider_name: string;
  booked_service: number | null;
  service_name: string;
  service_type?: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  start_time_display?: string;
  end_time_display?: string;
  status: string;
};

type ScheduleViewMode = "day" | "week" | "month";

/** Same payload as public booking — book next flow */
type BookingOptionsResponse = {
  services: Array<{
    id: number;
    name: string;
    duration_minutes: number;
    price: string;
    service_type: string;
  }>;
  providers_by_service: Record<string, Array<{ id: number; provider_name: string }>>;
};

function formatTime(t: string): string {
  if (!t) return "";
  const match = t.match(/(\d{1,2}):(\d{2})/);
  if (!match) return t;
  const h = parseInt(match[1], 10);
  const m = match[2];
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function formatAppointmentDuration(start: string, end: string): string {
  const mins = Math.max(0, parseTimeToMinutes(end) - parseTimeToMinutes(start));
  if (mins <= 0) return "—";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  if (rem === 0) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${h} hr ${rem} min`;
}

function drawerStatusBadgeClass(status: string): string {
  switch (status) {
    case "booked":
    case "scheduled":
      return "bg-emerald-100 text-emerald-900";
    case "checked_in":
    case "in_consultation":
      return "bg-sky-100 text-sky-900";
    case "awaiting_payment":
      return "bg-violet-100 text-violet-900";
    case "completed":
      return "bg-slate-200 text-slate-800";
    case "cancelled":
      return "bg-pink-100 text-pink-900";
    case "no_show":
      return "bg-orange-100 text-orange-900";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function drawerStatusLabel(status: string): string {
  const key = status === "booked" ? "scheduled" : status;
  return key.replaceAll("_", " ");
}

function buildAppointmentListParams(
  view: ScheduleViewMode,
  focusDate: Date,
  providerId: number,
): URLSearchParams {
  const params = new URLSearchParams();
  if (view === "day") {
    params.set("appointment_date", toIsoDate(focusDate));
  } else if (view === "week") {
    const mon = mondayOfWeekContaining(focusDate);
    const fri = addDays(mon, 4);
    params.set("date_from", toIsoDate(mon));
    params.set("date_to", toIsoDate(fri));
  } else {
    params.set("date_from", toIsoDate(startOfMonth(focusDate)));
    params.set("date_to", toIsoDate(endOfMonth(focusDate)));
  }
  params.set("provider_id", String(providerId));
  return params;
}

function blockListRange(view: ScheduleViewMode, focusDate: Date): { from: string; to: string } {
  if (view === "day") {
    const iso = toIsoDate(focusDate);
    return { from: iso, to: iso };
  }
  if (view === "week") {
    const mon = mondayOfWeekContaining(focusDate);
    const fri = addDays(mon, 4);
    return { from: toIsoDate(mon), to: toIsoDate(fri) };
  }
  return { from: toIsoDate(startOfMonth(focusDate)), to: toIsoDate(endOfMonth(focusDate)) };
}

function DoctorSchedulePageInner() {
  const { runWithFeedback } = useAppFeedback();
  const searchParams = useSearchParams();
  const [providerId, setProviderId] = useState<number | null>(null);
  const [providerName, setProviderName] = useState("");
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [blocks, setBlocks] = useState<ProviderBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<ScheduleViewMode>("week");
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [selected, setSelected] = useState<AppointmentRow | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);

  const [handoffNotes, setHandoffNotes] = useState("");
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [savingHandoff, setSavingHandoff] = useState(false);

  const [bookNextAppt, setBookNextAppt] = useState<AppointmentRow | null>(null);
  const [bookingOptions, setBookingOptions] = useState<BookingOptionsResponse | null>(null);
  const [bookNextOptionsLoading, setBookNextOptionsLoading] = useState(false);
  const [bnServiceId, setBnServiceId] = useState(0);
  const [bnProviderId, setBnProviderId] = useState(0);
  const [bnDate, setBnDate] = useState("");
  const [bnSlotTimes, setBnSlotTimes] = useState<string[]>([]);
  const [bnSlotLabels, setBnSlotLabels] = useState<string[]>([]);
  const [bnSelectedSlot, setBnSelectedSlot] = useState("");
  const [bnSlotsLoading, setBnSlotsLoading] = useState(false);
  const [savingBookNext, setSavingBookNext] = useState(false);

  const [deskBookSeed, setDeskBookSeed] = useState<DeskBookSlotSeed | null>(null);

  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null);
  const [calendarNote, setCalendarNote] = useState("");
  const [calendarBusy, setCalendarBusy] = useState(false);

  const navSigRef = useRef<{ view: ScheduleViewMode; focusMs: number } | null>(null);
  /** Wall-mounted touchscreen: chart note grows with content; min height enforced in layout effect. */
  const handoffTextareaRef = useRef<HTMLTextAreaElement>(null);
  const todayStr = new Date().toISOString().slice(0, 10);

  const adjustHandoffTextareaHeight = useCallback(() => {
    const el = handoffTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(300, el.scrollHeight)}px`;
  }, []);

  const providersForCalendar = useMemo(() => {
    if (providerId == null) return [];
    return [{ id: providerId, provider_name: providerName || `Provider ${providerId}` }];
  }, [providerId, providerName]);

  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    void apiGetAuth<{ provider_id: number; provider_name: string }>("/doctor/me/")
      .then((r) => {
        setProviderId(r.provider_id);
        setProviderName(r.provider_name || "");
      })
      .catch(() => {
        setProviderId(null);
        setProviderName("");
      })
      .finally(() => setAuthReady(true));
  }, []);

  const loadAppointments = useCallback(async () => {
    if (providerId == null) return;
    setLoading(true);
    setError("");
    try {
      const params = buildAppointmentListParams(view, focusDate, providerId);
      const list = await apiGetAuth<AppointmentRow[]>(`/appointments/?${params}`);
      setAppointments(list);
      setSelected((prev) => {
        if (!prev) return null;
        const fresh = list.find((a) => a.id === prev.id);
        return fresh ?? null;
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load schedule.");
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [providerId, view, focusDate]);

  const loadBlocks = useCallback(async () => {
    if (providerId == null) return;
    const { from, to } = blockListRange(view, focusDate);
    const blockParams = new URLSearchParams({
      date_from: from,
      date_to: to,
      provider_id: String(providerId),
    });
    try {
      const blockList = await apiGetAuth<ProviderBlock[]>(`/provider-unavailability/?${blockParams}`);
      setBlocks(blockList);
    } catch {
      setBlocks([]);
    }
  }, [providerId, view, focusDate]);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    if (view !== "day") setDeskBookSeed(null);
  }, [view]);

  useEffect(() => {
    void loadBlocks();
  }, [loadBlocks]);

  useEffect(() => {
    const ms = focusDate.getTime();
    const prev = navSigRef.current;
    navSigRef.current = { view, focusMs: ms };
    if (!prev) return;
    if (prev.view !== view || prev.focusMs !== ms) {
      setSelected(null);
    }
  }, [view, focusDate]);

  useEffect(() => {
    apiGetAuth<CalendarStatus>("/doctor/google_calendar/status/")
      .then(setCalendarStatus)
      .catch(() => setCalendarStatus(null));
  }, []);

  useEffect(() => {
    const g = searchParams.get("google_calendar");
    if (g === "connected") {
      setCalendarNote("Google Calendar connected. New appointments will appear on your personal calendar.");
      apiGetAuth<CalendarStatus>("/doctor/google_calendar/status/").then(setCalendarStatus);
    }
    if (g === "error") {
      const r = searchParams.get("reason") || "unknown";
      setCalendarNote(`Google connection failed: ${decodeURIComponent(r)}`);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!selected) {
      setHandoffNotes("");
      return;
    }
    let cancelled = false;
    setHandoffLoading(true);
    void apiGetAuth<{ clinical_handoff_notes?: string }>(`/appointments/${selected.id}/`)
      .then((row) => {
        if (!cancelled) setHandoffNotes(row.clinical_handoff_notes ?? "");
      })
      .catch(() => {
        if (!cancelled) setHandoffNotes("");
      })
      .finally(() => {
        if (!cancelled) setHandoffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  useLayoutEffect(() => {
    adjustHandoffTextareaHeight();
  }, [handoffNotes, handoffLoading, selected?.id, adjustHandoffTextareaHeight]);

  useEffect(() => {
    if (!bookNextAppt || !bnDate || !bnServiceId || !bnProviderId) {
      setBnSlotLabels([]);
      setBnSlotTimes([]);
      setBnSelectedSlot("");
      return;
    }
    let cancelled = false;
    void (async () => {
      setBnSlotsLoading(true);
      try {
        const q = new URLSearchParams({
          date: bnDate,
          provider_id: String(bnProviderId),
          service_id: String(bnServiceId),
        });
        const data = await apiGetAuth<{ available_slots: string[]; slot_start_times?: string[] }>(
          `/booking-options/availability/?${q.toString()}`,
        );
        if (cancelled) return;
        const labels = data.available_slots || [];
        const times = data.slot_start_times || [];
        setBnSlotLabels(labels);
        setBnSlotTimes(times.length ? times : labels.map(() => ""));
        setBnSelectedSlot(times[0] || "");
      } catch {
        if (!cancelled) {
          setBnSlotLabels([]);
          setBnSlotTimes([]);
          setBnSelectedSlot("");
        }
      } finally {
        if (!cancelled) setBnSlotsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookNextAppt?.id, bnDate, bnServiceId, bnProviderId]);

  const handleCheckIn = async () => {
    if (!selected) return;
    setCheckingIn(true);
    await runWithFeedback(
      async () => {
        await apiPost("/kiosk/checkin/", { appointment_id: selected.id });
        await loadAppointments();
        setSelected((prev) => (prev ? { ...prev, status: "checked_in" } : null));
      },
      {
        loadingMessage: "Completing check-in…",
        successMessage: "Check-in complete.",
        errorFallback: "Could not complete check-in.",
      },
    );
    setCheckingIn(false);
  };

  const saveHandoff = async () => {
    if (!selected) return;
    setSavingHandoff(true);
    try {
      await runWithFeedback(
        async () => {
          await apiPatch("/doctor/appointment_handoff/", {
            appointment_id: selected.id,
            clinical_handoff_notes: handoffNotes,
          });
        },
        {
          loadingMessage: "Saving chart note…",
          successMessage: "Chart note saved.",
          errorFallback: "Could not save chart note.",
        },
      );
    } finally {
      setSavingHandoff(false);
    }
  };

  const openBookNext = (appt: AppointmentRow) => {
    void (async () => {
      setBookNextAppt(appt);
      const initialDate = appt.appointment_date >= todayStr ? appt.appointment_date : todayStr;
      setBnDate(initialDate);
      setBookNextOptionsLoading(true);
      try {
        const opts = await apiGet<BookingOptionsResponse>("/booking-options/");
        setBookingOptions(opts);
        const sid =
          appt.booked_service && opts.services.some((s) => s.id === appt.booked_service)
            ? appt.booked_service
            : opts.services[0]?.id ?? 0;
        setBnServiceId(sid);
        const provs = opts.providers_by_service[String(sid)] ?? [];
        const pid = provs.some((p) => p.id === appt.provider) ? appt.provider : provs[0]?.id ?? 0;
        setBnProviderId(pid);
      } catch {
        setBookingOptions(null);
        setBnServiceId(0);
        setBnProviderId(0);
      } finally {
        setBookNextOptionsLoading(false);
      }
    })();
  };

  const submitBookNext = async () => {
    if (!bookNextAppt || !bnServiceId || !bnProviderId || !bnDate || !bnSelectedSlot) return;
    setSavingBookNext(true);
    try {
      await runWithFeedback(
        async () => {
          await apiPost(`/appointments/book-by-provider/`, {
            source_appointment_id: bookNextAppt.id,
            service_id: bnServiceId,
            provider_id: bnProviderId,
            appointment_date: bnDate,
            start_time: bnSelectedSlot,
          });
          setBookNextAppt(null);
          setBookingOptions(null);
          await loadAppointments();
        },
        {
          loadingMessage: "Booking…",
          successMessage: "Next visit booked",
          errorFallback: "Could not book that slot (it may have been taken).",
        },
      );
    } finally {
      setSavingBookNext(false);
    }
  };

  const scheduleAppts: ScheduleAppointment[] = appointments;

  const firstDay = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1);
  const startPad = firstDay.getDay();
  const daysInMonth = new Date(focusDate.getFullYear(), focusDate.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = i - startPad + 1;
    if (d < 1) return null;
    if (d > daysInMonth) return null;
    return d;
  });

  if (!authReady) {
    return (
      <div className="doctor-panel flex min-h-[280px] items-center justify-center py-12">
        <Loader variant="page" label="Loading schedule" sublabel="Verifying your profile…" />
      </div>
    );
  }

  if (providerId === null) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-950">
        No provider profile is linked to your account. Contact the clinic administrator.
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <div className="doctor-panel p-4">
          <DoctorSectionLabel help="Pick a day to open it in Day view on the main calendar. Use arrows on the calendar for week/month navigation.">
            Month
          </DoctorSectionLabel>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-slate-800">
              {MONTHS[focusDate.getMonth()]} {focusDate.getFullYear()}
            </span>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="py-1 font-medium text-slate-500">
                {d}
              </div>
            ))}
            {days.map((d, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (d !== null) {
                    const date = new Date(focusDate.getFullYear(), focusDate.getMonth(), d, 12, 0, 0);
                    setFocusDate(date);
                    setView("day");
                  }
                }}
                className={`rounded py-1.5 text-sm ${
                  d === null
                    ? "invisible"
                    : focusDate.getDate() === d
                      ? "bg-[#16a349] text-white"
                      : "hover:bg-slate-100"
                }`}
              >
                {d ?? ""}
              </button>
            ))}
          </div>
        </div>
        <div className="doctor-panel p-4">
          <DoctorSectionLabel help="Optional: push your assigned appointments to your personal Google Calendar after you connect once. Disconnect stops new sync events.">
            Google Calendar
          </DoctorSectionLabel>
          {calendarNote && (
            <p className="mb-2 rounded-lg bg-slate-100 px-2 py-1.5 text-xs text-slate-700">{calendarNote}</p>
          )}
          {calendarStatus && !calendarStatus.oauth_configured && (
            <p className="text-xs text-slate-500">
              Calendar sync is not set up on the server yet (missing Google OAuth env vars).
            </p>
          )}
          {calendarStatus?.oauth_configured && calendarStatus.connected && (
            <p className="mb-2 text-xs text-[#166534]">Connected — your bookings sync to your personal Google Calendar.</p>
          )}
          {calendarStatus?.oauth_configured && !calendarStatus.connected && (
            <p className="mb-2 text-xs text-slate-600">
              Connect your personal Google account so appointments you receive appear on your calendar.
            </p>
          )}
          {calendarStatus?.oauth_configured && !calendarStatus.connected && (
            <button
              type="button"
              disabled={calendarBusy}
              onClick={async () => {
                setCalendarBusy(true);
                setCalendarNote("");
                try {
                  const r = await apiGetAuth<{ authorization_url: string }>("/doctor/google_calendar/oauth/start/");
                  window.location.href = r.authorization_url;
                } catch (e) {
                  setCalendarNote(e instanceof ApiError ? e.message : "Could not start Google sign-in.");
                } finally {
                  setCalendarBusy(false);
                }
              }}
              className="mb-2 w-full rounded-lg bg-[#16a349] px-3 py-2 text-sm font-semibold text-white hover:bg-[#13823d] disabled:opacity-50"
            >
              {calendarBusy ? "Redirecting…" : "Connect Google Calendar"}
            </button>
          )}
          {calendarStatus?.oauth_configured && calendarStatus.connected && (
            <button
              type="button"
              disabled={calendarBusy}
              onClick={async () => {
                setCalendarBusy(true);
                setCalendarNote("");
                await runWithFeedback(
                  async () => {
                    await apiPost("/doctor/google_calendar/disconnect/", {});
                    setCalendarStatus({ oauth_configured: true, connected: false });
                  },
                  {
                    loadingMessage: "Disconnecting Google Calendar…",
                    successMessage: "Disconnected. New events will not sync until you connect again.",
                    errorFallback: "Could not disconnect Google Calendar.",
                  },
                );
                setCalendarBusy(false);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Disconnect Google
            </button>
          )}
        </div>
        <div className="doctor-panel p-4">
          <DoctorSectionLabel help="When your clinic enables a waitlist, patients who want an earlier slot can appear here for you to call or book.">
            Waitlist
          </DoctorSectionLabel>
          <p className="text-sm text-slate-500">No patients on the waitlist yet.</p>
        </div>
      </aside>

      <div className="min-w-0 space-y-6">
        <DoctorPageIntro
          eyebrow="Planning"
          title="Your schedule"
          description="Your assigned visits on the same time grid as the front desk: duration-sized blocks, open gaps, and today’s time line. Only your appointments load."
          pageHelp={
            <>
              Use <strong>Day</strong> for the detailed time grid, <strong>Week</strong> for Monday–Friday columns, <strong>Month</strong>{" "}
              for counts. Click a block to open the patient chart drawer (not a small popup).
            </>
          }
        />

        {error && <p className="rounded-xl bg-rose-100 p-3 text-sm font-medium text-rose-800">{error}</p>}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-600">View</span>
            <HelpTip label="Calendar views">
              Day shows your column with open gaps and blocks by time. Week shows Monday–Friday; month shows counts — click a day for Day
              view.
            </HelpTip>
            <button
              type="button"
              onClick={() => setView("day")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                view === "day" ? "bg-[#16a349] text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setView("week")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                view === "week" ? "bg-[#16a349] text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setView("month")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                view === "month" ? "bg-[#16a349] text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Month
            </button>
            <button
              type="button"
              aria-label="Previous period"
              onClick={() => setFocusDate(navigateFocusDate(view, focusDate, -1))}
              className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100"
            >
              ←
            </button>
            <button
              type="button"
              aria-label="Next period"
              onClick={() => setFocusDate(navigateFocusDate(view, focusDate, 1))}
              className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100"
            >
              →
            </button>
            <button
              type="button"
              onClick={() => setFocusDate(new Date())}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Today
            </button>
            <span className="text-sm font-semibold text-slate-800">{schedulePeriodLabel(view, focusDate)}</span>
          </div>
        </div>

        {loading ? (
          <div className="doctor-panel flex min-h-[280px] items-center justify-center py-12">
            <Loader variant="page" label="Loading schedule" sublabel="Fetching your calendar…" />
          </div>
        ) : (
          <div className="doctor-panel min-w-0 overflow-x-auto p-4">
            <AdminScheduleCalendar
              view={view}
              focusDate={focusDate}
              appointments={scheduleAppts}
              providers={providersForCalendar}
              providerFilter={String(providerId)}
              blocks={blocks}
              selectedId={selected?.id ?? null}
              onSelect={(row) => {
                const full = appointments.find((x) => x.id === row.id);
                if (full) setSelected(full);
              }}
              onPickDayInMonth={(d) => {
                setFocusDate(d);
                setView("day");
              }}
              onPickOpenSlot={view === "day" ? (pick) => setDeskBookSeed(pick) : undefined}
            />
          </div>
        )}
      </div>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        {selected ? (
          <SheetContent
            side="right"
            showCloseButton
            className="flex h-full max-h-[100dvh] w-full max-w-[min(100vw,480px)] flex-col gap-0 overflow-hidden border-l border-slate-200 bg-white p-0 shadow-2xl sm:max-w-[480px]"
          >
            <div className="shrink-0 border-b border-slate-100 px-5 pb-4 pt-14">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">{selected.patient_name}</h2>
              <p className="mt-1 text-sm font-medium text-slate-600">{selected.service_name || "—"}</p>
              <p className="mt-3 text-sm text-slate-800">
                {formatWeekdayMonthDayYear(selected.appointment_date)} at{" "}
                {selected.start_time_display || formatTime(selected.start_time)}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Duration · {formatAppointmentDuration(selected.start_time, selected.end_time)}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${drawerStatusBadgeClass(selected.status)}`}
                >
                  {drawerStatusLabel(selected.status)}
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-3">
                {(selected.status === "cancelled" || selected.status === "no_show") && (
                  <p className="text-center text-sm text-slate-500">No actions available</p>
                )}

                {selected.status === "completed" && (
                  <button
                    type="button"
                    onClick={() => openBookNext(selected)}
                    className="w-full rounded-xl bg-[#16a349] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d]"
                  >
                    Book next visit
                  </button>
                )}

                {(selected.status === "booked" || selected.status === "scheduled") && (
                  <button
                    type="button"
                    onClick={() => void handleCheckIn()}
                    disabled={checkingIn}
                    className="w-full rounded-xl bg-[#16a349] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
                  >
                    {checkingIn ? "Completing check-in…" : "Check in"}
                  </button>
                )}
              </div>

              <div className="mt-8 max-w-none border-t border-slate-200 pt-6">
                <label className="block w-full max-w-none">
                  <span className="text-base font-bold uppercase tracking-wide text-slate-900">
                    Chart note for the team (handoff)
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-slate-500">
                    Visible on this patient chart to every provider. Saved on this appointment only.
                  </span>
                  <textarea
                    ref={handoffTextareaRef}
                    value={handoffNotes}
                    onChange={(e) => setHandoffNotes(e.target.value)}
                    disabled={handoffLoading}
                    placeholder={handoffLoading ? "Loading…" : "Reason for follow-up, preferences, reminders…"}
                    rows={1}
                    className="mt-3 box-border min-h-[300px] w-full max-w-none resize-none overflow-hidden rounded-xl border border-slate-200 bg-white px-4 py-3 text-lg leading-[1.6] text-slate-900 shadow-inner placeholder:text-slate-400 focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/20 disabled:bg-slate-50"
                  />
                </label>
                <button
                  type="button"
                  disabled={savingHandoff || handoffLoading || !selected}
                  onClick={() => void saveHandoff()}
                  className="mt-3 min-h-[52px] w-full rounded-xl border border-[#16a349]/40 bg-[#ecfdf5] px-4 py-3 text-base font-semibold text-[#0d5c2e] hover:bg-emerald-100 disabled:opacity-50"
                >
                  {savingHandoff ? "Saving…" : "Save chart note"}
                </button>
              </div>

              <div className="mt-8 border-t border-slate-100 pt-5">
                <Link
                  href={`/doctor/patients/${selected.patient}/history`}
                  className="inline-flex text-sm font-semibold text-[#16a349] hover:text-[#13823d]"
                >
                  View full patient record →
                </Link>
              </div>
            </div>
          </SheetContent>
        ) : null}
      </Sheet>

      <AdminDeskBookFromSlotModal
        open={deskBookSeed !== null}
        seed={deskBookSeed}
        onClose={() => setDeskBookSeed(null)}
        lockProvider
        todayMinIso={todayStr}
        onBooked={() => loadAppointments()}
      />

      {bookNextAppt && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="doctor-schedule-book-next-title"
            >
              <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 id="doctor-schedule-book-next-title" className="text-lg font-bold text-slate-900">
              Book next visit
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Schedule a new appointment for <span className="font-semibold text-slate-800">{bookNextAppt.patient_name}</span>.
            </p>
            {bookNextOptionsLoading ? (
              <p className="mt-4 text-sm text-slate-600">Loading visit types…</p>
            ) : (
              <div className="mt-4 space-y-3">
                <label className="block text-xs font-semibold text-slate-600">
                  Service
                  <select
                    value={bnServiceId || ""}
                    onChange={(e) => {
                      const sid = Number(e.target.value);
                      setBnServiceId(sid);
                      const provs = bookingOptions?.providers_by_service[String(sid)] ?? [];
                      const pid = provs.some((p) => p.id === bookNextAppt.provider) ? bookNextAppt.provider : provs[0]?.id ?? 0;
                      setBnProviderId(pid);
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    {(bookingOptions?.services ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Provider
                  <select
                    value={bnProviderId || ""}
                    onChange={(e) => setBnProviderId(Number(e.target.value))}
                    disabled={!bnServiceId}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    {(bookingOptions?.providers_by_service[String(bnServiceId)] ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.provider_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Date
                  <input
                    type="date"
                    value={bnDate}
                    min={todayStr}
                    onChange={(e) => setBnDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Time
                  {bnSlotsLoading ? (
                    <span className="mt-1 block text-sm font-normal text-slate-500">Loading openings…</span>
                  ) : (
                    <select
                      value={bnSelectedSlot}
                      onChange={(e) => setBnSelectedSlot(e.target.value)}
                      disabled={!bnSlotLabels.length}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      {bnSlotLabels.length === 0 ? (
                        <option value="">No openings — adjust date, service, or provider</option>
                      ) : (
                        bnSlotLabels.map((label, i) => (
                          <option key={`${label}-bn-${i}`} value={bnSlotTimes[i] || label}>
                            {label}
                          </option>
                        ))
                      )}
                    </select>
                  )}
                </label>
              </div>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setBookNextAppt(null);
                  setBookingOptions(null);
                }}
                disabled={savingBookNext}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Close
              </button>
              <button
                type="button"
                disabled={
                  savingBookNext ||
                  bookNextOptionsLoading ||
                  !bnServiceId ||
                  !bnProviderId ||
                  !bnDate ||
                  !bnSelectedSlot ||
                  bnSlotsLoading ||
                  !bnSlotLabels.length
                }
                onClick={() => void submitBookNext()}
                className="rounded-xl bg-[#16a349] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
              >
                {savingBookNext ? "Booking…" : "Confirm booking"}
              </button>
            </div>
            </div>
          </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export default function DoctorSchedulePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center py-16">
          <Loader variant="page" label="Opening schedule" sublabel="One moment…" />
        </div>
      }
    >
      <DoctorSchedulePageInner />
    </Suspense>
  );
}
