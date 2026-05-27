"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { HelpTip } from "@/components/help-tip";
import { IconBot } from "@/components/icons";
import { Loader } from "@/components/loader";
import { ApiError, apiGetAuth } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatInstantMonthDayYearTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const CALLS_PAGE_SIZE = 15;

function formatCallWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function outcomeChipClass(outcome: string): string {
  if (outcome === "booked") return "bg-emerald-100 text-emerald-800";
  if (outcome === "disconnected" || outcome === "prompted") return "bg-slate-100 text-slate-600";
  return "bg-amber-50 text-amber-900";
}

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
  const [conversationCall, setConversationCall] = useState<VoiceCallRow | null>(null);
  const [callsPage, setCallsPage] = useState(0);

  const callsPageCount = Math.max(1, Math.ceil(calls.length / CALLS_PAGE_SIZE));
  const pagedCalls = useMemo(() => {
    const start = callsPage * CALLS_PAGE_SIZE;
    return calls.slice(start, start + CALLS_PAGE_SIZE);
  }, [calls, callsPage]);

  useEffect(() => {
    if (callsPage >= callsPageCount) setCallsPage(Math.max(0, callsPageCount - 1));
  }, [callsPage, callsPageCount]);

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
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <AdminSectionLabel help="Compact summary per call. Open a row to read the full conversation in a popup.">
                Recent voice calls
              </AdminSectionLabel>
              {calls.length > 0 ? (
                <p className="text-xs font-medium text-slate-500">
                  {calls.length} total · page {callsPage + 1} of {callsPageCount}
                </p>
              ) : null}
            </div>
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
              <>
              <div className="overflow-x-auto rounded-xl border border-slate-200/90">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">When</th>
                      <th className="px-3 py-2">From</th>
                      <th className="px-3 py-2">Outcome</th>
                      <th className="px-3 py-2">Appt</th>
                      <th className="px-3 py-2 text-right"> </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {pagedCalls.map((row) => {
                      const turns = row.conversation_log?.length ?? 0;
                      return (
                        <tr key={row.id} className="hover:bg-slate-50/60">
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">
                            {formatCallWhen(row.updated_at)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-700">
                            {row.from_number || "—"}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                "inline-block max-w-[14rem] truncate rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                outcomeChipClass(row.outcome),
                              )}
                              title={row.detail ? `${row.outcome_label} — ${row.detail}` : row.outcome_label}
                            >
                              {row.outcome_label}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">
                            {row.appointment_id ? (
                              <Link
                                href={`/admin/schedule?appointment=${row.appointment_id}`}
                                className="font-medium text-[#16a349] hover:underline"
                              >
                                #{row.appointment_id}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => setConversationCall(row)}
                              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              {turns > 0 ? `Transcript (${turns})` : "Transcript"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {callsPageCount > 1 ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={callsPage === 0}
                    onClick={() => setCallsPage((p) => Math.max(0, p - 1))}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-slate-500">
                    Showing {callsPage * CALLS_PAGE_SIZE + 1}–
                    {Math.min((callsPage + 1) * CALLS_PAGE_SIZE, calls.length)} of {calls.length}
                  </span>
                  <button
                    type="button"
                    disabled={callsPage >= callsPageCount - 1}
                    onClick={() => setCallsPage((p) => Math.min(callsPageCount - 1, p + 1))}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              ) : null}

              <Dialog open={conversationCall !== null} onOpenChange={(open) => !open && setConversationCall(null)}>
                <DialogContent
                  className={cn(
                    "flex w-[calc(100%-2rem)] max-h-[min(92dvh,44rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0",
                    "top-[max(1rem,4dvh)] translate-y-0 sm:min-w-[32rem]",
                  )}
                >
                  {conversationCall ? (
                    <>
                      <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4 pr-12 sm:px-6">
                        <DialogTitle className="text-base font-semibold text-slate-900">Call transcript</DialogTitle>
                        <DialogDescription className="text-xs text-slate-600">
                          {formatInstantMonthDayYearTime(conversationCall.updated_at)} ·{" "}
                          {conversationCall.from_number || "Unknown number"} · {conversationCall.outcome_label}
                          {conversationCall.appointment_id ? (
                            <>
                              {" "}
                              ·{" "}
                              <Link
                                href={`/admin/schedule?appointment=${conversationCall.appointment_id}`}
                                className="font-medium text-[#16a349] hover:underline"
                                onClick={() => setConversationCall(null)}
                              >
                                Appt #{conversationCall.appointment_id}
                              </Link>
                            </>
                          ) : null}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                        {(conversationCall.conversation_log?.length ?? 0) === 0 ? (
                          <p className="text-sm text-slate-500">
                            No full transcript was saved for this call.
                            {conversationCall.transcript ? (
                              <>
                                {" "}
                                Last caller line: <em>{conversationCall.transcript}</em>
                              </>
                            ) : null}
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {conversationCall.conversation_log.map((turn, i) => (
                              <li
                                key={`${conversationCall.id}-${i}`}
                                className={`rounded-lg border px-3 py-2 text-sm ${roleStyles(turn.role)}`}
                              >
                                <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide opacity-80">
                                  <span>{roleLabel(turn.role)}</span>
                                  {turn.step ? (
                                    <span className="normal-case font-normal">· {turn.step}</span>
                                  ) : null}
                                </div>
                                <p className="mt-1 whitespace-pre-wrap text-sm leading-snug">{turn.text}</p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </>
                  ) : null}
                </DialogContent>
              </Dialog>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
