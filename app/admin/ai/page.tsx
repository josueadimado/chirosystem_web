"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { HelpTip } from "@/components/help-tip";
import { IconBot } from "@/components/icons";
import { Loader } from "@/components/loader";
import { ApiError, apiGetAuth } from "@/lib/api";
import { formatInstantMonthDayYearTime } from "@/lib/format-date";
import { useEffect, useState } from "react";

type VoiceAnalytics = {
  calls_today: number;
  booked_by_voice: number;
  escalated_or_failed: number;
  avg_handle_seconds: number | null;
  openai_configured: boolean;
};

type ConversationTurn = {
  role: string;
  text: string;
  step?: string;
  at?: string;
};

type VoiceCallRow = {
  id: number;
  call_sid: string;
  from_number: string;
  transcript: string;
  conversation_log: ConversationTurn[];
  outcome: string;
  outcome_label: string;
  detail: string;
  appointment_id: number | null;
  created_at: string;
  updated_at: string;
};

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds < 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function roleLabel(role: string): string {
  if (role === "caller") return "Caller";
  if (role === "assistant") return "Sarah";
  if (role === "system") return "System";
  return role;
}

function roleStyles(role: string): string {
  if (role === "caller") return "bg-sky-50 border-sky-200 text-sky-950";
  if (role === "assistant") return "bg-emerald-50 border-emerald-200 text-emerald-950";
  return "bg-slate-50 border-slate-200 text-slate-700";
}

/**
 * Voice booking logs from the API (Twilio + ConversationRelay).
 */
export default function AdminAIPage() {
  const [analytics, setAnalytics] = useState<VoiceAnalytics | null>(null);
  const [calls, setCalls] = useState<VoiceCallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [a, c] = await Promise.all([
          apiGetAuth<VoiceAnalytics>("/admin/voice_analytics/"),
          apiGetAuth<VoiceCallRow[]>("/admin/voice_calls/?limit=50"),
        ]);
        if (!cancelled) {
          setAnalytics(a);
          setCalls(
            c.map((row) => ({
              ...row,
              conversation_log: Array.isArray(row.conversation_log) ? row.conversation_log : [],
            }))
          );
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Could not load voice data.");
          setAnalytics(null);
          setCalls([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const statusLabel = analytics?.openai_configured ? "Ready on server" : "OpenAI key missing on API";

  return (
    <div className="space-y-6">
      <AdminPageIntro
        title="AI voice assistant"
        description="Phone bookings through Twilio are logged here. Open a call to read the full conversation."
        pageHelp={
          <>
            Point Twilio Voice to <code className="rounded bg-slate-100 px-1">/api/v1/voice/twilio/incoming/</code> and set{" "}
            <strong>OPENAI_API_KEY</strong> plus <strong>TWILIO_VOICE_PUBLIC_BASE_URL</strong> on the API.
          </>
        }
      />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      )}

      {loading ? (
        <Loader variant="page" label="Loading voice stats" sublabel="Almost there…" />
      ) : (
        <>
          <div className="admin-panel flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">API status</p>
              <p className="mt-1 text-sm text-slate-500">{statusLabel}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  analytics?.openai_configured ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                }`}
              >
                {analytics?.openai_configured ? "OpenAI set" : "Configure OpenAI"}
              </span>
              <HelpTip label="Status">
                This only checks whether the API has an OpenAI key. Twilio must still be wired to the voice webhooks.
              </HelpTip>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              ["Calls today", String(analytics?.calls_today ?? 0), "Inbound calls that hit our voice webhook today."],
              ["Booked by voice", String(analytics?.booked_by_voice ?? 0), "Calls that ended with an appointment created."],
              ["Not booked / dropped", String(analytics?.escalated_or_failed ?? 0), "Calls that did not finish with a voice booking."],
              ["Avg. handle (booked)", formatDuration(analytics?.avg_handle_seconds ?? null), "Time from start to booked calls only."],
            ].map(([label, value, tip]) => (
              <div key={label} className="admin-panel">
                <p className="flex items-center gap-1.5 text-sm text-slate-500">
                  {label}
                  <HelpTip label={String(label)}>{tip}</HelpTip>
                </p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          <div className="admin-panel">
            <AdminSectionLabel help="Click View conversation to see every caller and Sarah line. Older calls may only show the last caller line.">
              Recent voice calls
            </AdminSectionLabel>
            {calls.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-gradient-to-b from-slate-50/60 to-white px-6 py-12 text-center">
                <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <IconBot className="h-7 w-7" />
                </span>
                <p className="text-sm font-semibold text-slate-800">No call logs yet</p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                  After someone calls the booking line, each call appears here with outcome and full transcript.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {calls.map((row) => {
                  const turns = row.conversation_log?.length ?? 0;
                  const expanded = expandedId === row.id;
                  return (
                    <div
                      key={row.id}
                      className="rounded-xl border border-slate-200/90 bg-white overflow-hidden"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900">
                            {formatInstantMonthDayYearTime(row.updated_at)}
                            <span className="ml-2 font-mono text-xs font-normal text-slate-500">
                              {row.from_number || "Unknown number"}
                            </span>
                          </p>
                          <p className="mt-1 text-sm text-slate-700">
                            <span className="font-medium">{row.outcome_label}</span>
                            {row.appointment_id ? (
                              <span className="ml-2 text-slate-500">Appointment #{row.appointment_id}</span>
                            ) : null}
                          </p>
                          {row.detail ? (
                            <p className="mt-1 text-xs text-slate-500">{row.detail}</p>
                          ) : null}
                          {!expanded && row.transcript ? (
                            <p className="mt-2 text-xs text-slate-500 line-clamp-1">
                              Last heard: {row.transcript}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : row.id)}
                          className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          {expanded ? "Hide conversation" : turns > 0 ? `View conversation (${turns})` : "View conversation"}
                        </button>
                      </div>
                      {expanded ? (
                        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-4">
                          {turns === 0 ? (
                            <p className="text-sm text-slate-500">
                              No full transcript was saved for this call (it may have been before conversation logging was enabled).
                              {row.transcript ? (
                                <>
                                  {" "}
                                  Last caller line: <em>{row.transcript}</em>
                                </>
                              ) : null}
                            </p>
                          ) : (
                            <ul className="space-y-2 max-h-[28rem] overflow-y-auto">
                              {row.conversation_log.map((turn, i) => (
                                <li
                                  key={`${row.id}-${i}`}
                                  className={`rounded-lg border px-3 py-2 text-sm ${roleStyles(turn.role)}`}
                                >
                                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">
                                    <span>{roleLabel(turn.role)}</span>
                                    {turn.step ? <span className="normal-case font-normal">· step: {turn.step}</span> : null}
                                    {turn.at ? (
                                      <span className="normal-case font-normal text-slate-500">
                                        · {formatInstantMonthDayYearTime(turn.at)}
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="mt-1 whitespace-pre-wrap leading-relaxed">{turn.text}</p>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
