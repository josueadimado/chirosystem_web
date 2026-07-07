"use client";

import { AdminMaintenanceNotice } from "@/components/admin-maintenance-notice";
import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { PatientNameWithProfile } from "@/components/patient-payment-profile";
import { HelpTip } from "@/components/help-tip";
import { Loader } from "@/components/loader";
import { AppointmentStatusBadge } from "@/components/status-chip";
import { useScheduleAutoRefresh } from "@/hooks/use-schedule-auto-refresh";
import { apiGetAuth } from "@/lib/api";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type TodayScheduleRow = {
  id: number;
  patient_name: string;
  patient_payment_profile?: string;
  provider_name?: string;
  service_name?: string;
  start_time: string;
  end_time?: string;
  start_minutes?: number;
  status: string;
  auto_no_show?: boolean;
};

type ScheduleDayPart = "morning" | "afternoon" | "evening";

const DAY_PARTS: Array<{ id: ScheduleDayPart; label: string; fromMin: number; untilMin: number }> = [
  { id: "morning", label: "Morning", fromMin: 0, untilMin: 12 * 60 },
  { id: "afternoon", label: "Afternoon", fromMin: 12 * 60, untilMin: 17 * 60 },
  { id: "evening", label: "Evening", fromMin: 17 * 60, untilMin: 24 * 60 },
];

/** Shape of the admin dashboard summary from the API. */
type DashboardSummary = {
  appointments_today: number;
  checked_in: number;
  completed: number;
  no_shows_today?: number;
  daily_revenue: string;
  unpaid_invoices: number;
  today_schedule: TodayScheduleRow[];
  today_display?: string;
  as_of_display?: string;
};

function scheduleRowMinutes(row: TodayScheduleRow): number {
  if (typeof row.start_minutes === "number") return row.start_minutes;
  const m = row.start_time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

function groupScheduleByDayPart(rows: TodayScheduleRow[]): Array<{ part: (typeof DAY_PARTS)[number]; rows: TodayScheduleRow[] }> {
  const buckets = new Map<ScheduleDayPart, TodayScheduleRow[]>();
  for (const part of DAY_PARTS) buckets.set(part.id, []);
  for (const row of rows) {
    const min = scheduleRowMinutes(row);
    const part = DAY_PARTS.find((p) => min >= p.fromMin && min < p.untilMin) ?? DAY_PARTS[DAY_PARTS.length - 1];
    buckets.get(part.id)!.push(row);
  }
  return DAY_PARTS.map((part) => ({ part, rows: buckets.get(part.id) ?? [] })).filter((g) => g.rows.length > 0);
}

function scheduleRowStyles(status: string): string {
  if (status === "no_show") {
    return "border-red-400/90 bg-red-50/90 ring-1 ring-red-300/50 hover:border-red-500 hover:bg-red-50";
  }
  if (status === "cancelled") {
    return "border-slate-200/80 bg-slate-100/70 opacity-75 hover:border-slate-300 hover:bg-slate-100";
  }
  return "border-slate-200/90 bg-white hover:border-[#16a349]/35 hover:bg-[#ecfdf5]/40";
}

function TodayScheduleRowLink({ a }: { a: TodayScheduleRow }) {
  const isNoShow = a.status === "no_show";
  const isCancelled = a.status === "cancelled";
  const timeRange =
    a.end_time && a.end_time !== a.start_time ? `${a.start_time} – ${a.end_time}` : a.start_time;

  return (
    <Link
      href={`/admin/schedule?appointment=${a.id}`}
      className={cn(
        "grid grid-cols-1 items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 text-left transition sm:grid-cols-[minmax(6.5rem,auto)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto]",
        scheduleRowStyles(a.status),
      )}
    >
      <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-slate-800">{timeRange}</span>
      <span className={cn("min-w-0 font-semibold text-slate-900", isCancelled && "line-through decoration-slate-400")}>
        <PatientNameWithProfile
          name={<span className="truncate">{a.patient_name}</span>}
          profile={a.patient_payment_profile}
          compactBadge
        />
      </span>
      <span className="min-w-0 truncate text-[13px] text-slate-600">{a.service_name || "—"}</span>
      <span className="min-w-0 truncate text-[13px] text-slate-500">{a.provider_name || "—"}</span>
      <span className="flex flex-col items-start gap-0.5 justify-self-start sm:items-end sm:justify-self-end">
        <AppointmentStatusBadge status={a.status} size="sm" className="normal-case" />
        {isNoShow && a.auto_no_show ? (
          <span className="text-[10px] font-medium text-red-900/85">Automatic</span>
        ) : null}
      </span>
    </Link>
  );
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const summary = await apiGetAuth<DashboardSummary>("/admin/dashboard_summary/");
      setData(summary);
    } catch (e) {
      if (!opts?.silent) {
        const msg = e instanceof Error ? e.message : "Failed to load dashboard";
        setError(msg);
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useScheduleAutoRefresh({
    enabled: true,
    refresh: () => load({ silent: true }),
  });

  useEffect(() => {
    void load();
  }, [load]);

  const scheduleGroups = useMemo(
    () => (data ? groupScheduleByDayPart(data.today_schedule) : []),
    [data],
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <AdminMaintenanceNotice />
        <AdminPageIntro
          title="Overview"
          description="Today’s visits, revenue, and your full day schedule."
          pageHelp="Numbers refresh when you open or reload this page. Use the links below to jump into the full schedule or billing workflows."
        />
        <Loader variant="page" label="Loading dashboard" sublabel="Summarizing your clinic…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <AdminMaintenanceNotice />
        <AdminPageIntro
          title="Overview"
          description="Today’s visits, revenue, and your full day schedule."
          pageHelp="Numbers refresh when you open or reload this page."
        />
        <div className="admin-panel border-rose-200 bg-rose-50 text-rose-800">
          <p className="text-sm font-medium">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-900 hover:bg-rose-50"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const revenue = parseFloat(data.daily_revenue);
  const formattedRevenue = isNaN(revenue)
    ? data.daily_revenue
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(revenue);

  const scheduleCount = data.today_schedule.length;
  const todayLine =
    data.today_display && data.as_of_display
      ? `${data.today_display} · numbers as of ${data.as_of_display}`
      : data.today_display
        ? data.today_display
        : data.as_of_display
          ? `Numbers as of ${data.as_of_display}`
          : null;

  return (
    <div className="space-y-8">
      <AdminMaintenanceNotice />
      <div className="space-y-2">
        <AdminPageIntro
          title="Overview"
          description="Today’s visits, revenue, and your full day schedule."
          pageHelp={
            <>
              All counts below are for <strong>today’s calendar date</strong> in the clinic’s time zone.{" "}
              <strong>Today&apos;s schedule</strong> lists every visit for the day. Click a row to open it on the full calendar.
            </>
          }
        />
        {todayLine ? <p className="text-sm font-medium text-slate-600">{todayLine}</p> : null}
      </div>

      <nav
        className="flex flex-wrap gap-2 rounded-2xl border border-slate-200/90 bg-slate-50/80 px-3 py-2.5 text-sm shadow-sm ring-1 ring-slate-100/80"
        aria-label="Quick links"
      >
        <span className="mr-1 self-center text-[11px] font-bold uppercase tracking-wide text-slate-400">Jump to</span>
        <Link
          href="/admin/schedule"
          className="rounded-lg bg-white px-3 py-1.5 font-medium text-[#0d5c2e] shadow-sm ring-1 ring-slate-200/80 hover:bg-[#ecfdf5]"
        >
          Schedule
        </Link>
        <Link
          href="/admin/billing"
          className="rounded-lg bg-white px-3 py-1.5 font-medium text-slate-800 shadow-sm ring-1 ring-slate-200/80 hover:bg-slate-50"
        >
          Billing
        </Link>
        <Link
          href="/admin/patients"
          className="rounded-lg bg-white px-3 py-1.5 font-medium text-slate-800 shadow-sm ring-1 ring-slate-200/80 hover:bg-slate-50"
        >
          Patients
        </Link>
        <Link
          href="/admin/services"
          className="rounded-lg bg-white px-3 py-1.5 font-medium text-slate-800 shadow-sm ring-1 ring-slate-200/80 hover:bg-slate-50"
        >
          Services
        </Link>
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Refresh
        </button>
      </nav>

      <div className="stagger-children grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Link
          href="/admin/schedule"
          className="admin-panel !p-4 xl:!p-5 group border-slate-200/90 bg-gradient-to-br from-white to-slate-50/90 ring-slate-200/60 transition hover:border-[#16a349]/35 hover:shadow-md"
        >
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Today · appointments
            <HelpTip label="Appointments today">Active visits today (booked through finished), excluding cancelled and no-show.</HelpTip>
          </p>
          <p className="mt-3 min-w-0 truncate text-4xl font-bold tabular-nums leading-none tracking-tight text-slate-900 group-hover:text-[#0d5c2e]">
            {data.appointments_today}
          </p>
          <p className="mt-2 text-xs font-medium text-[#16a349] opacity-0 transition group-hover:opacity-100">Open schedule →</p>
        </Link>
        <Link
          href="/admin/schedule"
          className="admin-panel !p-4 xl:!p-5 group border-[#16a349]/20 bg-gradient-to-br from-[#ecfdf5]/50 to-white ring-[#16a349]/15 transition hover:border-[#16a349]/40 hover:shadow-md"
        >
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#14532d]/90">
            Today · checked in
            <HelpTip label="Checked in">Patients who completed check-in today (kiosk or staff).</HelpTip>
          </p>
          <p className="mt-3 min-w-0 truncate text-4xl font-bold tabular-nums leading-none tracking-tight text-[#16a349]">{data.checked_in}</p>
          <p className="mt-2 text-xs font-medium text-[#16a349] opacity-0 transition group-hover:opacity-100">Open schedule →</p>
        </Link>
        <Link
          href="/admin/schedule"
          className="admin-panel !p-4 xl:!p-5 group border-sky-200/80 bg-gradient-to-br from-sky-50/70 to-white ring-sky-100/80 transition hover:border-sky-300 hover:shadow-md"
        >
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sky-900/80">
            Today · completed
            <HelpTip label="Completed">Visits marked completed for today.</HelpTip>
          </p>
          <p className="mt-3 min-w-0 truncate text-4xl font-bold tabular-nums leading-none tracking-tight text-sky-800">{data.completed}</p>
          <p className="mt-2 text-xs font-medium text-sky-700 opacity-0 transition group-hover:opacity-100">Open schedule →</p>
        </Link>
        <Link
          href="/admin/schedule"
          className="admin-panel !p-4 xl:!p-5 group border-red-200/80 bg-gradient-to-br from-red-50/80 to-white ring-red-100/80 transition hover:border-red-400 hover:shadow-md"
        >
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-red-950/90">
            Today · no-shows
            <HelpTip label="No-shows today">Missed visits today, including automatic no-shows after the grace period.</HelpTip>
          </p>
          <p className="mt-3 min-w-0 truncate text-4xl font-bold tabular-nums leading-none tracking-tight text-red-700">
            {data.no_shows_today ?? 0}
          </p>
          <p className="mt-2 text-xs font-medium text-red-800 opacity-0 transition group-hover:opacity-100">Open schedule →</p>
        </Link>
        <Link
          href="/admin/billing"
          className="admin-panel !p-4 xl:!p-5 group border-emerald-200/50 bg-gradient-to-br from-emerald-50/40 to-white transition hover:border-emerald-300 hover:shadow-md"
        >
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Today · revenue
            <HelpTip label="Daily revenue">Total from invoices marked paid today (clinic date).</HelpTip>
          </p>
          <p className="mt-3 min-w-0 truncate text-2xl font-bold tabular-nums leading-none tracking-tight text-slate-900 sm:text-3xl group-hover:text-[#0d5c2e]">
            {formattedRevenue}
          </p>
          <p className="mt-2 text-xs font-medium text-[#16a349] opacity-0 transition group-hover:opacity-100">Open billing →</p>
        </Link>
        <Link
          href="/admin/billing"
          className="admin-panel !p-4 xl:!p-5 group border-amber-200/60 bg-gradient-to-br from-amber-50/50 to-white transition hover:border-amber-300 hover:shadow-md sm:col-span-2 lg:col-span-1"
        >
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-950/80">
            Pending invoices
            <HelpTip label="Pending invoices">Issued invoices not yet paid — follow up in Billing.</HelpTip>
          </p>
          <p className="mt-3 min-w-0 truncate text-4xl font-bold tabular-nums leading-none tracking-tight text-amber-950">{data.unpaid_invoices}</p>
          <p className="mt-2 text-xs font-medium text-amber-800 opacity-0 transition group-hover:opacity-100">Collect in billing →</p>
        </Link>
      </div>

      <section className="admin-panel">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <AdminSectionLabel help="Every visit today, grouped by time of day. Cancelled visits appear faded; no-shows in red.">
              Today&apos;s schedule
            </AdminSectionLabel>
            {scheduleCount > 0 ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-700">
                {scheduleCount} visit{scheduleCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          <Link
            href="/admin/schedule"
            className="text-[14px] font-medium leading-normal text-[#16a349] hover:text-[#13823d] hover:underline"
          >
            Open day grid →
          </Link>
        </div>

        {scheduleCount === 0 ? (
          <div className="flex flex-col justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-10 text-center">
            <p className="text-[15px] font-medium text-slate-800">No appointments on the calendar for today.</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">Book from the schedule or confirm you picked the right date.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link
                href="/admin/schedule"
                className="rounded-xl bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d]"
              >
                Open schedule
              </Link>
              <Link
                href="/admin/patients"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Find a patient
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="hidden rounded-lg border border-slate-200/80 bg-slate-50/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:grid sm:grid-cols-[minmax(6.5rem,auto)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] sm:gap-x-4">
              <span>Time</span>
              <span>Patient</span>
              <span>Service</span>
              <span>Provider</span>
              <span className="text-right">Status</span>
            </div>
            {scheduleGroups.map(({ part, rows }) => (
              <div key={part.id}>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{part.label}</h3>
                  <span className="text-xs tabular-nums text-slate-400">
                    {rows.length} visit{rows.length === 1 ? "" : "s"}
                  </span>
                  <div className="h-px flex-1 bg-slate-200/80" aria-hidden />
                </div>
                <div className="space-y-2">
                  {rows.map((a) => (
                    <TodayScheduleRowLink key={a.id} a={a} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
