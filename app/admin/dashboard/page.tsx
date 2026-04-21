"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { HelpTip } from "@/components/help-tip";
import { Loader } from "@/components/loader";
import { StatusChipView } from "@/components/status-chip";
import { apiGetAuth } from "@/lib/api";
import { getRoleCookie } from "@/lib/auth";
import { IconStethoscope, IconUserPlus } from "@/components/icons";
import Link from "next/link";
import { useEffect, useState } from "react";

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
  recent_activity: string[];
};

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOwnerAdmin, setIsOwnerAdmin] = useState(false);

  useEffect(() => {
    setIsOwnerAdmin(getRoleCookie() === "owner_admin");
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const summary = await apiGetAuth<DashboardSummary>("/admin/dashboard_summary/");
        setData(summary);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load dashboard";
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
        </div>
      </div>
    );
  }

  if (!data) return null;

  const revenue = parseFloat(data.daily_revenue);
  const formattedRevenue = isNaN(revenue)
    ? data.daily_revenue
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(revenue);

  return (
    <div className="space-y-6">
      <AdminPageIntro
        title="Overview"
        description="A quick snapshot of today’s visits, revenue, and what happened recently."
        pageHelp={
          <>
            Cards pull from today&apos;s data on the server. <strong>Pending invoices</strong> are unpaid balances you may want to
            follow up on. Click any appointment to open it on the schedule page.
          </>
        }
      />
      <div className="stagger-children grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="admin-panel">
          <p className="flex items-center gap-1.5 text-sm text-slate-500">
            Appointments today
            <HelpTip label="Appointments today">Count of visits scheduled for the current calendar day (all providers).</HelpTip>
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{data.appointments_today}</p>
        </div>
        <div className="admin-panel">
          <p className="flex items-center gap-1.5 text-sm text-slate-500">
            Checked-in
            <HelpTip label="Checked-in">Patients who have completed check-in for today (kiosk or staff).</HelpTip>
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-[#16a349]">{data.checked_in}</p>
        </div>
        <div className="admin-panel">
          <p className="flex items-center gap-1.5 text-sm text-slate-500">
            Daily revenue
            <HelpTip label="Daily revenue">Total recorded payments or charges attributed to today (from your billing data).</HelpTip>
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{formattedRevenue}</p>
        </div>
        <div className="admin-panel">
          <p className="flex items-center gap-1.5 text-sm text-slate-500">
            Pending invoices
            <HelpTip label="Pending invoices">Open balances not yet marked paid—use Billing to collect or adjust.</HelpTip>
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{data.unpaid_invoices}</p>
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
              <span className="mt-1 block text-sm text-slate-600">
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
                <span className="mt-1 block text-sm text-slate-600">
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
                  Only the clinic <strong>owner</strong> can add staff or administrator accounts. Ask them to sign in and use Team & logins in the sidebar.
                </span>
              </span>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="admin-panel">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <AdminSectionLabel help="Each line is a visit today; status shows where the patient is in the visit workflow.">
              Today&apos;s schedule
            </AdminSectionLabel>
            <Link
              href="/admin/schedule"
              className="text-sm font-medium text-[#16a349] hover:text-[#13823d] hover:underline"
            >
              View full schedule →
            </Link>
          </div>
          <div className="space-y-2">
            {data.today_schedule.length === 0 ? (
              <p className="rounded-lg border border-slate-200 p-4 text-slate-500">
                No appointments today.
              </p>
            ) : (
              data.today_schedule.map((a) => (
                <Link
                  key={a.id}
                  href={`/admin/schedule?appointment=${a.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-200/90 bg-slate-50/40 p-3 transition hover:border-[#16a349]/30 hover:bg-[#16a349]/5"
                >
                  <span>
                    {a.start_time} · {a.patient_name}
                    {a.provider_name && (
                      <span className="ml-2 text-slate-500">({a.provider_name})</span>
                    )}
                  </span>
                  <StatusChipView status={a.status} />
                </Link>
              ))
            )}
          </div>
        </section>
        <section className="admin-panel">
          <AdminSectionLabel help="Short audit-style messages from the system (e.g. check-ins, bookings). Exact events depend on your API.">
            Recent activity
          </AdminSectionLabel>
          <ul className="space-y-2 text-sm text-slate-700">
            {data.recent_activity.length === 0 ? (
              <li className="text-slate-500">No recent activity.</li>
            ) : (
              data.recent_activity.map((item, i) => (
                <li key={i}>{item}</li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
