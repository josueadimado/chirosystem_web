"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { HelpTip } from "@/components/help-tip";
import { Loader } from "@/components/loader";
import { StatusChipView } from "@/components/status-chip";
import { apiGetAuth } from "@/lib/api";
import { getRoleCookie } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { IconStethoscope, IconUserPlus } from "@/components/icons";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type RecentActivityKind = "check_in" | "completed" | "payment" | "other";

type RecentActivityItem = {
  text: string;
  kind: RecentActivityKind;
};

/** Shape of the admin dashboard summary from the API. */
type DashboardSummary = {
  appointments_today: number;
  checked_in: number;
  completed: number;
  daily_revenue: string;
  unpaid_invoices: number;
  today_schedule: Array<{
    id: number;
    patient_name: string;
    provider_name?: string;
    start_time: string;
    status: string;
  }>;
  recent_activity: RecentActivityItem[] | string[];
  /** e.g. "Monday, May 11, 2026" — clinic-local calendar day */
  today_display?: string;
  /** e.g. "3:45 PM" — when summary was built */
  as_of_display?: string;
};

function normalizeRecentActivity(raw: DashboardSummary["recent_activity"]): RecentActivityItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === "string") {
      return { text: item, kind: "other" as RecentActivityKind };
    }
    const k = item.kind;
    const kind: RecentActivityKind =
      k === "check_in" || k === "completed" || k === "payment" ? k : "other";
    return { text: item.text || "", kind };
  });
}

function activityKindStyles(kind: RecentActivityKind): { bar: string; dot: string } {
  switch (kind) {
    case "check_in":
      return { bar: "border-l-[#16a349]", dot: "bg-[#16a349]" };
    case "completed":
      return { bar: "border-l-sky-500", dot: "bg-sky-500" };
    case "payment":
      return { bar: "border-l-violet-500", dot: "bg-violet-500" };
    default:
      return { bar: "border-l-slate-300", dot: "bg-slate-400" };
  }
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOwnerAdmin, setIsOwnerAdmin] = useState(false);

  useEffect(() => {
    setIsOwnerAdmin(getRoleCookie() === "owner_admin");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const summary = await apiGetAuth<DashboardSummary>("/admin/dashboard_summary/");
      setData(summary);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load dashboard";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-6">
        <AdminPageIntro
          title="Overview"
          description="A quick snapshot of today’s visits, revenue, and what happened recently."
          pageHelp="Numbers refresh when you open or reload this page. Use the links below to jump into the full schedule or billing workflows."
        />
        <Loader variant="page" label="Loading dashboard" sublabel="Summarizing your clinic…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <AdminPageIntro
          title="Overview"
          description="A quick snapshot of today’s visits, revenue, and what happened recently."
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

  const activityItems = normalizeRecentActivity(data.recent_activity);
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
      <div className="space-y-2">
        <AdminPageIntro
          title="Overview"
          description="A quick snapshot of today’s visits, revenue, and what happened recently."
          pageHelp={
            <>
              All counts below are for <strong>today’s calendar date</strong> in the clinic’s time zone.{" "}
              <strong>Pending invoices</strong> are unpaid balances — open Billing to collect or adjust. Click a visit to open it on the
              schedule.
            </>
          }
        />
        {todayLine ? (
          <p className="text-sm font-medium text-slate-600">{todayLine}</p>
        ) : null}
      </div>

      {/* Quick links — first-time admins find primary workflows faster */}
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

      <div className="stagger-children grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="admin-panel border-slate-200/90 bg-gradient-to-br from-white to-slate-50/90 ring-slate-200/60">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
            Today · appointments
            <HelpTip label="Appointments today">Visits scheduled for today (all providers), excluding cancelled and no-show.</HelpTip>
          </p>
          <p className="mt-3 text-4xl font-bold tabular-nums leading-none tracking-tight text-slate-900">{data.appointments_today}</p>
        </div>
        <div className="admin-panel border-[#16a349]/20 bg-gradient-to-br from-[#ecfdf5]/50 to-white ring-[#16a349]/15">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#14532d]/90">
            Today · checked in
            <HelpTip label="Checked in">Patients who completed check-in today (kiosk or staff).</HelpTip>
          </p>
          <p className="mt-3 text-4xl font-bold tabular-nums leading-none tracking-tight text-[#16a349]">{data.checked_in}</p>
        </div>
        <div className="admin-panel border-sky-200/80 bg-gradient-to-br from-sky-50/70 to-white ring-sky-100/80">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-sky-900/80">
            Today · completed
            <HelpTip label="Completed">Visits marked completed for today.</HelpTip>
          </p>
          <p className="mt-3 text-4xl font-bold tabular-nums leading-none tracking-tight text-sky-800">{data.completed}</p>
        </div>
        <div className="admin-panel border-emerald-200/50 bg-gradient-to-br from-emerald-50/40 to-white">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-600">
            Today · revenue
            <HelpTip label="Daily revenue">Total from invoices marked paid today (clinic date).</HelpTip>
          </p>
          <p className="mt-3 text-3xl font-bold tabular-nums leading-none tracking-tight text-slate-900 sm:text-4xl">{formattedRevenue}</p>
        </div>
        <div className="admin-panel border-amber-200/60 bg-gradient-to-br from-amber-50/50 to-white sm:col-span-2 xl:col-span-1">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-amber-950/80">
            Pending invoices
            <HelpTip label="Pending invoices">Issued invoices not yet paid — follow up in Billing.</HelpTip>
          </p>
          <p className="mt-3 text-4xl font-bold tabular-nums leading-none tracking-tight text-amber-950">{data.unpaid_invoices}</p>
        </div>
      </div>

      <section className="space-y-3">
        <AdminSectionLabel help="Shortcuts to add people who work at the clinic — doctors, desk staff, and (for owners) administrator accounts.">
          People & logins
        </AdminSectionLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/admin/providers"
            className="admin-panel group flex gap-4 transition hover:border-[#16a349]/40 hover:bg-[#16a349]/5"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#16a349]/12 text-[#0d5c2e] ring-1 ring-[#16a349]/20">
              <IconStethoscope className="h-6 w-6" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-slate-900 group-hover:text-[#0d5c2e]">Doctors & providers</span>
              <span className="mt-1 block text-[14px] leading-relaxed text-slate-600">
                Add a doctor login, set their name for the schedule, and choose which online visit types they offer.
              </span>
              <span className="mt-2 inline-block text-sm font-medium text-[#16a349] group-hover:underline">Open →</span>
            </span>
          </Link>
          {isOwnerAdmin ? (
            <Link
              href="/admin/team"
              className="admin-panel group flex gap-4 transition hover:border-violet-300 hover:bg-violet-50/60"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-800 ring-1 ring-violet-200">
                <IconUserPlus className="h-6 w-6" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-slate-900 group-hover:text-violet-900">Team & administrators</span>
                <span className="mt-1 block text-[14px] leading-relaxed text-slate-600">
                  Create desk staff and extra owner accounts, or manage roles — uses the same logins as the API “team” list.
                </span>
                <span className="mt-2 inline-block text-sm font-medium text-violet-800 group-hover:underline">Open →</span>
              </span>
            </Link>
          ) : (
            <div className="admin-panel flex gap-4 border-dashed border-slate-200 bg-slate-50/50">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-200/80 text-slate-500">
                <IconUserPlus className="h-6 w-6" />
              </span>
              <span className="min-w-0 text-sm text-slate-600">
                <span className="font-semibold text-slate-800">Team & administrators</span>
                <span className="mt-1 block">
                  Only the clinic <strong>owner</strong> can add staff or administrator accounts. Ask them to sign in and use Team & logins
                  in the sidebar.
                </span>
              </span>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr] lg:items-stretch">
        <section className="admin-panel flex min-h-[280px] flex-col">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <AdminSectionLabel help="Each line is a visit today. Status shows where the patient is in the workflow.">
              Today&apos;s schedule
            </AdminSectionLabel>
            <Link
              href="/admin/schedule"
              className="text-[14px] font-medium leading-normal text-[#16a349] hover:text-[#13823d] hover:underline"
            >
              Full schedule →
            </Link>
          </div>
          <div className="min-h-0 flex-1 space-y-2">
            {data.today_schedule.length === 0 ? (
              <div className="flex flex-1 flex-col justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-8 text-center">
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
              data.today_schedule.map((a) => (
                <Link
                  key={a.id}
                  href={`/admin/schedule?appointment=${a.id}`}
                  className="grid min-h-[3.25rem] grid-cols-1 items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200/90 bg-slate-50/50 px-4 py-3 text-left transition hover:border-[#16a349]/35 hover:bg-[#ecfdf5]/40 sm:grid-cols-[minmax(5.5rem,auto)_1fr_minmax(0,auto)_auto] sm:gap-y-0"
                >
                  <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-slate-800">{a.start_time}</span>
                  <span className="min-w-0 font-semibold text-slate-900">{a.patient_name}</span>
                  <span className="min-w-0 truncate text-[13px] text-slate-500 sm:text-right">{a.provider_name || "—"}</span>
                  <span className="justify-self-start sm:justify-self-end">
                    <StatusChipView status={a.status} />
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="admin-panel flex min-h-[280px] flex-col">
          <div className="mb-3 flex items-start justify-between gap-2">
            <AdminSectionLabel help="Check-ins, completed visits, and payments recorded today. Newest updates first.">
              Recent activity
            </AdminSectionLabel>
          </div>
          <ul className="min-h-0 flex-1 space-y-0 divide-y divide-slate-100">
            {activityItems.length === 0 ? (
              <li className="flex flex-1 flex-col justify-center py-10 text-center">
                <p className="text-sm font-medium text-slate-600">Nothing logged here yet today.</p>
                <p className="mt-1 text-xs text-slate-500">Check-ins and payments will show as they happen.</p>
              </li>
            ) : (
              activityItems.map((item, i) => {
                const { bar, dot } = activityKindStyles(item.kind);
                return (
                  <li key={`${item.kind}-${i}`} className={cn("flex gap-3 border-l-4 py-3 pl-3 pr-1", bar)}>
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden />
                    <span className="min-w-0 text-[14px] leading-relaxed text-slate-700">{item.text}</span>
                  </li>
                );
              })
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
