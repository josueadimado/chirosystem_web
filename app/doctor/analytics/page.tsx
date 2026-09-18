"use client";

import { HelpTip } from "@/components/help-tip";
import { Loader } from "@/components/loader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGetAuth } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Calendar,
  CheckCircle2,
  Clock,
  TrendingUp,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

// Recharts is large — load it only when the analytics page is actually visited.
const AnalyticsTrendChart = dynamic(
  () =>
    import("@/components/analytics-trend-chart").then((m) => ({ default: m.AnalyticsTrendChart })),
  { ssr: false, loading: () => <div className="h-[220px] animate-pulse rounded-xl bg-[#f8fdf9]" /> },
);

type DoctorAnalyticsPayload = {
  today: {
    total: number;
    completed: number;
    remaining: number;
    next_patient: {
      patient_id: number;
      name: string;
      time: string;
      minutes_until: number;
    } | null;
  };
  monthly_kpis: {
    patients_seen: number;
    new_patients: number;
    sessions_completed: number;
    no_show_rate: number;
  };
  needs_attention: {
    missed_sessions: Array<{
      patient_id: number;
      name: string;
      program: string;
      last_seen: string | null;
    }>;
    completing_soon: Array<{
      patient_id: number;
      name: string;
      program: string;
      sessions_left: number;
    }>;
    unscheduled: Array<{
      patient_id: number;
      name: string;
      program: string;
      last_session: string | null;
    }>;
  };
  completions_this_month: Array<{
    program: string;
    clients_completed: number;
    certificates_issued: number;
    avg_sessions_to_complete: number | null;
  }>;
  weekly_sessions: Array<{
    week: string;
    sessions: number;
    completed: number;
    missed: number;
  }>;
  weekly_sessions_weeks?: number;
  care_plan_sessions?: number;
};

type AnalyticsTab = "overview" | "outreach" | "performance";

type AttentionItem = {
  id: string;
  tone: "rose" | "amber";
  title: string;
  detail: string;
  cta: string;
  tab: AnalyticsTab;
};

type StatTone = "primary" | "green" | "consult" | "red" | "grey";

const BANANI_CARD = "rounded-xl border border-[#e8e8e8] bg-white";

const SESSION_PERIOD_OPTIONS = [
  { value: 4, label: "4 wk" },
  { value: 8, label: "8 wk" },
  { value: 12, label: "12 wk" },
  { value: 16, label: "16 wk" },
  { value: 24, label: "24 wk" },
] as const;

const NO_SHOW_RATE_ALERT = 15;

const TAB_TRIGGER_CLASS =
  "min-w-[5.5rem] flex-1 rounded-none border-0 border-b-2 border-transparent bg-transparent px-4 py-2.5 text-sm font-medium text-[#5a7a62] shadow-none after:hidden hover:text-[#0d1f14] data-active:border-[#16a349] data-active:bg-transparent data-active:text-[#16a349] data-active:shadow-none sm:flex-none";

const CHART_GREEN = "#16a349";
const CHART_ROSE = "#e11d48";
const CHART_SLATE = "#64748b";

function formatSeen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
  help,
  alert,
  icon,
}: {
  title: string;
  value: string;
  help?: string;
  alert?: boolean;
  icon: ReactNode;
}) {
  return (
    <div className={cn(BANANI_CARD, "px-4 py-4", alert && "border-rose-200 bg-rose-50/50")}>
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1 text-xs font-medium text-[#5a7a62]">
          {title}
          {help ? <HelpTip label={title}>{help}</HelpTip> : null}
        </p>
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
    </div>
  );
}

/** Outreach column: capped height + scroll so one long list does not stretch the page. */
function AttentionList({
  title,
  help,
  empty,
  isEmpty,
  count,
  tone = "slate",
  children,
}: {
  title: string;
  help: string;
  empty: string;
  isEmpty: boolean;
  count?: number;
  tone?: "slate" | "amber" | "rose";
  children: React.ReactNode;
}) {
  const heading = count != null && count > 0 ? `${title} (${count})` : title;
  return (
    <div
      className={cn(
        BANANI_CARD,
        "flex flex-col p-4",
        tone === "rose" && "border-rose-200/80 bg-rose-50/40",
        tone === "amber" && "border-amber-200/80 bg-amber-50/40",
      )}
    >
      <div className="mb-3 flex items-center gap-1.5">
        <p className="text-sm font-semibold text-[#0d1f14]">{heading}</p>
        <HelpTip label={title}>{help}</HelpTip>
      </div>
      {isEmpty ? (
        <p className="text-sm text-[#5a7a62]">{empty}</p>
      ) : (
        <div className="max-h-[min(20rem,42vh)] overflow-y-auto overscroll-y-contain rounded-lg border border-[#d1e8d8] bg-white pr-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

export default function DoctorAnalyticsPage() {
  const [data, setData] = useState<DoctorAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionWeeks, setSessionWeeks] = useState(8);
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");

  const load = useCallback(
    async (opts?: { weeks?: number; chartOnly?: boolean }) => {
      const weeks = opts?.weeks ?? sessionWeeks;
      if (opts?.chartOnly) setChartLoading(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const payload = await apiGetAuth<DoctorAnalyticsPayload>(`/doctor/my-analytics/?weeks=${weeks}`);
        if (opts?.chartOnly) {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  weekly_sessions: payload.weekly_sessions,
                  weekly_sessions_weeks: payload.weekly_sessions_weeks ?? weeks,
                }
              : payload,
          );
        } else {
          setData(payload);
        }
        if (payload.weekly_sessions_weeks) setSessionWeeks(payload.weekly_sessions_weeks);
        else if (opts?.weeks != null) setSessionWeeks(weeks);
      } catch (e) {
        if (!opts?.chartOnly) setError(e instanceof Error ? e.message : "Failed to load analytics");
      } finally {
        setLoading(false);
        setChartLoading(false);
      }
    },
    [sessionWeeks],
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  const attentionTotals = useMemo(() => {
    if (!data) return { missed: 0, soon: 0, unscheduled: 0, total: 0 };
    const missed = data.needs_attention.missed_sessions.length;
    const soon = data.needs_attention.completing_soon.length;
    const unscheduled = data.needs_attention.unscheduled.length;
    return { missed, soon, unscheduled, total: missed + soon + unscheduled };
  }, [data]);

  const attentionItems = useMemo((): AttentionItem[] => {
    if (!data) return [];
    const items: AttentionItem[] = [];
    const { missed, soon, unscheduled } = attentionTotals;

    if (unscheduled > 0) {
      items.push({
        id: "unscheduled",
        tone: "amber",
        title: `${unscheduled} patient${unscheduled === 1 ? "" : "s"} with no upcoming session`,
        detail: "They saw you before but nothing is booked ahead — good candidates to call.",
        tab: "outreach",
        cta: "View outreach",
      });
    }

    if (missed > 0) {
      items.push({
        id: "missed",
        tone: "rose",
        title: `${missed} patient${missed === 1 ? "" : "s"} missed 2+ sessions`,
        detail: "Last two or more visits were cancelled or no-show.",
        tab: "outreach",
        cta: "View outreach",
      });
    }

    if (soon > 0) {
      items.push({
        id: "completing",
        tone: "amber",
        title: `${soon} patient${soon === 1 ? "" : "s"} completing a program soon`,
        detail: "Within a couple of sessions of finishing their care plan.",
        tab: "outreach",
        cta: "View outreach",
      });
    }

    if (data.monthly_kpis.no_show_rate >= NO_SHOW_RATE_ALERT) {
      items.push({
        id: "noshow-rate",
        tone: "rose",
        title: `No-show rate is ${data.monthly_kpis.no_show_rate}% this month`,
        detail: "Higher than usual — review reminders and patients who keep missing.",
        tab: "performance",
        cta: "View performance",
      });
    }

    return items;
  }, [data, attentionTotals]);

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
        <Loader variant="page" label="Loading analytics" sublabel="Your clinic stats…" />
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

  const planSessions = data.care_plan_sessions ?? 12;
  const next = data.today.next_patient;
  const attn = data.needs_attention;
  const noShowAlert = data.monthly_kpis.no_show_rate >= NO_SHOW_RATE_ALERT;
  const nextLabel = next
    ? next.minutes_until <= 0
      ? next.name
      : `${next.name} · ${next.time}`
    : "None";

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
                  item.tone === "rose" ? "border-rose-200 bg-rose-50" : "border-orange-200 bg-orange-50",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#0d1f14]">{item.title}</p>
                  <p className="mt-0.5 text-xs text-[#5a7a62]">{item.detail}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab(item.tab)}
                  className="shrink-0 rounded-lg border border-[#d1e8d8] bg-white px-3 py-1.5 text-xs font-semibold text-[#16a349] hover:bg-[#f8fdf9]"
                >
                  {item.cta}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <SectionHeading>Today</SectionHeading>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SnapshotStatCard
            label="On schedule"
            value={String(data.today.total)}
            icon={<Calendar className="h-[18px] w-[18px]" />}
          />
          <SnapshotStatCard
            label="Completed"
            value={String(data.today.completed)}
            tone="green"
            icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
          />
          <SnapshotStatCard
            label="Remaining"
            value={String(data.today.remaining)}
            tone="consult"
            alert={data.today.remaining > 0}
            icon={<Clock className="h-[18px] w-[18px]" />}
          />
          <SnapshotStatCard
            label="Next patient"
            value={nextLabel}
            tone="grey"
            icon={<Users className="h-[18px] w-[18px]" />}
          />
        </div>
      </section>

      <section>
        <SectionHeading>This month</SectionHeading>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Patients seen"
            value={String(data.monthly_kpis.patients_seen)}
            help="Unique patients with a completed visit this month."
            icon={<Users className="h-4 w-4" />}
          />
          <KpiCard
            title="New patients"
            value={String(data.monthly_kpis.new_patients)}
            help="First appointment with you was this month."
            icon={<UserPlus className="h-4 w-4" />}
          />
          <KpiCard
            title="Sessions completed"
            value={String(data.monthly_kpis.sessions_completed)}
            help="Completed visits you documented this month."
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <KpiCard
            title="No-show rate"
            value={`${data.monthly_kpis.no_show_rate}%`}
            help="No-shows ÷ (completed + cancelled + no-shows) this month."
            alert={noShowAlert}
            icon={<UserX className="h-4 w-4" />}
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
          <TabsTrigger value="outreach" className={TAB_TRIGGER_CLASS}>
            Outreach
            {attentionTotals.total > 0 ? (
              <span className="ml-1.5 rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-orange-900">
                {attentionTotals.total}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="performance" className={TAB_TRIGGER_CLASS}>
            Performance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0 space-y-5">
          <AnalyticsTrendChart
            title="Session breakdown"
            help=""
            data={data.weekly_sessions}
            xKey="week"
            series={[
              { dataKey: "completed", name: "Completed", color: CHART_GREEN },
              { dataKey: "missed", name: "Cancelled / no-show", color: CHART_ROSE },
              { dataKey: "sessions", name: "Scheduled", color: CHART_SLATE },
            ]}
            periodLabel="Show"
            periodValue={sessionWeeks}
            periodOptions={[...SESSION_PERIOD_OPTIONS]}
            onPeriodChange={(v) => {
              if (v === sessionWeeks) return;
              void load({ weeks: v, chartOnly: true });
            }}
            valueFormatter={(v) => `${v} visit${v === 1 ? "" : "s"}`}
            yTickFormatter={(v) => String(Math.round(v))}
            height={240}
            loading={chartLoading}
            panelClassName={cn(BANANI_CARD, "p-4")}
          />
        </TabsContent>

        <TabsContent value="outreach" className="mt-0 space-y-4">
          <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
            <AttentionList
              title="No upcoming session"
              help="Had a visit with you before but nothing scheduled ahead. Scroll inside this box when the list is long."
              empty="Everyone has a future visit booked."
              isEmpty={attn.unscheduled.length === 0}
              count={attn.unscheduled.length}
              tone="slate"
            >
              {attn.unscheduled.length > 0 ? (
                <ul className="space-y-2 p-2">
                  {attn.unscheduled.map((row) => (
                    <li
                      key={row.patient_id}
                      className="rounded-lg border border-[#d1e8d8] bg-[#f8fdf9] px-3 py-2"
                    >
                      <p className="text-sm font-semibold leading-snug text-[#0d1f14]">{row.name}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-[#5a7a62]">
                        {row.program} · Last session {formatSeen(row.last_session)}
                      </p>
                      <Link
                        href={`/doctor/patients/${row.patient_id}/record`}
                        className="mt-1.5 inline-block text-[11px] font-semibold text-[#16a349] hover:underline"
                      >
                        Book next visit →
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </AttentionList>

            <AttentionList
              title="Missed 2+ sessions"
              help="Last two or more appointments in a row were cancelled or no-show."
              empty="No one flagged — great retention."
              isEmpty={attn.missed_sessions.length === 0}
              count={attn.missed_sessions.length}
              tone="rose"
            >
              {attn.missed_sessions.length > 0 ? (
                <ul className="space-y-2 p-2">
                  {attn.missed_sessions.map((row) => (
                    <li
                      key={row.patient_id}
                      className="rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2"
                    >
                      <p className="font-semibold text-[#0d1f14]">{row.name}</p>
                      <p className="text-xs text-[#5a7a62]">
                        {row.program} · Last seen {formatSeen(row.last_seen)}
                      </p>
                      <Link
                        href={`/doctor/patients/${row.patient_id}/record`}
                        className="mt-2 inline-block text-xs font-semibold text-[#16a349] hover:underline"
                      >
                        Book next visit →
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </AttentionList>

            <AttentionList
              title="Completing program soon"
              help={`Within 2 sessions of the ${planSessions}-visit care plan.`}
              empty="No patients near plan completion."
              isEmpty={attn.completing_soon.length === 0}
              count={attn.completing_soon.length}
              tone="amber"
            >
              {attn.completing_soon.length > 0 ? (
                <ul className="space-y-2 p-2">
                  {attn.completing_soon.map((row) => (
                    <li
                      key={row.patient_id}
                      className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2"
                    >
                      <p className="font-semibold text-[#0d1f14]">{row.name}</p>
                      <p className="text-xs text-[#5a7a62]">
                        {row.program} · {row.sessions_left} session{row.sessions_left === 1 ? "" : "s"} left
                      </p>
                      <Link
                        href={`/doctor/patients/${row.patient_id}/record`}
                        className="mt-2 inline-block text-xs font-semibold text-[#16a349] hover:underline"
                      >
                        View chart →
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </AttentionList>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="mt-0 space-y-5">
          <section className={cn(BANANI_CARD, "p-4")}>
            <div className="mb-3 flex items-center gap-1.5">
              <p className="text-sm font-semibold text-[#0d1f14]">Program completion this month</p>
              <HelpTip label="Program completion">
                Grouped by visit type (program). Certificate = finished the care plan this month.
              </HelpTip>
            </div>
            {data.completions_this_month.length === 0 ? (
              <p className="text-sm text-[#5a7a62]">No completed sessions recorded this month yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-[#d1e8d8] text-left text-[11px] font-semibold uppercase tracking-wide text-[#5a7a62]">
                      <th className="py-2 pr-4">Program</th>
                      <th className="py-2 pr-4 text-right">Clients completed</th>
                      <th className="py-2 pr-4 text-right">Certificates</th>
                      <th className="py-2 text-right">Avg sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.completions_this_month.map((row) => (
                      <tr key={row.program} className="border-b border-[#d1e8d8]/70 last:border-0">
                        <td className="py-2.5 pr-4 font-medium text-[#0d1f14]">{row.program}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-[#0d1f14]">{row.clients_completed}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-[#0d1f14]">{row.certificates_issued}</td>
                        <td className="py-2.5 text-right tabular-nums text-[#5a7a62]">
                          {row.avg_sessions_to_complete != null ? row.avg_sessions_to_complete.toFixed(1) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
