"use client";

import { AdminMaintenanceNotice } from "@/components/admin-maintenance-notice";
import { Loader } from "@/components/loader";
import { PatientNameWithProfile } from "@/components/patient-payment-profile";
import { AppointmentStatusBadge } from "@/components/status-chip";
import { useScheduleAutoRefresh } from "@/hooks/use-schedule-auto-refresh";
import { apiGetAuth } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Calendar,
  CalendarPlus,
  CheckCircle2,
  Filter,
  HelpCircle,
  Mail,
  Search,
  Stethoscope,
  UserCheck,
  UserPlus,
  UserX,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

type TodayScheduleRow = {
  id: number;
  patient_name: string;
  patient_payment_profile?: string;
  patient_iris_tag?: boolean;
  provider_name?: string;
  service_name?: string;
  start_time: string;
  end_time?: string;
  start_minutes?: number;
  status: string;
  auto_no_show?: boolean;
};

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

type StatTone = "primary" | "green" | "consult" | "red" | "grey";

function DashboardStatCard({
  label,
  value,
  href,
  icon,
  tone = "primary",
}: {
  label: string;
  value: string | number;
  href: string;
  icon: ReactNode;
  tone?: StatTone;
}) {
  const iconWrap: Record<StatTone, string> = {
    primary: "bg-[#ecfdf5] text-[#16a349]",
    green: "bg-[#f0fdf4] text-[#166534]",
    consult: "bg-[#fef3c7] text-[#92400e]",
    red: "bg-[#fee2e2] text-[#991b1b]",
    grey: "bg-[#f3f4f6] text-[#4b5563]",
  };

  return (
    <Link
      href={href}
      className="group flex min-w-0 flex-1 items-center gap-4 rounded-lg border border-[#d1e8d8] bg-white px-5 py-4 transition hover:border-[#16a349]/40 hover:shadow-sm"
    >
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", iconWrap[tone])}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="truncate text-2xl font-bold leading-none tabular-nums text-[#0d1f14]">{value}</p>
        <p className="mt-1 truncate text-xs text-[#5a7a62]">{label}</p>
      </div>
    </Link>
  );
}

function TodayScheduleRowLink({ a }: { a: TodayScheduleRow }) {
  const isNoShow = a.status === "no_show";
  const isCancelled = a.status === "cancelled";
  const isActive = a.status === "in_consultation";
  const timeRange =
    a.end_time && a.end_time !== a.start_time ? `${a.start_time} – ${a.end_time}` : a.start_time;

  return (
    <Link
      href={`/admin/schedule?appointment=${a.id}`}
      className={cn(
        "grid grid-cols-1 items-center gap-x-4 gap-y-2 border-b border-[#d1e8d8] px-5 py-3.5 text-left transition last:border-b-0 hover:bg-[#f8fdf9] sm:grid-cols-[5rem_minmax(0,1.3fr)_11rem_9rem_9rem_auto]",
        isActive && "bg-[#ecfdf5]",
        isNoShow && "bg-red-50/70",
        isCancelled && "bg-slate-50/80 opacity-80",
      )}
    >
      <span className="shrink-0 text-sm font-medium tabular-nums text-[#0d1f14]">{timeRange}</span>
      <span className={cn("min-w-0 font-semibold text-[#0d1f14]", isCancelled && "line-through decoration-slate-400")}>
        <PatientNameWithProfile
          name={<span className="truncate">{a.patient_name}</span>}
          profile={a.patient_payment_profile}
          irisTag={a.patient_iris_tag}
          compactBadge
        />
      </span>
      <span className="min-w-0 truncate text-sm text-[#5a7a62]">{a.service_name || "—"}</span>
      <span className="min-w-0 truncate text-sm text-[#5a7a62]">{a.provider_name || "—"}</span>
      <span className="flex flex-col items-start gap-0.5">
        <AppointmentStatusBadge status={a.status} size="sm" className="normal-case" />
        {isNoShow && a.auto_no_show ? (
          <span className="text-[10px] font-medium text-red-900/85">Automatic</span>
        ) : null}
      </span>
      <span className="text-xs font-semibold text-[#16a349] sm:justify-self-end">View</span>
    </Link>
  );
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

  const derivedCounts = useMemo(() => {
    const rows = data?.today_schedule ?? [];
    return {
      total: rows.length,
      inConsultation: rows.filter((a) => a.status === "in_consultation").length,
      cancelled: rows.filter((a) => a.status === "cancelled").length,
    };
  }, [data]);

  const filteredSchedule = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.today_schedule;
    return data.today_schedule.filter(
      (a) =>
        a.patient_name.toLowerCase().includes(q) ||
        (a.service_name || "").toLowerCase().includes(q) ||
        (a.provider_name || "").toLowerCase().includes(q) ||
        a.status.toLowerCase().includes(q),
    );
  }, [data, search]);

  if (loading) {
    return (
      <div className="space-y-6">
        <AdminMaintenanceNotice />
        <Loader variant="page" label="Loading dashboard" sublabel="Summarizing your clinic…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <AdminMaintenanceNotice />
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
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

  const scheduleCount = filteredSchedule.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <AdminMaintenanceNotice />

      {/* One Banani-style stats row — stretch across full width */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <DashboardStatCard
          label="Total Appointments"
          value={derivedCounts.total}
          href="/admin/schedule"
          tone="primary"
          icon={<Calendar className="h-[18px] w-[18px]" />}
        />
        <DashboardStatCard
          label="Checked In"
          value={data.checked_in}
          href="/admin/schedule"
          tone="green"
          icon={<UserCheck className="h-[18px] w-[18px]" />}
        />
        <DashboardStatCard
          label="In Consultation"
          value={derivedCounts.inConsultation}
          href="/admin/schedule"
          tone="consult"
          icon={<Stethoscope className="h-[18px] w-[18px]" />}
        />
        <DashboardStatCard
          label="Completed"
          value={data.completed}
          href="/admin/schedule"
          tone="green"
          icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
        />
        <DashboardStatCard
          label="No-shows"
          value={data.no_shows_today ?? 0}
          href="/admin/schedule"
          tone="red"
          icon={<UserX className="h-[18px] w-[18px]" />}
        />
        <DashboardStatCard
          label="Cancelled"
          value={derivedCounts.cancelled}
          href="/admin/schedule"
          tone="grey"
          icon={<XCircle className="h-[18px] w-[18px]" />}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row">
        {/* Appointment list */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#d1e8d8] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d1e8d8] px-5 py-4">
            <h3 className="text-base font-semibold text-[#0d1f14]">Today&apos;s Appointments — All Providers</h3>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-[#d1e8d8] bg-[#f4fbf7] px-3 py-1.5">
                <Search className="h-3.5 w-3.5 text-[#5a7a62]" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-36 bg-transparent text-xs text-[#0d1f14] outline-none placeholder:text-[#5a7a62] sm:w-44"
                />
              </label>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#d1e8d8] bg-white px-3 py-1.5 text-xs font-medium text-[#5a7a62]"
                title="Search filters the list as you type"
              >
                <Filter className="h-3.5 w-3.5" />
                Filter
              </button>
            </div>
          </div>

          <div className="hidden border-b border-[#d1e8d8] bg-[#f8fdf9] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#5a7a62] sm:grid sm:grid-cols-[5rem_minmax(0,1.3fr)_11rem_9rem_9rem_auto] sm:gap-x-4">
            <span>Time</span>
            <span>Patient</span>
            <span>Visit type</span>
            <span>Provider</span>
            <span>Status</span>
            <span />
          </div>

          {scheduleCount === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-5 py-14 text-center">
              <p className="text-[15px] font-medium text-[#0d1f14]">
                {data.today_schedule.length === 0
                  ? "No appointments on the calendar for today."
                  : "No visits match this search."}
              </p>
              <p className="mt-2 text-sm text-[#5a7a62]">
                {data.today_schedule.length === 0
                  ? "Book from the schedule or confirm you picked the right date."
                  : "Try a different name, service, or provider."}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Link
                  href="/admin/schedule"
                  className="rounded-xl bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d]"
                >
                  Open schedule
                </Link>
                <Link
                  href="/admin/patients"
                  className="rounded-xl border border-[#d1e8d8] bg-white px-4 py-2.5 text-sm font-semibold text-[#0d1f14] hover:bg-[#f8fdf9]"
                >
                  Find a patient
                </Link>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filteredSchedule.map((a) => (
                <TodayScheduleRowLink key={a.id} a={a} />
              ))}
            </div>
          )}
        </section>

        {/* Quick Actions — Banani right panel */}
        <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-[#d1e8d8] bg-white xl:w-80">
          <div className="border-b border-[#d1e8d8] px-5 py-4">
            <h3 className="text-base font-semibold text-[#0d1f14]">Quick Actions</h3>
            <p className="mt-0.5 text-xs text-[#5a7a62]">Fast access to common tasks</p>
          </div>

          <div className="flex flex-1 flex-col gap-3 p-5">
            <Link
              href="/admin/schedule"
              className="flex items-center gap-3 rounded-lg border border-[#16a349] bg-[#16a349] px-4 py-4 text-left text-sm font-semibold text-white hover:bg-[#13823d]"
            >
              <CalendarPlus className="h-[18px] w-[18px] shrink-0" />
              New Appointment
            </Link>
            <Link
              href="/admin/patients"
              className="flex items-center gap-3 rounded-lg border border-[#ecfdf5] bg-[#ecfdf5] px-4 py-4 text-left text-sm font-semibold text-[#0d5c2e] hover:bg-[#d1fae5]"
            >
              <UserPlus className="h-[18px] w-[18px] shrink-0" />
              Add Patient
            </Link>
            <Link
              href="/admin/intake"
              className="flex items-center gap-3 rounded-lg border border-[#d1e8d8] bg-white px-4 py-4 text-left text-sm font-semibold text-[#0d1f14] hover:bg-[#f8fdf9]"
            >
              <Mail className="h-[18px] w-[18px] shrink-0" />
              Send Intake Link
            </Link>

            <div className="my-2 h-px bg-[#d1e8d8]" />

            <div className="rounded-lg border border-[#d1e8d8] bg-[#f8fdf9] p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#5a7a62]">Clinic status</p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#0d1f14]">Open</span>
                <span className="h-2 w-2 rounded-full bg-[#16a349]" />
              </div>
              <p className="mt-1 text-xs text-[#5a7a62]">
                {data.checked_in} checked in · {derivedCounts.inConsultation} in consult
              </p>
            </div>

            <div className="rounded-lg border border-[#d1e8d8] bg-[#f8fdf9] p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#5a7a62]">Money today</p>
              <p className="text-sm font-semibold text-[#0d1f14]">{formattedRevenue} collected</p>
              <Link href="/admin/billing" className="mt-1 inline-block text-xs font-medium text-[#16a349] hover:underline">
                {data.unpaid_invoices} pending invoice{data.unpaid_invoices === 1 ? "" : "s"} →
              </Link>
            </div>
          </div>

          <div className="border-t border-[#d1e8d8] p-5">
            <Link
              href="/admin/manual"
              className="inline-flex items-center gap-2 text-xs font-medium text-[#16a349] hover:underline"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Get Help
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
