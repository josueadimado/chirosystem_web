"use client";

import {
  AdminScheduleCalendar,
  navigateFocusDate,
  schedulePeriodLabel,
  type ProviderBlock,
  type ScheduleAppointment,
} from "@/components/admin-schedule-calendar";
import type { DeskBookSlotSeed } from "@/components/admin-desk-book-from-slot-modal";
import dynamic from "next/dynamic";

// Modals are only needed when the user opens them — load them lazily.
const AdminDeskBookFromSlotModal = dynamic(
  () =>
    import("@/components/admin-desk-book-from-slot-modal").then((m) => ({
      default: m.AdminDeskBookFromSlotModal,
    })),
  { ssr: false },
);
import { DoctorPageIntro, DoctorSectionLabel } from "@/components/doctor-shell";
import { useAppFeedback } from "@/components/app-feedback";
import { HelpTip } from "@/components/help-tip";
import { Loader } from "@/components/loader";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ApiError, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import {
  addDays,
  endOfMonth,
  filterAppointmentsForScheduleGrid,
  minutesToApiTime,
  mondayOfWeekContaining,
  parseTimeToMinutes,
  scheduleRangeIncludesToday,
  startOfMonth,
  toIsoDate,
} from "@/lib/admin-schedule-utils";
import { useScheduleAutoRefresh } from "@/hooks/use-schedule-auto-refresh";
const BookNextVisitModal = dynamic(
  () =>
    import("@/components/visit-panel/book-next-visit-modal").then((m) => ({
      default: m.BookNextVisitModal,
    })),
  { ssr: false },
);

const RescheduleVisitSlotsModal = dynamic(
  () =>
    import("@/components/visit-panel/reschedule-visit-slots-modal").then((m) => ({
      default: m.RescheduleVisitSlotsModal,
    })),
  { ssr: false },
);
import { VisitDoctorScheduleActions } from "@/components/visit-panel/visit-doctor-schedule-actions";
import { VisitPanelPatientFooter } from "@/components/visit-panel/visit-panel-patient-footer";
import { VisitBirthdayReminder } from "@/components/visit-panel/visit-birthday-reminder";
import { VisitSummaryHeader } from "@/components/visit-panel/visit-summary-header";
import { VisitAppointmentStaffNotes } from "@/components/visit-panel/visit-appointment-staff-notes";
import { VisitPriorChartNotes } from "@/components/visit-panel/visit-prior-chart-notes";
import { useAppointmentActionConfirm } from "@/hooks/use-appointment-action-confirm";
import { useBookNextVisit } from "@/hooks/use-book-next-visit";
import { usePatientQuickContact } from "@/hooks/use-patient-quick-contact";
import { useRescheduleVisitSlots } from "@/hooks/use-reschedule-visit-slots";
import { appointmentBlocksDeskActions, effectiveAppointmentStatus } from "@/lib/visit-status-utils";
import {
  confirmBookNextVisit,
  confirmCancelVisit,
  confirmDeskBook,
  confirmDragReschedule,
  confirmRescheduleBySlots,
} from "@/lib/appointment-action-confirm-messages";
import { clinicTodayIso, formatWeekdayMonthDayYear } from "@/lib/format-date";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Persisted: "1" = show month picker, Google Calendar, waitlist; "0" = full-width schedule. */
const DOCTOR_SCHEDULE_TOOLS_KEY = "doctor_schedule_tools_open";

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
  display_status?: string;
  invoice_kind?: string | null;
  auto_no_show_processed_at?: string | null;
  reason_for_visit?: string;
  patient_date_of_birth?: string | null;
};

type ScheduleViewMode = "day" | "week" | "month";

function appointmentUiStatus(row: { status: string; display_status?: string; invoice_kind?: string | null }): string {
  return row.display_status ?? effectiveAppointmentStatus(row.status, row.invoice_kind);
}

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
  const { runWithFeedback, toast } = useAppFeedback();
  const { requestConfirm, ConfirmDialog } = useAppointmentActionConfirm();
  const searchParams = useSearchParams();
  const [providerId, setProviderId] = useState<number | null>(null);
  const [providerName, setProviderName] = useState("");
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [blocks, setBlocks] = useState<ProviderBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<ScheduleViewMode>("day");
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [selected, setSelected] = useState<AppointmentRow | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [appointmentSaving, setAppointmentSaving] = useState(false);

  const [handoffNotes, setHandoffNotes] = useState("");
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [savingHandoff, setSavingHandoff] = useState(false);

  const [deskBookSeed, setDeskBookSeed] = useState<DeskBookSlotSeed | null>(null);

  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null);
  const [calendarNote, setCalendarNote] = useState("");
  const [calendarBusy, setCalendarBusy] = useState(false);

  const [toolsOpen, setToolsOpen] = useState(true);

  const navSigRef = useRef<{ view: ScheduleViewMode; focusMs: number } | null>(null);
  const openedFromUrlRef = useRef<number | null>(null);
  const pendingAppointmentIdRef = useRef<number | null>(null);
  const todayStr = clinicTodayIso();

  const bookNext = useBookNextVisit({
    todayMinIso: todayStr,
    preferredProviderId: providerId,
    onBooked: () => loadAppointments(),
    confirmBeforeSubmit: async (ctx) =>
      requestConfirm(
        confirmBookNextVisit(
          ctx.patientLabel,
          ctx.serviceName,
          ctx.dateIso,
          ctx.timeLabel,
          ctx.providerName,
        ),
      ),
  });
  const rescheduleVisit = useRescheduleVisitSlots({
    todayMinIso: todayStr,
    providerId,
    defaultDateIso: toIsoDate(focusDate),
    onRescheduled: () => loadAppointments(),
    confirmBeforeSubmit: async (ctx) =>
      requestConfirm(
        confirmRescheduleBySlots(ctx.patientLabel, ctx.dateIso, ctx.timeLabel),
      ),
  });
  const { contact: patientContact, loading: patientContactLoading } = usePatientQuickContact(
    selected?.patient ?? null,
  );

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

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DOCTOR_SCHEDULE_TOOLS_KEY);
      if (stored === "0") setToolsOpen(false);
    } catch {
      /* ignore */
    }
  }, []);

  const setToolsOpenPersist = useCallback((open: boolean) => {
    setToolsOpen(open);
    try {
      localStorage.setItem(DOCTOR_SCHEDULE_TOOLS_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const loadAppointments = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (providerId == null) return;
      if (!opts?.silent) {
        setLoading(true);
        setError("");
      }
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
        if (!opts?.silent) {
          setError(e instanceof ApiError ? e.message : "Failed to load schedule.");
          setAppointments([]);
        }
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [providerId, view, focusDate],
  );

  const scheduleRangeHasToday = useMemo(() => {
    const { from, to } = blockListRange(view, focusDate);
    return scheduleRangeIncludesToday(from, to);
  }, [view, focusDate]);

  useScheduleAutoRefresh({
    enabled: scheduleRangeHasToday && providerId != null,
    refresh: () => loadAppointments({ silent: true }),
  });

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
    const raw = searchParams.get("appointment");
    if (!raw) return;
    const id = Number.parseInt(raw, 10);
    if (!Number.isNaN(id)) pendingAppointmentIdRef.current = id;
  }, [searchParams]);

  useEffect(() => {
    const id = pendingAppointmentIdRef.current;
    if (id == null || providerId == null) return;

    const ap = appointments.find((a) => a.id === id);
    if (ap) {
      if (openedFromUrlRef.current !== ap.id) {
        openedFromUrlRef.current = ap.id;
        setSelected(ap);
      }
      pendingAppointmentIdRef.current = null;
      return;
    }

    if (loading) return;

    let cancelled = false;
    void apiGetAuth<AppointmentRow>(`/appointments/${id}/`)
      .then((row) => {
        if (cancelled) return;
        setFocusDate(new Date(`${row.appointment_date}T12:00:00`));
        setView("day");
      })
      .catch(() => {
        if (!cancelled) pendingAppointmentIdRef.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [appointments, providerId, loading, toast]);

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

  const handleCheckIn = async () => {
    if (!selected || appointmentBlocksDeskActions(selected.status)) return;
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
          successMessage: "Reminders & handoff saved.",
          errorFallback: "Could not save chart note.",
        },
      );
    } finally {
      setSavingHandoff(false);
    }
  };

  const openReschedule = (appt: AppointmentRow) => {
    rescheduleVisit.open({
      id: appt.id,
      patientLabel: appt.patient_name,
      appointmentDate: appt.appointment_date,
      startTimeDisplay: appt.start_time_display || formatTime(appt.start_time),
      endTimeDisplay: appt.end_time_display || formatTime(appt.end_time),
      serviceLabel: appt.service_name,
      bookedServiceId: appt.booked_service,
      startTimeIso: appt.start_time,
    });
  };

  const openBookNext = (appt: AppointmentRow) => {
    bookNext.open({
      id: appt.id,
      patientLabel: appt.patient_name,
      appointmentDate: appt.appointment_date,
      bookedServiceId: appt.booked_service,
      providerId: appt.provider,
    });
  };

  const patchAppointmentStatus = async (id: number, status: "cancelled" | "no_show") => {
    setAppointmentSaving(true);
    try {
      await runWithFeedback(
        async () => {
          await apiPatch(`/appointments/${id}/`, { status });
          await loadAppointments();
          setSelected((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
        },
        {
          loadingMessage: status === "cancelled" ? "Cancelling…" : "Updating…",
          successMessage: status === "cancelled" ? "Appointment cancelled." : "Marked as no-show.",
          errorFallback: status === "cancelled" ? "Could not cancel." : "Could not update this visit.",
        },
      );
    } finally {
      setAppointmentSaving(false);
    }
  };

  const handleNoShow = (appt: AppointmentRow) => {
    void patchAppointmentStatus(appt.id, "no_show");
  };

  const handleCancel = (appt: AppointmentRow) => {
    void patchAppointmentStatus(appt.id, "cancelled");
  };

  const canRescheduleOnCalendar = (s: string) =>
    s !== "completed" && s !== "no_show" && s !== "cancelled";

  const handleRescheduleFromGrid = async (pick: {
    appointment: ScheduleAppointment;
    providerId: number;
    providerName: string;
    dateIso: string;
    startMinute: number;
  }) => {
    const { appointment, providerId, providerName: pickProviderName, dateIso, startMinute } = pick;
    const uiStatus = appointmentUiStatus(appointment);
    if (!canRescheduleOnCalendar(uiStatus)) {
      toast.error("This visit cannot be moved from the calendar.");
      return;
    }
    const body: Record<string, unknown> = {
      appointment_date: dateIso,
      start_time: minutesToApiTime(startMinute),
    };
    if (providerId !== appointment.provider) {
      body.provider = providerId;
    }
    const ok = await requestConfirm(
      confirmDragReschedule(
        appointment.patient_name,
        dateIso,
        startMinute,
        pickProviderName || providerName || `Provider ${providerId}`,
      ),
    );
    if (!ok) return;
    setAppointmentSaving(true);
    try {
      await runWithFeedback(
        async () => {
          await apiPatch(`/appointments/${appointment.id}/`, body);
          await loadAppointments();
          setSelected((prev) =>
            prev && prev.id === appointment.id
              ? {
                  ...prev,
                  appointment_date: dateIso,
                  start_time: minutesToApiTime(startMinute),
                  provider: providerId,
                }
              : prev,
          );
        },
        {
          loadingMessage: "Moving appointment…",
          successMessage: "Appointment moved on the calendar.",
          errorFallback: "Could not move this appointment — the slot may be taken or outside booking rules.",
        },
      );
    } finally {
      setAppointmentSaving(false);
    }
  };

  const scheduleAppts = useMemo(() => filterAppointmentsForScheduleGrid(appointments), [appointments]);

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

  const scheduleToolsSidebar = (
    <aside id="doctor-schedule-tools" className="space-y-4" aria-label="Schedule tools">
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
  );

  return (
    <div
      className={
        toolsOpen
          ? "grid gap-6 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)] lg:gap-8"
          : "grid gap-6 lg:grid-cols-1"
      }
    >
      {toolsOpen ? scheduleToolsSidebar : null}

      <div className="min-w-0 space-y-6">
        <DoctorPageIntro
          eyebrow="Planning"
          title="Your schedule"
          description="Your assigned visits on the same time grid as the front desk: duration-sized blocks, open gaps, and today’s time line. Only your appointments load."
          pageHelp={
            <>
              Use <strong>Day</strong> for the detailed time grid, <strong>Week</strong> for Monday–Friday columns, <strong>Month</strong>{" "}
              for counts. Click a block to open the patient chart drawer (not a small popup). On <strong>Day</strong> view you can book
              into open time or into a <strong>cancelled</strong> slot — click the open white space or the red cancelled block, then pick
              patient and service (same as the front desk).
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
          <button
            type="button"
            onClick={() => setToolsOpenPersist(!toolsOpen)}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            aria-expanded={toolsOpen}
            aria-controls="doctor-schedule-tools"
          >
            {toolsOpen ? (
              <>
                <PanelLeftClose className="h-4 w-4 text-slate-500" aria-hidden />
                Hide tools
              </>
            ) : (
              <>
                <PanelLeftOpen className="h-4 w-4 text-slate-500" aria-hidden />
                Show tools
              </>
            )}
          </button>
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
              onPickOpenSlot={view === "day" || view === "week" ? (pick) => setDeskBookSeed(pick) : undefined}
              onRescheduleAppointment={
                view === "day" || view === "week"
                  ? (pick) => void handleRescheduleFromGrid(pick)
                  : undefined
              }
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
            <VisitSummaryHeader
              patientName={selected.patient_name}
              serviceName={selected.service_name}
              dateTimeLabel={`${formatWeekdayMonthDayYear(selected.appointment_date)} at ${selected.start_time_display || formatTime(selected.start_time)}`}
              durationLabel={formatAppointmentDuration(selected.start_time, selected.end_time)}
              providerName={selected.provider_name}
              providerColor="#16a349"
              status={appointmentUiStatus(selected)}
              appointmentId={selected.id}
              reasonForVisit={selected.reason_for_visit}
            />

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <VisitBirthdayReminder
                appointmentDate={selected.appointment_date}
                patientDateOfBirth={selected.patient_date_of_birth}
                className="mb-4"
              />
              <VisitDoctorScheduleActions
                patientName={selected.patient_name}
                requestConfirm={requestConfirm}
                status={selected.status}
                displayStatus={selected.display_status}
                invoiceKind={selected.invoice_kind}
                autoNoShowProcessedAt={selected.auto_no_show_processed_at}
                checkingIn={checkingIn}
                saving={appointmentSaving}
                serviceType={selected.service_type}
                appointmentDate={selected.appointment_date}
                startTime={selected.start_time}
                onCheckIn={() => void handleCheckIn()}
                onReschedule={() => openReschedule(selected)}
                onBookNext={() => openBookNext(selected)}
                onNoShow={() => handleNoShow(selected)}
                onCancel={() => handleCancel(selected)}
              />

              <div className="mt-6 space-y-4 border-t border-slate-200 pt-6">
                <VisitPriorChartNotes appointmentId={selected.id} />
                <VisitAppointmentStaffNotes
                  value={handoffNotes}
                  onChange={setHandoffNotes}
                  onSave={() => void saveHandoff()}
                  saving={savingHandoff}
                  loading={handoffLoading}
                  savePathLabel="you and the front desk"
                />
              </div>

            </div>

            <VisitPanelPatientFooter
              loading={patientContactLoading}
              phone={patientContact?.phone}
              email={patientContact?.email}
              dateOfBirth={selected.patient_date_of_birth ?? patientContact?.date_of_birth}
              profileHref={`/doctor/patients/${selected.patient}/record`}
              profileLabel="View full patient record →"
            />
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
        confirmBeforeSubmit={async (ctx) =>
          requestConfirm(
            confirmDeskBook(
              ctx.patientName,
              ctx.serviceName,
              ctx.dateIso,
              ctx.timeLabel,
              ctx.providerName,
            ),
          )
        }
      />

      <ConfirmDialog />

      <RescheduleVisitSlotsModal reschedule={rescheduleVisit} titleId="doctor-schedule-reschedule-title" />
      <BookNextVisitModal
        bookNext={bookNext}
        titleId="doctor-schedule-book-next-title"
        showDeskHoursHint={false}
      />
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
