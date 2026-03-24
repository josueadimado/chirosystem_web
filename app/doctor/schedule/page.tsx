"use client";

import { useAppFeedback } from "@/components/app-feedback";
import { DoctorPageIntro, DoctorSectionLabel } from "@/components/doctor-shell";
import { HelpTip } from "@/components/help-tip";
import { IconChevronLeft, IconChevronRight } from "@/components/icons";
import { Loader } from "@/components/loader";
import { PatientDetailModal } from "@/components/patient-detail-modal";
import { ApiError, apiGetAuth, apiPost } from "@/lib/api";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

type Appointment = {
  id: number;
  patient: string;
  patient_id: number;
  service: string;
  start_time: string;
  end_time: string;
  status: string;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type CalendarStatus = { oauth_configured: boolean; connected: boolean };

function DoctorSchedulePageInner() {
  const { runWithFeedback } = useAppFeedback();
  const searchParams = useSearchParams();
  const [appointmentsByDate, setAppointmentsByDate] = useState<Record<string, Appointment[]>>({});
  const [loading, setLoading] = useState(true);
  const [patientDetailId, setPatientDetailId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null);
  const [calendarNote, setCalendarNote] = useState("");
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return d;
  });

  const loadWeek = async () => {
    setLoading(true);
    setError("");
    const results: Record<string, Appointment[]> = {};
    try {
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        const dateStr = d.toISOString().slice(0, 10);
        const appts = await apiGetAuth<Appointment[]>(`/doctor/appointments/?date=${dateStr}`);
        results[dateStr] = appts;
      }
      setAppointmentsByDate(results);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load schedule.");
      setAppointmentsByDate({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWeek();
  }, [weekStart]);

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

  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  };

  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  };

  const goToday = () => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    setWeekStart(d);
    setSelectedDate(new Date());
  };

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const todayStr = new Date().toISOString().slice(0, 10);

  const weekApptCount = useMemo(() => {
    return Object.values(appointmentsByDate).reduce((n, list) => n + list.length, 0);
  }, [appointmentsByDate]);
  const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const firstDay = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
  const startPad = firstDay.getDay();
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = i - startPad + 1;
    if (d < 1) return null;
    const total = daysInMonth(weekStart.getFullYear(), weekStart.getMonth());
    if (d > total) return null;
    return d;
  });

  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <div className="doctor-panel p-4">
          <DoctorSectionLabel help="Pick a day to highlight it for the larger week grid. Arrows on the main view still move by week.">
            Month
          </DoctorSectionLabel>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-slate-800">
              {MONTHS[weekStart.getMonth()]} {weekStart.getFullYear()}
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
                    const date = new Date(weekStart.getFullYear(), weekStart.getMonth(), d);
                    setSelectedDate(date);
                  }
                }}
                className={`rounded py-1.5 text-sm ${
                  d === null
                    ? "invisible"
                    : `${weekStart.getMonth() === selectedDate.getMonth() && selectedDate.getDate() === d ? "bg-[#16a349] text-white" : "hover:bg-slate-100"}`
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
          description="Browse the week, jump to today, and open a patient chart from any slot. Only appointments assigned to you are shown."
          pageHelp={
            <>
              The <strong>main grid</strong> is always your week at a glance. Day and month toggles change how much you see; clicking a
              patient opens their chart. Calendar sync is optional and separate from this view.
            </>
          }
        />

        {error && <p className="rounded-xl bg-rose-100 p-3 text-sm font-medium text-rose-800">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <HelpTip label="Week navigation" tone="emerald">
              Today snaps the week view to the current week. Arrows move backward or forward one week at a time.
            </HelpTip>
            <button
              type="button"
              onClick={goToday}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-[#16a349]/30 hover:bg-emerald-50/50"
            >
              Today
            </button>
            <button
              type="button"
              onClick={prevWeek}
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-50"
              aria-label="Previous week"
            >
              <IconChevronLeft className="h-5 w-5" />
            </button>
            <span className="min-w-[160px] text-center text-sm font-semibold text-slate-800">
              {weekDates[0].toLocaleDateString("en-US", { month: "short" })} {weekDates[0].getDate()} –{" "}
              {weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
            <button
              type="button"
              onClick={nextWeek}
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-50"
              aria-label="Next week"
            >
              <IconChevronRight className="h-5 w-5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <HelpTip label="Day, week, month" align="center" tone="emerald">
              Switches the density of the main calendar. Week is the default columns you see below; day and month narrow or widen the
              time horizon (behavior follows the buttons you select).
            </HelpTip>
            <div className="flex gap-1 rounded-xl border border-slate-200/90 bg-slate-50/50 p-1">
            {(["day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition ${
                  view === v
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {v}
              </button>
            ))}
            </div>
          </div>
        </div>

        {!loading && (
          <p className="text-sm text-slate-500">
            <span className="font-medium text-slate-700">{weekApptCount}</span> appointment
            {weekApptCount === 1 ? "" : "s"} this week
          </p>
        )}

        {loading ? (
          <div className="doctor-panel flex min-h-[280px] items-center justify-center py-12">
            <Loader variant="page" label="Loading your week" sublabel="Pulling appointments…" />
          </div>
        ) : (
          <div className="doctor-panel overflow-hidden p-0">
            <div className="grid grid-cols-7 border-b border-slate-200/90 bg-slate-50/80">
              {weekDates.map((d) => (
                <div
                  key={d.toISOString()}
                  className={`border-r border-slate-200/80 p-3 text-center last:border-r-0 ${
                    d.toISOString().slice(0, 10) === todayStr ? "bg-[#16a349]/12" : ""
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{DAYS[d.getDay()]}</p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{d.getDate()}</p>
                </div>
              ))}
            </div>
            <div className="grid min-h-[260px] grid-cols-7 divide-x divide-slate-200/80 bg-white">
              {weekDates.map((d) => {
                const dateStr = d.toISOString().slice(0, 10);
                const appts = appointmentsByDate[dateStr] ?? [];
                return (
                  <div key={dateStr} className="min-h-[220px] p-2">
                    {appts.length === 0 ? (
                      <p className="pt-3 text-center text-[11px] font-medium uppercase tracking-wide text-slate-300">
                        —
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {appts.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setPatientDetailId(a.patient_id)}
                            className="w-full rounded-xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 p-2.5 text-left text-xs shadow-sm transition hover:border-[#16a349]/35 hover:shadow-md"
                          >
                            <p className="font-semibold text-[#0d5c2e]">{a.start_time}</p>
                            <p className="truncate font-medium text-slate-800">{a.patient}</p>
                            {a.service ? <p className="truncate text-slate-500">{a.service}</p> : null}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {patientDetailId && (
        <PatientDetailModal
          patientId={patientDetailId}
          onClose={() => setPatientDetailId(null)}
        />
      )}
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
