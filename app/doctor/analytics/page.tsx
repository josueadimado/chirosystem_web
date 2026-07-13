"use client";

import { DoctorPageIntro, DoctorSectionLabel } from "@/components/doctor-shell";
import { HelpTip } from "@/components/help-tip";
import { Loader } from "@/components/loader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGetAuth } from "@/lib/api";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

// Recharts is large — load it only when the analytics page is actually visited.
const AnalyticsTrendChart = dynamic(
  () =>
    import("@/components/analytics-trend-chart").then((m) => ({ default: m.AnalyticsTrendChart })),
  { ssr: false, loading: () => <div className="h-[220px] animate-pulse rounded-xl bg-slate-100" /> },
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

type AnalyticsTab = "outreach" | "performance" | "trends";

const SESSION_PERIOD_OPTIONS = [
  { value: 4, label: "4 wk" },
  { value: 8, label: "8 wk" },
  { value: 12, label: "12 wk" },
  { value: 16, label: "16 wk" },
  { value: 24, label: "24 wk" },
] as const;

const NO_SHOW_RATE_ALERT = 15;

const TAB_TRIGGER_CLASS =
  "min-w-[6.5rem] flex-1 rounded-lg border-0 px-3 py-2 text-sm font-medium text-slate-600 shadow-none after:hidden hover:text-slate-900 data-active:bg-white data-active:text-slate-900 data-active:shadow-sm sm:flex-none";

const CHART_GREEN = "#16a349";
const CHART_ROSE = "#e11d48";
const CHART_SLATE = "#64748b";

function formatSeen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Needs-attention column: capped height + scroll so one long list does not stretch the page. */
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
        "doctor-panel flex flex-col",
        tone === "rose" && "border-rose-200/80 bg-rose-50/40",
        tone === "amber" && "border-amber-200/80 bg-amber-50/40",
      )}
    >
      <DoctorSectionLabel help={help}>{heading}</DoctorSectionLabel>
      {isEmpty ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="max-h-[min(20rem,42vh)] overflow-y-auto overscroll-y-contain rounded-lg border border-slate-100/90 bg-white/80 pr-0.5">
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
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("outreach");

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

  if (loading) {
    return (
      <div className="space-y-6">
        <DoctorPageIntro
          eyebrow="Insights"
          title="My analytics"
          description="Your performance and patients who may need a follow-up."
        />
        <Loader variant="page" label="Loading analytics" sublabel="Your clinic stats…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <DoctorPageIntro eyebrow="Insights" title="My analytics" description="Your performance overview." />
        <div className="doctor-panel border-amber-200 bg-amber-50 text-amber-950">
          <p className="text-sm font-medium">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-amber-50"
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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <DoctorPageIntro
          eyebrow="Insights"
          title="My analytics"
          description="Patients who may need outreach, your monthly performance, and session trends — only your appointments."
          pageHelp={
            <>
              Program names come from each patient&apos;s visit type. Care plans use a default of{" "}
              <strong>{planSessions} sessions</strong> until per-patient plans are added in the system. Use{" "}
              <strong>My Dashboard</strong> for today&apos;s live schedule and visits.
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

      {/* Compact today line — full day workflow lives on Dashboard */}
      <section className="rounded-2xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Today</p>
            <p className="mt-1 text-sm text-slate-700">
              <span className="font-semibold tabular-nums text-slate-900">{data.today.total}</span> patients ·{" "}
              <span className="font-semibold tabular-nums text-[#166534]">{data.today.completed}</span> done ·{" "}
              <span className="font-semibold tabular-nums text-amber-800">{data.today.remaining}</span> remaining
              {next ? (
                <>
                  {" "}
                  · Next: <span className="font-semibold text-slate-900">{next.name}</span> at {next.time}
                </>
              ) : null}
            </p>
          </div>
          <Link
            href="/doctor/dashboard"
            className="shrink-0 rounded-lg border border-[#16a349]/30 bg-[#ecfdf5] px-3 py-1.5 text-xs font-semibold text-[#0d5c2e] hover:bg-[#d1fae5]"
          >
            Open dashboard →
          </Link>
        </div>
      </section>

      {attentionTotals.total > 0 ? (
        <section
          className="rounded-2xl border border-amber-200/90 bg-amber-50/80 px-4 py-3.5 shadow-sm ring-1 ring-amber-100"
          aria-label="Needs attention"
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900/80">Needs attention</p>
          <p className="mt-1 text-sm text-amber-950">
            <span className="font-semibold tabular-nums">{attentionTotals.total}</span> patient
            {attentionTotals.total === 1 ? "" : "s"} may need a follow-up.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {attentionTotals.unscheduled > 0 ? (
              <button
                type="button"
                onClick={() => setActiveTab("outreach")}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                No upcoming session ({attentionTotals.unscheduled})
              </button>
            ) : null}
            {attentionTotals.missed > 0 ? (
              <button
                type="button"
                onClick={() => setActiveTab("outreach")}
                className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-50"
              >
                Missed 2+ sessions ({attentionTotals.missed})
              </button>
            ) : null}
            {attentionTotals.soon > 0 ? (
              <button
                type="button"
                onClick={() => setActiveTab("outreach")}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-50"
              >
                Completing soon ({attentionTotals.soon})
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {noShowAlert ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-950">
          <p className="font-semibold">No-show rate is {data.monthly_kpis.no_show_rate}% this month</p>
          <p className="mt-1 text-rose-900/90">
            Higher than usual — review reminders and patients who keep missing. See Performance for the full monthly
            picture.
          </p>
          <button
            type="button"
            onClick={() => setActiveTab("performance")}
            className="mt-2 text-xs font-semibold text-rose-900 underline hover:no-underline"
          >
            View performance →
          </button>
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AnalyticsTab)} className="gap-6">
        <TabsList className="flex h-auto w-full max-w-2xl flex-wrap gap-1 rounded-xl border border-slate-200/90 bg-slate-100/70 p-1 shadow-inner shadow-slate-200/30">
          <TabsTrigger value="outreach" className={TAB_TRIGGER_CLASS}>
            Outreach
            {attentionTotals.total > 0 ? (
              <span className="ml-1.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-900">
                {attentionTotals.total}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="performance" className={TAB_TRIGGER_CLASS}>
            Performance
          </TabsTrigger>
          <TabsTrigger value="trends" className={TAB_TRIGGER_CLASS}>
            Trends
          </TabsTrigger>
        </TabsList>

        <TabsContent value="outreach" className="mt-0 space-y-4">
          <p className="text-sm text-slate-600">
            Patients who may need a call or a next booking. Open a chart to schedule from there.
          </p>
          <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
            {/* Unscheduled first — usually the longest, most actionable list */}
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
                    <li key={row.patient_id} className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
                      <p className="text-sm font-semibold leading-snug text-slate-900">{row.name}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-slate-600">
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
                    <li key={row.patient_id} className="rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2">
                      <p className="font-semibold text-slate-900">{row.name}</p>
                      <p className="text-xs text-slate-600">
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
                    <li key={row.patient_id} className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2">
                      <p className="font-semibold text-slate-900">{row.name}</p>
                      <p className="text-xs text-slate-600">
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

        <TabsContent value="performance" className="mt-0 space-y-6">
          <section>
            <DoctorSectionLabel help="Current calendar month for your provider.">
              My monthly stats
            </DoctorSectionLabel>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {(
                [
                  {
                    label: "Patients seen",
                    value: String(data.monthly_kpis.patients_seen),
                    help: "Unique patients with a completed visit this month.",
                    alert: false,
                  },
                  {
                    label: "New patients",
                    value: String(data.monthly_kpis.new_patients),
                    help: "First appointment with you was this month.",
                    alert: false,
                  },
                  {
                    label: "Sessions completed",
                    value: String(data.monthly_kpis.sessions_completed),
                    help: "Completed visits you documented this month.",
                    alert: false,
                  },
                  {
                    label: "No-show rate",
                    value: `${data.monthly_kpis.no_show_rate}%`,
                    help: "No-shows ÷ (completed + cancelled + no-shows) this month.",
                    alert: noShowAlert,
                  },
                ] as const
              ).map((card) => (
                <div
                  key={card.label}
                  className={cn(
                    "doctor-panel",
                    card.alert && "border-rose-300/80 bg-rose-50/70 ring-1 ring-rose-200/50",
                  )}
                >
                  <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                    {card.label}
                    <HelpTip label={card.label}>{card.help}</HelpTip>
                  </p>
                  <p
                    className={cn(
                      "mt-3 text-3xl font-bold tabular-nums",
                      card.alert ? "text-rose-800" : "text-slate-900",
                    )}
                  >
                    {card.value}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="doctor-panel">
            <DoctorSectionLabel help="Grouped by visit type (program). Certificate = finished the care plan this month.">
              Program completion this month
            </DoctorSectionLabel>
            {data.completions_this_month.length === 0 ? (
              <p className="text-sm text-slate-500">No completed sessions recorded this month yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-4">Program</th>
                      <th className="py-2 pr-4 text-right">Clients completed</th>
                      <th className="py-2 pr-4 text-right">Certificates</th>
                      <th className="py-2 text-right">Avg sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.completions_this_month.map((row) => (
                      <tr key={row.program} className="border-b border-slate-100 last:border-0">
                        <td className="py-2.5 pr-4 font-medium text-slate-800">{row.program}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">{row.clients_completed}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">{row.certificates_issued}</td>
                        <td className="py-2.5 text-right tabular-nums text-slate-600">
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

        <TabsContent value="trends" className="mt-0">
          <AnalyticsTrendChart
            title="Session breakdown"
            help={
              <>
                Your appointments by week (Monday–Sunday). Use the period buttons to see a longer or shorter performance
                trend.
              </>
            }
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
            height={220}
            panelClassName="doctor-panel"
            loading={chartLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
