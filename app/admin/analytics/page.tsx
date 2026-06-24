"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { HelpTip } from "@/components/help-tip";
import { Loader } from "@/components/loader";
import { apiGetAuth } from "@/lib/api";
import { formatInstantMonthDayYearTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { RevenueByServiceItem } from "@/components/analytics-revenue-by-service-chart";

const AnalyticsTrendChart = dynamic(
  () =>
    import("@/components/analytics-trend-chart").then((m) => ({ default: m.AnalyticsTrendChart })),
  { ssr: false, loading: () => <div className="h-[220px] animate-pulse rounded-xl bg-slate-100" /> },
);

const AnalyticsRevenueByServiceChart = dynamic(
  () =>
    import("@/components/analytics-revenue-by-service-chart").then((m) => ({
      default: m.AnalyticsRevenueByServiceChart,
    })),
  { ssr: false, loading: () => <div className="h-[220px] animate-pulse rounded-xl bg-slate-100" /> },
);

type AnalyticsPayload = {
  kpis: {
    total_clients: number;
    total_clients_change: number | null;
    revenue_this_month: string;
    revenue_change: number | null;
    outstanding_balance: string;
    new_clients_this_month: number;
    new_clients_change: number | null;
  };
  today_snapshot?: {
    appointments: number;
    checked_in: number;
    completed: number;
    no_shows: number;
    revenue_today: string;
    unpaid_invoices: number;
  };
  revenue_chart: Array<{ month: string; collected: number; outstanding: number }>;
  revenue_chart_months?: number;
  appointments_this_week: {
    scheduled: number;
    completed: number;
    cancelled: number;
    no_shows: number;
    no_show_rate: number;
  };
  billing_summary: {
    total_billed: string;
    collected: string;
    outstanding: string;
    waived: string;
    no_show_fees: string;
    collection_rate: number;
  };
  revenue_by_service: Array<{ name: string; revenue: string; percentage: number }>;
  provider_stats?: Array<{
    provider_id: number;
    name: string;
    revenue: string;
    visits_completed: number;
  }>;
  at_risk_patients?: Array<{
    patient_id: number;
    name: string;
    last_visit: string | null;
    days_since_visit: number | null;
  }>;
  client_health: {
    active_30d: number;
    at_risk_60d: number;
    inactive_90d: number;
  };
  voice_summary: {
    total_calls: number;
    booked: number;
    failed: number;
    book_rate: number;
  };
  generated_at?: string;
};

function formatMoney(amount: string | number): string {
  const n = typeof amount === "number" ? amount : parseFloat(amount);
  if (Number.isNaN(n)) return String(amount);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function formatChange(pct: number | null | undefined): { label: string; positive: boolean | null } {
  if (pct == null || Number.isNaN(pct)) return { label: "—", positive: null };
  const sign = pct > 0 ? "+" : "";
  return { label: `${sign}${pct.toFixed(1)}% vs last month`, positive: pct > 0 ? true : pct < 0 ? false : null };
}

function KpiCard({
  title,
  value,
  change,
  help,
  alert,
  href,
}: {
  title: string;
  value: string;
  change?: number | null;
  help: string;
  alert?: boolean;
  href?: string;
}) {
  const ch = formatChange(change);
  const inner = (
    <>
      <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
        {title}
        <HelpTip label={title}>{help}</HelpTip>
      </p>
      <p
        className={cn(
          "mt-3 text-3xl font-bold tabular-nums tracking-tight sm:text-4xl",
          alert ? "text-rose-700" : "text-slate-900",
        )}
      >
        {value}
      </p>
      {change != null ? (
        <p
          className={cn(
            "mt-2 text-xs font-medium",
            ch.positive === true && "text-[#166534]",
            ch.positive === false && "text-rose-700",
            ch.positive === null && "text-slate-500",
          )}
        >
          {ch.label}
        </p>
      ) : null}
      {href ? (
        <p className="mt-2 text-xs font-semibold text-[#0d5c2e] group-hover:underline">View details →</p>
      ) : null}
    </>
  );
  const panelClass = cn(
    "admin-panel border-slate-200/90 bg-gradient-to-br from-white to-slate-50/90",
    alert && "border-rose-300/80 ring-1 ring-rose-200/60",
    href && "group transition hover:border-[#16a349]/35 hover:shadow-md",
  );
  if (href) {
    return (
      <Link href={href} className={panelClass}>
        {inner}
      </Link>
    );
  }
  return <div className={panelClass}>{inner}</div>;
}

function QuickLink({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="admin-panel flex flex-col border-slate-200/90 bg-white transition hover:border-[#16a349]/40 hover:bg-[#ecfdf5]/30"
    >
      <span className="text-sm font-semibold text-slate-900">{label}</span>
      <span className="mt-1 text-xs text-slate-600">{description}</span>
    </Link>
  );
}

const CHART_TEAL = "#0d9488";
const CHART_AMBER = "#d97706";

const REVENUE_PERIOD_OPTIONS = [
  { value: 3, label: "3 mo" },
  { value: 6, label: "6 mo" },
  { value: 12, label: "12 mo" },
] as const;

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revenueMonths, setRevenueMonths] = useState(6);

  const load = useCallback(
    async (opts?: { months?: number; chartOnly?: boolean }) => {
      const months = opts?.months ?? revenueMonths;
      if (opts?.chartOnly) setChartLoading(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const payload = await apiGetAuth<AnalyticsPayload>(`/admin/analytics/?months=${months}`);
        if (opts?.chartOnly) {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  revenue_chart: payload.revenue_chart,
                  revenue_chart_months: payload.revenue_chart_months ?? months,
                }
              : payload,
          );
        } else {
          setData(payload);
        }
        if (payload.revenue_chart_months) setRevenueMonths(payload.revenue_chart_months);
        else if (opts?.months != null) setRevenueMonths(months);
      } catch (e) {
        if (!opts?.chartOnly) setError(e instanceof Error ? e.message : "Failed to load analytics");
      } finally {
        setLoading(false);
        setChartLoading(false);
      }
    },
    [revenueMonths],
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <AdminPageIntro
          title="Analytics"
          description="Business overview — clients, revenue, billing, and how the clinic is performing."
        />
        <Loader variant="page" label="Loading analytics" sublabel="Crunching clinic numbers…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <AdminPageIntro title="Analytics" description="Business overview for clinic performance." />
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

  const outstandingNum = parseFloat(data.kpis.outstanding_balance);
  const outstandingAlert = !Number.isNaN(outstandingNum) && outstandingNum > 2000;
  const healthTotal =
    data.client_health.active_30d + data.client_health.at_risk_60d + data.client_health.inactive_90d || 1;
  const week = data.appointments_this_week;
  const billing = data.billing_summary;
  const voice = data.voice_summary;
  const today = data.today_snapshot;
  const providers = data.provider_stats ?? [];
  const atRisk = data.at_risk_patients ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminPageIntro
          title="Analytics"
          description="See how the clinic is doing — today's activity, monthly revenue, billing health, and patients who may need a follow-up."
          pageHelp={
            <>
              Numbers use the clinic time zone and refresh when you open or reload this page. Month comparisons use the
              previous calendar month. Revenue is successful payments by <strong>paid date</strong>.
            </>
          }
        />
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Refresh
          </button>
          {data.generated_at ? (
            <p className="text-[11px] text-slate-500">Updated {formatInstantMonthDayYearTime(data.generated_at)}</p>
          ) : null}
        </div>
      </div>

      {outstandingAlert ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-950">
          <p className="font-semibold">Outstanding balance is high ({formatMoney(data.kpis.outstanding_balance)})</p>
          <p className="mt-1 text-rose-900/90">
            Review open invoices and collect payment from the{" "}
            <Link href="/admin/billing" className="font-semibold underline hover:text-rose-950">
              billing page
            </Link>{" "}
            or patient charts.
          </p>
        </div>
      ) : null}

      {/* Quick links */}
      <section className="grid gap-3 sm:grid-cols-3">
        <QuickLink href="/admin/schedule" label="Today's schedule" description="Check in patients and manage the day." />
        <QuickLink href="/admin/billing" label="Invoices & billing" description="Collect payments and review open bills." />
        <QuickLink href="/admin/patients" label="All patients" description="Open charts and payment cards on file." />
      </section>

      {/* Today */}
      {today ? (
        <section>
          <AdminSectionLabel help="Live counts for today in the clinic calendar.">
            Today at a glance
          </AdminSectionLabel>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                { label: "On schedule", value: String(today.appointments) },
                { label: "Checked in", value: String(today.checked_in) },
                { label: "Completed", value: String(today.completed) },
                { label: "No-shows", value: String(today.no_shows) },
                { label: "Collected today", value: formatMoney(today.revenue_today) },
                { label: "Open invoices", value: String(today.unpaid_invoices) },
              ] as const
            ).map((box) => (
              <div key={box.label} className="admin-panel text-center sm:text-left">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{box.label}</p>
                <p className="mt-2 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">{box.value}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Monthly KPIs */}
      <section>
        <AdminSectionLabel help="Headline metrics for the current calendar month unless noted.">
          This month
        </AdminSectionLabel>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Active clients"
            value={String(data.kpis.total_clients)}
            change={data.kpis.total_clients_change}
            help="Patients with at least one appointment that was not cancelled or marked no-show."
            href="/admin/patients"
          />
          <KpiCard
            title="Revenue collected"
            value={formatMoney(data.kpis.revenue_this_month)}
            change={data.kpis.revenue_change}
            help="Sum of successful payments received this month (by payment date)."
            href="/admin/billing"
          />
          <KpiCard
            title="Outstanding balance"
            value={formatMoney(data.kpis.outstanding_balance)}
            help="Total still owed on open invoices (issued or overdue), after partial payments."
            alert={outstandingAlert}
            href="/admin/billing"
          />
          <KpiCard
            title="New clients"
            value={String(data.kpis.new_clients_this_month)}
            change={data.kpis.new_clients_change}
            help="Patients whose first-ever non-cancelled appointment is this month."
          />
        </div>
      </section>

      <AnalyticsTrendChart
        title="Revenue trend"
        help={
          <>
            Line chart of <strong>collected</strong> payments (by paid date) vs <strong>outstanding added</strong> (open
            invoice totals issued that month). Change the period to compare performance over time.
          </>
        }
        data={data.revenue_chart}
        xKey="month"
        series={[
          { dataKey: "collected", name: "Collected", color: CHART_TEAL },
          { dataKey: "outstanding", name: "Outstanding added", color: CHART_AMBER },
        ]}
        periodLabel="Show"
        periodValue={revenueMonths}
        periodOptions={[...REVENUE_PERIOD_OPTIONS]}
        onPeriodChange={(v) => {
          if (v === revenueMonths) return;
          void load({ months: v, chartOnly: true });
        }}
        valueFormatter={(v) => formatMoney(v)}
        yTickFormatter={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)}
        height={240}
        loading={chartLoading}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        {/* This week */}
        <section>
          <AdminSectionLabel help="Monday–Sunday of the current week in the clinic calendar.">
            Appointments this week
          </AdminSectionLabel>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { label: "Scheduled", value: week.scheduled, sub: "Upcoming" },
                { label: "Completed", value: week.completed, sub: "Done" },
                { label: "Cancelled", value: week.cancelled, sub: "" },
                { label: "No shows", value: week.no_shows, sub: `${week.no_show_rate}% rate` },
              ] as const
            ).map((box) => (
              <div key={box.label} className="admin-panel text-center sm:text-left">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{box.label}</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{box.value}</p>
                {box.sub ? <p className="mt-1 text-xs text-slate-500">{box.sub}</p> : null}
              </div>
            ))}
          </div>
        </section>

        {/* Voice */}
        <section className="admin-panel">
          <AdminSectionLabel help="AI phone booking attempts this month (Twilio voice flow).">
            AI voice summary
          </AdminSectionLabel>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total calls</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{voice.total_calls}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Booked via AI</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[#166534]">
                {voice.booked}
                <span className="ml-2 text-base font-semibold text-slate-600">({voice.book_rate}%)</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Failed / dropped</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-rose-700">{voice.failed}</p>
            </div>
          </div>
          <Link href="/admin/ai" className="mt-4 inline-block text-xs font-semibold text-[#0d5c2e] hover:underline">
            Open AI assistant settings →
          </Link>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Billing */}
        <section className="admin-panel">
          <AdminSectionLabel help="Invoices issued this calendar month. Collection rate = collected ÷ total billed.">
            Billing summary (this month)
          </AdminSectionLabel>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[280px] text-sm">
              <tbody>
                {(
                  [
                    ["Total billed", formatMoney(billing.total_billed)],
                    ["Collected", formatMoney(billing.collected)],
                    ["Outstanding", formatMoney(billing.outstanding)],
                    ["Waived", formatMoney(billing.waived)],
                    ["No-show fees pending", formatMoney(billing.no_show_fees)],
                    ["Collection rate", `${billing.collection_rate.toFixed(1)}%`],
                  ] as const
                ).map(([label, val]) => (
                  <tr key={label} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-slate-700">{label}</td>
                    <td className="py-2.5 text-right font-semibold tabular-nums text-slate-900">{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Providers */}
        <section className="admin-panel">
          <AdminSectionLabel help="Payments collected and completed visits per provider this month.">
            By provider (this month)
          </AdminSectionLabel>
          {providers.length === 0 ? (
            <p className="text-sm text-slate-500">No provider activity recorded this month yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[280px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="pb-2 pr-3">Provider</th>
                    <th className="pb-2 pr-3 text-right">Visits</th>
                    <th className="pb-2 text-right">Collected</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.map((p) => (
                    <tr key={p.provider_id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 pr-3 font-medium text-slate-800">{p.name}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-slate-700">{p.visits_completed}</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums text-slate-900">
                        {formatMoney(p.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="admin-panel">
        <AdminSectionLabel help="Top five patient-chargeable services on invoices paid this month.">
          Revenue by service
        </AdminSectionLabel>
        <AnalyticsRevenueByServiceChart data={data.revenue_by_service as RevenueByServiceItem[]} />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Client health */}
        <section>
          <AdminSectionLabel help="Based on last completed visit date. At risk = 60–89 days since last visit.">
            Client health
          </AdminSectionLabel>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                {
                  key: "active",
                  label: "Active",
                  sub: "Last 30 days",
                  count: data.client_health.active_30d,
                  bar: "bg-[#16a349]",
                  panel: "border-[#16a349]/25 bg-[#ecfdf5]/80",
                },
                {
                  key: "risk",
                  label: "At risk",
                  sub: "60–89 days",
                  count: data.client_health.at_risk_60d,
                  bar: "bg-amber-500",
                  panel: "border-amber-200/80 bg-amber-50/80",
                },
                {
                  key: "inactive",
                  label: "Inactive",
                  sub: "90+ days",
                  count: data.client_health.inactive_90d,
                  bar: "bg-rose-500",
                  panel: "border-rose-200/80 bg-rose-50/80",
                },
              ] as const
            ).map((item) => {
              const pct = Math.round((item.count / healthTotal) * 100);
              return (
                <div key={item.key} className={cn("admin-panel", item.panel)}>
                  <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                  <p className="text-xs text-slate-600">{item.sub}</p>
                  <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{item.count}</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80">
                    <div className={cn("h-full rounded-full transition-all", item.bar)} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-xs tabular-nums text-slate-500">{pct}% of patients</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* At-risk outreach list */}
        <section className="admin-panel">
          <AdminSectionLabel help="Patients who have not visited in 60–89 days — good candidates for a reminder call.">
            Patients to re-engage
          </AdminSectionLabel>
          {atRisk.length === 0 ? (
            <p className="text-sm text-slate-500">No patients in the 60–89 day window right now.</p>
          ) : (
            <ul className="max-h-[min(16rem,40vh)] space-y-2 overflow-y-auto pr-1">
              {atRisk.map((p) => (
                <li key={p.patient_id}>
                  <Link
                    href={`/admin/patients/${p.patient_id}/history`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-sm transition hover:border-[#16a349]/30 hover:bg-[#ecfdf5]/50"
                  >
                    <span className="font-medium text-slate-900">{p.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-amber-800">
                      {p.days_since_visit != null ? `${p.days_since_visit} days ago` : "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
