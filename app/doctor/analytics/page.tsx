"use client";

import { DoctorPageIntro, DoctorSectionLabel, DoctorStatsRow } from "@/components/doctor-shell";
import { HelpTip } from "@/components/help-tip";
import { Loader } from "@/components/loader";
import { apiGetAuth } from "@/lib/api";
import dynamic from "next/dynamic";

// Recharts is large — load it only when the analytics page is actually visited.
const AnalyticsTrendChart = dynamic(
  () =>
    import("@/components/analytics-trend-chart").then((m) => ({ default: m.AnalyticsTrendChart })),
  { ssr: false, loading: () => <div className="h-[220px] animate-pulse rounded-xl bg-slate-100" /> },
);
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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

const SESSION_PERIOD_OPTIONS = [
  { value: 4, label: "4 wk" },
  { value: 8, label: "8 wk" },
  { value: 12, label: "12 wk" },
  { value: 16, label: "16 wk" },
  { value: 24, label: "24 wk" },
] as const;

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
  children,
}: {
  title: string;
  help: string;
  empty: string;
  isEmpty: boolean;
  /** Shown in the heading, e.g. "No upcoming session (24)". */
  count?: number;
  children: React.ReactNode;
}) {
  const heading = count != null && count > 0 ? `${title} (${count})` : title;
  return (
    <div className="doctor-panel flex flex-col">
      <DoctorSectionLabel help={help}>{heading}</DoctorSectionLabel>
      {isEmpty ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="max-h-[min(20rem,42vh)] overflow-y-auto overscroll-y-contain rounded-lg border border-slate-100/90 bg-white/50 pr-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

const CHART_GREEN = "#16a349";
const CHART_ROSE = "#e11d48";
const CHART_SLATE = "#64748b";

export default function DoctorAnalyticsPage() {
  const [data, setData] = useState<DoctorAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionWeeks, setSessionWeeks] = useState(8);

  const load = useCallback(async (opts?: { weeks?: number; chartOnly?: boolean }) => {
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
  }, [sessionWeeks]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <DoctorPageIntro
          eyebrow="Insights"
          title="My analytics"
          description="Your schedule, monthly performance, and patients who may need outreach — only your appointments and visits."
          pageHelp={
            <>
              Program names come from each patient&apos;s visit type. Care plans use a default of{" "}
              <strong>{planSessions} sessions</strong> until per-patient plans are added in the system.
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

      {/* Section 1 — Today */}
      <section>
        <DoctorSectionLabel help="Today's calendar for your provider account only.">
          Today at a glance
        </DoctorSectionLabel>
        <DoctorStatsRow
          stats={[
            { label: "Patients today", value: data.today.total, help: "Distinct patients with a visit today (not cancelled)." },
            { label: "Completed", value: data.today.completed, tone: "accent" },
            { label: "Remaining", value: data.today.remaining, tone: "amber" },
          ]}
        />
        <div className="doctor-panel mt-4 border-[#16a349]/20 bg-gradient-to-br from-[#ecfdf5]/60 to-white">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#14532d]/80">Next patient</p>
          {next ? (
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xl font-bold text-slate-900">{next.name}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {next.time}
                  {next.minutes_until > 0 ? (
                    <span className="ml-2 font-medium text-[#166534]">in {next.minutes_until} min</span>
                  ) : (
                    <span className="ml-2 font-medium text-[#166534]">now / in progress</span>
                  )}
                </p>
              </div>
              <Link
                href={`/doctor/patients/${next.patient_id}/record`}
                className="rounded-lg bg-[#16a349] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13823d]"
              >
                Open chart
              </Link>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No more patients scheduled for today.</p>
          )}
        </div>
      </section>

      {/* Section 2 — Monthly KPIs */}
      <section>
        <DoctorSectionLabel help="Current calendar month for your provider.">
          My monthly stats
        </DoctorSectionLabel>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              { label: "Patients seen", value: data.monthly_kpis.patients_seen, help: "Unique patients with a completed visit this month." },
              { label: "New patients", value: data.monthly_kpis.new_patients, help: "First appointment with you was this month." },
              { label: "Sessions completed", value: data.monthly_kpis.sessions_completed, help: "Completed visits you documented this month." },
              {
                label: "No-show rate",
                value: `${data.monthly_kpis.no_show_rate}%`,
                help: "No-shows ÷ (completed + cancelled + no-shows) this month.",
              },
            ] as const
          ).map((card) => (
            <div key={card.label} className="doctor-panel">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                {card.label}
                <HelpTip label={card.label}>{card.help}</HelpTip>
              </p>
              <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{card.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3 — Needs attention */}
      <section className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <AttentionList
          title="Missed 2+ sessions"
          help="Last two or more appointments in a row were cancelled or no-show."
          empty="No one flagged — great retention."
          isEmpty={attn.missed_sessions.length === 0}
          count={attn.missed_sessions.length}
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
                    Schedule session →
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
                    View client →
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </AttentionList>

        <AttentionList
          title="No upcoming session"
          help="Had a visit with you before but nothing scheduled ahead. Scroll inside this box when the list is long — the rest of the page stays compact."
          empty="Everyone has a future visit booked."
          isEmpty={attn.unscheduled.length === 0}
          count={attn.unscheduled.length}
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
                    Schedule session →
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </AttentionList>
      </section>

      {/* Section 4 — Program completion */}
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

      {/* Section 5 — Session trend (line + period filter) */}
      <AnalyticsTrendChart
        title="Session breakdown"
        help={
          <>
            Your appointments by week (Monday–Sunday). Use the period buttons to see a longer or shorter performance trend.
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
    </div>
  );
}
