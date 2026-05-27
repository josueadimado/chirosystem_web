"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { HelpTip } from "@/components/help-tip";
import { Loader } from "@/components/loader";
import { apiGetAuth } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AnalyticsTrendChart } from "@/components/analytics-trend-chart";
import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
}: {
  title: string;
  value: string;
  change?: number | null;
  help: string;
  alert?: boolean;
}) {
  const ch = formatChange(change);
  return (
    <div
      className={cn(
        "admin-panel border-slate-200/90 bg-gradient-to-br from-white to-slate-50/90",
        alert && "border-rose-300/80 ring-1 ring-rose-200/60",
      )}
    >
      <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
        {title}
        <HelpTip label={title}>{help}</HelpTip>
      </p>
      <p className={cn("mt-3 text-3xl font-bold tabular-nums tracking-tight sm:text-4xl", alert ? "text-rose-700" : "text-slate-900")}>
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
    </div>
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
          description="Business overview for how the clinic is performing — clients, revenue, billing, and voice booking."
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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminPageIntro
          title="Analytics"
          description="A business overview for Giovanni — clients, revenue trends, billing health, and AI phone bookings."
          pageHelp={
            <>
              Figures use the clinic time zone and refresh when you open or reload this page. Month comparisons use the previous
              calendar month. Revenue is successful payments by <strong>paid date</strong>.
            </>
          }
        />
        <button
          type="button"
          onClick={() => void load()}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {/* Section 1 — KPIs */}
      <section>
        <AdminSectionLabel help="Headline metrics for the current calendar month unless noted.">
          Key metrics
        </AdminSectionLabel>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Total active clients"
            value={String(data.kpis.total_clients)}
            change={data.kpis.total_clients_change}
            help="Patients with at least one appointment that was not cancelled or marked no-show."
          />
          <KpiCard
            title="Revenue this month"
            value={formatMoney(data.kpis.revenue_this_month)}
            change={data.kpis.revenue_change}
            help="Sum of successful payments received this month (by payment date)."
          />
          <KpiCard
            title="Outstanding balance"
            value={formatMoney(data.kpis.outstanding_balance)}
            help="Total still owed on open invoices (issued or overdue), after partial payments."
            alert={outstandingAlert}
          />
          <KpiCard
            title="New clients this month"
            value={String(data.kpis.new_clients_this_month)}
            change={data.kpis.new_clients_change}
            help="Patients whose first-ever non-cancelled appointment is this month."
          />
        </div>
      </section>

      {/* Section 2 — Revenue trend (line + period filter) */}
      <AnalyticsTrendChart
        title="Revenue trend"
        help={
          <>
            Line chart of <strong>collected</strong> payments (by paid date) vs <strong>outstanding added</strong> (open invoice
            totals issued that month). Change the period to compare performance over time.
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
        height={220}
        loading={chartLoading}
      />

      {/* Section 3 — This week */}
      <section>
        <AdminSectionLabel help="Monday–Sunday of the current week in the clinic calendar.">
          Appointments this week
        </AdminSectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

      {/* Section 4 — Billing summary */}
      <section className="admin-panel">
        <AdminSectionLabel help="Invoices issued this calendar month. Collection rate = collected ÷ total billed.">
          Billing summary (this month)
        </AdminSectionLabel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm">
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

      {/* Section 5 — Revenue by service */}
      <section className="admin-panel">
        <AdminSectionLabel help="Top five patient-chargeable services on invoices paid this month.">
          Revenue by service
        </AdminSectionLabel>
        {data.revenue_by_service.length === 0 ? (
          <p className="text-sm text-slate-500">No paid visit revenue recorded this month yet.</p>
        ) : (
          <>
            <div className="h-[220px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={data.revenue_by_service.map((s) => ({
                    name: s.name.length > 28 ? `${s.name.slice(0, 26)}…` : s.name,
                    revenue: parseFloat(s.revenue) || 0,
                  }))}
                  margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "#334155" }} />
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                  <Bar dataKey="revenue" name="Revenue" fill={CHART_TEAL} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
              {data.revenue_by_service.map((s) => (
                <li key={s.name} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-800">{s.name}</span>
                  <span className="tabular-nums text-slate-600">
                    {formatMoney(s.revenue)} · {s.percentage.toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Section 6 — Client health */}
      <section>
        <AdminSectionLabel help="Based on last completed visit date. At risk = 60–89 days since last visit.">
          Client health
        </AdminSectionLabel>
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              {
                key: "active",
                label: "Active",
                sub: "Visited in last 30 days",
                count: data.client_health.active_30d,
                bar: "bg-[#16a349]",
                panel: "border-[#16a349]/25 bg-[#ecfdf5]/80",
              },
              {
                key: "risk",
                label: "At risk",
                sub: "No visit 60–89 days",
                count: data.client_health.at_risk_60d,
                bar: "bg-amber-500",
                panel: "border-amber-200/80 bg-amber-50/80",
              },
              {
                key: "inactive",
                label: "Inactive",
                sub: "No visit 90+ days",
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

      {/* Section 7 — Voice */}
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
      </section>
    </div>
  );
}
