"use client";

import { Loader } from "@/components/loader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGetAuth } from "@/lib/api";
import { formatInstantMonthDayYearTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  CreditCard,
  DollarSign,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { RevenueByServiceItem } from "@/components/analytics-revenue-by-service-chart";

const AnalyticsTrendChart = dynamic(
  () =>
    import("@/components/analytics-trend-chart").then((m) => ({ default: m.AnalyticsTrendChart })),
  { ssr: false, loading: () => <div className="h-[220px] animate-pulse rounded-xl bg-[#f8fdf9]" /> },
);

const AnalyticsRevenueByServiceChart = dynamic(
  () =>
    import("@/components/analytics-revenue-by-service-chart").then((m) => ({
      default: m.AnalyticsRevenueByServiceChart,
    })),
  { ssr: false, loading: () => <div className="h-[220px] animate-pulse rounded-xl bg-[#f8fdf9]" /> },
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
  iris_clients?: {
    tagged_total: number;
    unique_this_week: number;
    unique_this_month: number;
    unique_this_quarter: number;
  };
  voice_summary: {
    total_calls: number;
    booked: number;
    failed: number;
    book_rate: number;
  };
  generated_at?: string;
};

type AnalyticsTab = "overview" | "money" | "patients" | "ai";

type AttentionItem = {
  id: string;
  tone: "rose" | "amber";
  title: string;
  detail: string;
  cta: string;
} & (
  | { href: string; tab?: never }
  | { tab: AnalyticsTab; href?: never }
);

type StatTone = "primary" | "green" | "consult" | "red" | "grey";

const BANANI_CARD = "rounded-xl border border-[#d1e8d8] bg-white";

function formatMoney(amount: string | number): string {
  const n = typeof amount === "number" ? amount : parseFloat(amount);
  if (Number.isNaN(n)) return String(amount);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function formatChange(pct: number | null | undefined): { label: string; positive: boolean | null } {
  if (pct == null || Number.isNaN(pct)) return { label: "—", positive: null };
  const sign = pct > 0 ? "+" : "";
  return { label: `${sign}${pct.toFixed(1)}% vs last mo`, positive: pct > 0 ? true : pct < 0 ? false : null };
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h3 className="mb-3 text-sm font-semibold text-[#0d1f14]">{children}</h3>;
}

function SnapshotStatCard({
  label,
  value,
  icon,
  tone = "primary",
  alert,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone?: StatTone;
  alert?: boolean;
}) {
  const iconWrap: Record<StatTone, string> = {
    primary: "bg-[#ecfdf5] text-[#16a349]",
    green: "bg-[#f0fdf4] text-[#166534]",
    consult: "bg-[#fef3c7] text-[#92400e]",
    red: "bg-[#fee2e2] text-[#991b1b]",
    grey: "bg-[#f3f4f6] text-[#4b5563]",
  };

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-lg border border-[#d1e8d8] bg-white px-4 py-3.5",
        alert && "border-rose-200 bg-rose-50/60",
      )}
    >
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", iconWrap[tone])}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className={cn("truncate text-xl font-bold tabular-nums leading-none text-[#0d1f14]", alert && "text-rose-700")}>
          {value}
        </p>
        <p className="mt-1 truncate text-xs text-[#5a7a62]">{label}</p>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  change,
  alert,
  href,
  icon,
}: {
  title: string;
  value: string;
  change?: number | null;
  alert?: boolean;
  href?: string;
  icon: ReactNode;
}) {
  const ch = formatChange(change);
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-[#5a7a62]">{title}</p>
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            alert ? "bg-[#fee2e2] text-[#991b1b]" : "bg-[#ecfdf5] text-[#16a349]",
          )}
        >
          {icon}
        </div>
      </div>
      <p className={cn("mt-2 text-2xl font-bold tabular-nums text-[#0d1f14] sm:text-3xl", alert && "text-rose-700")}>
        {value}
      </p>
      {change != null ? (
        <p
          className={cn(
            "mt-1.5 text-xs font-medium",
            ch.positive === true && "text-[#166534]",
            ch.positive === false && "text-rose-700",
            ch.positive === null && "text-[#5a7a62]",
          )}
        >
          {ch.label}
        </p>
      ) : null}
      {href ? (
        <p className="mt-2 text-xs font-semibold text-[#16a349] group-hover:underline">View details →</p>
      ) : null}
    </>
  );
  const panelClass = cn(
    BANANI_CARD,
    "px-4 py-4",
    alert && "border-rose-200 bg-rose-50/50",
    href && "group transition hover:border-[#16a349]/40 hover:shadow-sm",
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

function CollapsibleDetails({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn(BANANI_CARD, "px-4 py-4")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div>
          <p className="text-sm font-semibold text-[#0d1f14]">{title}</p>
          <p className="mt-0.5 text-xs text-[#5a7a62]">{summary}</p>
        </div>
        <span className="shrink-0 text-xs font-semibold text-[#16a349]">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? <div className="mt-4 border-t border-[#d1e8d8] pt-4">{children}</div> : null}
    </div>
  );
}

const CHART_TEAL = "#0d9488";
const CHART_AMBER = "#d97706";
const OUTSTANDING_ALERT_THRESHOLD = 2000;
const NO_SHOW_RATE_ALERT = 15;
const COLLECTION_RATE_ALERT = 70;

const REVENUE_PERIOD_OPTIONS = [
  { value: 3, label: "3 mo" },
  { value: 6, label: "6 mo" },
  { value: 12, label: "12 mo" },
] as const;

const TAB_TRIGGER_CLASS =
  "min-w-[5.5rem] flex-1 rounded-none border-0 border-b-2 border-transparent bg-transparent px-4 py-2.5 text-sm font-medium text-[#5a7a62] shadow-none after:hidden hover:text-[#0d1f14] data-active:border-[#16a349] data-active:bg-transparent data-active:text-[#16a349] data-active:shadow-none sm:flex-none";

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revenueMonths, setRevenueMonths] = useState(6);
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");

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

  const attentionItems = useMemo((): AttentionItem[] => {
    if (!data) return [];
    const items: AttentionItem[] = [];
    const outstandingNum = parseFloat(data.kpis.outstanding_balance);
    const today = data.today_snapshot;
    const atRisk = data.at_risk_patients ?? [];
    const week = data.appointments_this_week;
    const voice = data.voice_summary;
    const billing = data.billing_summary;

    if (!Number.isNaN(outstandingNum) && outstandingNum > OUTSTANDING_ALERT_THRESHOLD) {
      items.push({
        id: "outstanding",
        tone: "rose",
        title: `Outstanding balance is high (${formatMoney(data.kpis.outstanding_balance)})`,
        detail:
          "Collect on Billing, or use Payment reconciliation if cash was already taken but invoices still look open.",
        href: "/admin/reconciliation",
        cta: "Open reconciliation",
      });
    }

    if (today && today.no_shows > 0) {
      items.push({
        id: "today-noshows",
        tone: "amber",
        title: `${today.no_shows} no-show${today.no_shows === 1 ? "" : "s"} today`,
        detail: "Check the schedule and follow up if needed.",
        href: "/admin/schedule",
        cta: "Open schedule",
      });
    }

    if (week.no_show_rate >= NO_SHOW_RATE_ALERT && week.no_shows > 0) {
      items.push({
        id: "week-noshow-rate",
        tone: "amber",
        title: `This week’s no-show rate is ${week.no_show_rate}%`,
        detail: "Higher than usual — review reminders and same-day confirmations.",
        tab: "overview",
        cta: "View this week",
      });
    }

    if (atRisk.length > 0) {
      items.push({
        id: "reengage",
        tone: "amber",
        title: `${atRisk.length} patient${atRisk.length === 1 ? "" : "s"} to re-engage`,
        detail: "No visit in 60–89 days — good candidates for a reminder call.",
        tab: "patients",
        cta: "View list",
      });
    }

    if (billing.collection_rate > 0 && billing.collection_rate < COLLECTION_RATE_ALERT) {
      items.push({
        id: "collection",
        tone: "amber",
        title: `Collection rate is ${billing.collection_rate.toFixed(1)}% this month`,
        detail: "Collected payments are low compared with what was billed.",
        tab: "money",
        cta: "View money",
      });
    }

    if (voice.total_calls >= 5 && voice.failed > voice.booked) {
      items.push({
        id: "voice-failed",
        tone: "amber",
        title: `AI phone: ${voice.failed} failed / dropped vs ${voice.booked} booked`,
        detail: "More calls are ending without a booking — check AI assistant settings.",
        href: "/admin/ai",
        cta: "Review AI",
      });
    }

    return items;
  }, [data]);

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
        <Loader variant="page" label="Loading analytics" sublabel="Crunching clinic numbers…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
        <div className={cn(BANANI_CARD, "border-rose-200 bg-rose-50 p-5 text-rose-800")}>
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
  const outstandingAlert = !Number.isNaN(outstandingNum) && outstandingNum > OUTSTANDING_ALERT_THRESHOLD;
  const healthTotal =
    data.client_health.active_30d + data.client_health.at_risk_60d + data.client_health.inactive_90d || 1;
  const week = data.appointments_this_week;
  const billing = data.billing_summary;
  const voice = data.voice_summary;
  const today = data.today_snapshot;
  const providers = data.provider_stats ?? [];
  const atRisk = data.at_risk_patients ?? [];
  const iris = data.iris_clients;
  const collectionAlert = billing.collection_rate > 0 && billing.collection_rate < COLLECTION_RATE_ALERT;
  const weekNoShowAlert = week.no_show_rate >= NO_SHOW_RATE_ALERT && week.no_shows > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-[#d1e8d8] bg-white px-3 py-1.5 text-sm font-medium text-[#0d1f14] hover:bg-[#f8fdf9]"
        >
          Refresh
        </button>
        {data.generated_at ? (
          <p className="text-[11px] text-[#5a7a62]">Updated {formatInstantMonthDayYearTime(data.generated_at)}</p>
        ) : null}
      </div>

      {attentionItems.length > 0 ? (
        <section aria-label="Needs attention" className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#5a7a62]">Needs attention</p>
          <ul className="space-y-2">
            {attentionItems.map((item) => (
              <li
                key={item.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5",
                  item.tone === "rose"
                    ? "border-rose-200 bg-rose-50"
                    : "border-orange-200 bg-orange-50",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#0d1f14]">{item.title}</p>
                  <p className="mt-0.5 text-xs text-[#5a7a62]">{item.detail}</p>
                </div>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="shrink-0 rounded-lg border border-[#d1e8d8] bg-white px-3 py-1.5 text-xs font-semibold text-[#16a349] hover:bg-[#f8fdf9]"
                  >
                    {item.cta}
                  </Link>
                ) : item.tab ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab(item.tab!)}
                    className="shrink-0 rounded-lg border border-[#d1e8d8] bg-white px-3 py-1.5 text-xs font-semibold text-[#16a349] hover:bg-[#f8fdf9]"
                  >
                    {item.cta}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {today ? (
        <section>
          <SectionHeading>Today</SectionHeading>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <SnapshotStatCard
              label="On schedule"
              value={String(today.appointments)}
              icon={<Calendar className="h-[18px] w-[18px]" />}
            />
            <SnapshotStatCard
              label="Checked in"
              value={String(today.checked_in)}
              tone="green"
              icon={<UserCheck className="h-[18px] w-[18px]" />}
            />
            <SnapshotStatCard
              label="Completed"
              value={String(today.completed)}
              tone="green"
              icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
            />
            <SnapshotStatCard
              label="No-shows"
              value={String(today.no_shows)}
              tone="red"
              alert={today.no_shows > 0}
              icon={<UserX className="h-[18px] w-[18px]" />}
            />
            <SnapshotStatCard
              label="Collected today"
              value={formatMoney(today.revenue_today)}
              tone="primary"
              icon={<DollarSign className="h-[18px] w-[18px]" />}
            />
            <SnapshotStatCard
              label="Open invoices"
              value={String(today.unpaid_invoices)}
              tone="grey"
              alert={today.unpaid_invoices >= 10}
              icon={<CreditCard className="h-[18px] w-[18px]" />}
            />
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeading>This month</SectionHeading>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Active clients"
            value={String(data.kpis.total_clients)}
            change={data.kpis.total_clients_change}
            href="/admin/patients"
            icon={<Users className="h-4 w-4" />}
          />
          <KpiCard
            title="Revenue collected"
            value={formatMoney(data.kpis.revenue_this_month)}
            change={data.kpis.revenue_change}
            href="/admin/billing"
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <KpiCard
            title="Outstanding balance"
            value={formatMoney(data.kpis.outstanding_balance)}
            alert={outstandingAlert}
            href="/admin/billing"
            icon={<AlertCircle className="h-4 w-4" />}
          />
          <KpiCard
            title="New clients"
            value={String(data.kpis.new_clients_this_month)}
            change={data.kpis.new_clients_change}
            icon={<UserPlus className="h-4 w-4" />}
          />
        </div>
      </section>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AnalyticsTab)} className="gap-5">
        <TabsList
          variant="line"
          className="h-auto w-full justify-start gap-0 rounded-none border-b border-[#d1e8d8] bg-transparent p-0"
        >
          <TabsTrigger value="overview" className={TAB_TRIGGER_CLASS}>
            Overview
          </TabsTrigger>
          <TabsTrigger value="money" className={TAB_TRIGGER_CLASS}>
            Money
          </TabsTrigger>
          <TabsTrigger value="patients" className={TAB_TRIGGER_CLASS}>
            Patients
            {atRisk.length > 0 ? (
              <span className="ml-1.5 rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-orange-900">
                {atRisk.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="ai" className={TAB_TRIGGER_CLASS}>
            AI phone
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0 space-y-5">
          <AnalyticsTrendChart
            title="Revenue trend"
            help=""
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
            panelClassName={cn(BANANI_CARD, "p-4")}
          />

          <section>
            <SectionHeading>Appointments this week</SectionHeading>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  { label: "Scheduled", value: week.scheduled, sub: "Upcoming", alert: false },
                  { label: "Completed", value: week.completed, sub: "Done", alert: false },
                  { label: "Cancelled", value: week.cancelled, sub: "", alert: false },
                  {
                    label: "No shows",
                    value: week.no_shows,
                    sub: `${week.no_show_rate}% rate`,
                    alert: weekNoShowAlert,
                  },
                ] as const
              ).map((box) => (
                <div
                  key={box.label}
                  className={cn(
                    BANANI_CARD,
                    "px-4 py-3 text-center sm:text-left",
                    box.alert && "border-rose-200 bg-rose-50/60",
                  )}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5a7a62]">{box.label}</p>
                  <p
                    className={cn(
                      "mt-2 text-2xl font-bold tabular-nums text-[#0d1f14]",
                      box.alert && "text-rose-700",
                    )}
                  >
                    {box.value}
                  </p>
                  {box.sub ? <p className="mt-1 text-xs text-[#5a7a62]">{box.sub}</p> : null}
                </div>
              ))}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="money" className="mt-0 space-y-5">
          <div className="grid gap-5 xl:grid-cols-2">
            <CollapsibleDetails
              title="Billing summary (this month)"
              summary={`Collected ${formatMoney(billing.collected)} · rate ${billing.collection_rate.toFixed(1)}%`}
              defaultOpen
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[280px] text-sm">
                  <tbody>
                    {(
                      [
                        ["Total billed", formatMoney(billing.total_billed), false],
                        ["Collected", formatMoney(billing.collected), false],
                        ["Outstanding", formatMoney(billing.outstanding), outstandingAlert],
                        ["Waived", formatMoney(billing.waived), false],
                        ["No-show fees pending", formatMoney(billing.no_show_fees), false],
                        ["Collection rate", `${billing.collection_rate.toFixed(1)}%`, collectionAlert],
                      ] as const
                    ).map(([label, val, alert]) => (
                      <tr key={label} className="border-b border-[#d1e8d8]/70 last:border-0">
                        <td className="py-2.5 pr-4 font-medium text-[#5a7a62]">{label}</td>
                        <td
                          className={cn(
                            "py-2.5 text-right font-semibold tabular-nums text-[#0d1f14]",
                            alert && "text-rose-700",
                          )}
                        >
                          {val}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Link href="/admin/billing" className="mt-3 inline-block text-xs font-semibold text-[#16a349] hover:underline">
                Open invoices & billing →
              </Link>
            </CollapsibleDetails>

            <CollapsibleDetails
              title="By provider (this month)"
              summary={
                providers.length === 0
                  ? "No provider activity yet"
                  : `${providers.length} provider${providers.length === 1 ? "" : "s"} with visits or collections`
              }
              defaultOpen
            >
              {providers.length === 0 ? (
                <p className="text-sm text-[#5a7a62]">No provider activity recorded this month yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[280px] text-sm">
                    <thead>
                      <tr className="border-b border-[#d1e8d8] text-left text-[11px] font-semibold uppercase tracking-wide text-[#5a7a62]">
                        <th className="pb-2 pr-3">Provider</th>
                        <th className="pb-2 pr-3 text-right">Visits</th>
                        <th className="pb-2 text-right">Collected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {providers.map((p) => (
                        <tr key={p.provider_id} className="border-b border-[#d1e8d8]/70 last:border-0">
                          <td className="py-2.5 pr-3 font-medium text-[#0d1f14]">{p.name}</td>
                          <td className="py-2.5 pr-3 text-right tabular-nums text-[#5a7a62]">{p.visits_completed}</td>
                          <td className="py-2.5 text-right font-semibold tabular-nums text-[#0d1f14]">
                            {formatMoney(p.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CollapsibleDetails>
          </div>

          <CollapsibleDetails
            title="Revenue by service"
            summary="Top services on invoices paid this month"
            defaultOpen={false}
          >
            <AnalyticsRevenueByServiceChart data={data.revenue_by_service as RevenueByServiceItem[]} />
          </CollapsibleDetails>
        </TabsContent>

        <TabsContent value="patients" className="mt-0 space-y-5">
          {iris ? (
            <section className={cn(BANANI_CARD, "border-orange-200 bg-orange-50/40 p-4")}>
              <SectionHeading>IRIS clients</SectionHeading>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(
                  [
                    { label: "Tagged now", value: iris.tagged_total, sub: "On patient record" },
                    { label: "This week", value: iris.unique_this_week, sub: "Unique patients" },
                    { label: "This month", value: iris.unique_this_month, sub: "Unique patients" },
                    { label: "This quarter", value: iris.unique_this_quarter, sub: "Unique patients" },
                  ] as const
                ).map((box) => (
                  <div key={box.label} className="rounded-lg border border-orange-100 bg-white px-3 py-3 text-center sm:text-left">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-800/80">{box.label}</p>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-orange-950">{box.value}</p>
                    <p className="mt-1 text-xs text-[#5a7a62]">{box.sub}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className={cn(BANANI_CARD, "border-orange-200 bg-orange-50/30 p-4")}>
            <SectionHeading>Patients to re-engage</SectionHeading>
            {atRisk.length === 0 ? (
              <p className="text-sm text-[#5a7a62]">No patients in the 60–89 day window right now.</p>
            ) : (
              <ul className="max-h-[min(20rem,50vh)] space-y-2 overflow-y-auto pr-1">
                {atRisk.map((p) => (
                  <li key={p.patient_id}>
                    <Link
                      href={`/admin/patients/${p.patient_id}/history`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-[#d1e8d8] bg-white px-3 py-2.5 text-sm transition hover:border-[#16a349]/30 hover:bg-[#f8fdf9]"
                    >
                      <span className="font-medium text-[#0d1f14]">{p.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-orange-800">
                        {p.days_since_visit != null ? `${p.days_since_visit} days ago` : "—"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionHeading>Client health</SectionHeading>
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
                  <div key={item.key} className={cn(BANANI_CARD, "px-4 py-4", item.panel)}>
                    <p className="text-sm font-semibold text-[#0d1f14]">{item.label}</p>
                    <p className="text-xs text-[#5a7a62]">{item.sub}</p>
                    <p className="mt-3 text-3xl font-bold tabular-nums text-[#0d1f14]">{item.count}</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80">
                      <div className={cn("h-full rounded-full transition-all", item.bar)} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-xs tabular-nums text-[#5a7a62]">{pct}% of patients</p>
                  </div>
                );
              })}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="ai" className="mt-0">
          <section className={cn(BANANI_CARD, "p-4")}>
            <SectionHeading>AI voice summary</SectionHeading>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5a7a62]">Total calls</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-[#0d1f14]">{voice.total_calls}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5a7a62]">Booked via AI</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-[#166534]">
                  {voice.booked}
                  <span className="ml-2 text-base font-semibold text-[#5a7a62]">({voice.book_rate}%)</span>
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5a7a62]">Failed / dropped</p>
                <p
                  className={cn(
                    "mt-1 text-2xl font-bold tabular-nums",
                    voice.failed > 0 && voice.failed > voice.booked ? "text-rose-700" : "text-[#0d1f14]",
                  )}
                >
                  {voice.failed}
                </p>
              </div>
            </div>
            <Link href="/admin/ai" className="mt-4 inline-block text-xs font-semibold text-[#16a349] hover:underline">
              Open AI assistant settings →
            </Link>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
