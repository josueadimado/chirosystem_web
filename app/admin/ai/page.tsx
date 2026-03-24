"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { HelpTip } from "@/components/help-tip";
import { IconBot } from "@/components/icons";
import { Loader } from "@/components/loader";
import { ApiError, apiGetAuth } from "@/lib/api";
import { useEffect, useState } from "react";

type VoiceAnalytics = {
  calls_today: number;
  booked_by_voice: number;
  escalated_or_failed: number;
  avg_handle_seconds: number | null;
  openai_configured: boolean;
};

type VoiceCallRow = {
  id: number;
  call_sid: string;
  from_number: string;
  transcript: string;
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

/**
 * Voice booking logs come from the API when Twilio webhooks run.
 * See repo README: Twilio Voice + OpenAI.
 */
export default function AdminAIPage() {
  const [analytics, setAnalytics] = useState<VoiceAnalytics | null>(null);
  const [calls, setCalls] = useState<VoiceCallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
          setCalls(c);
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
        description="Phone bookings through Twilio are logged here. Counts use the clinic timezone (same as SMS reminders)."
        pageHelp={
          <>
            Point Twilio Voice to <code className="rounded bg-slate-100 px-1">/api/v1/voice/twilio/incoming/</code> and set{" "}
            <strong>OPENAI_API_KEY</strong> plus <strong>TWILIO_VOICE_PUBLIC_BASE_URL</strong> on the API. Details: README → Twilio Voice +
            OpenAI.
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
                This only checks whether the API has an OpenAI key. Twilio must still be wired to the voice webhooks for calls to appear.
              </HelpTip>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              ["Calls today", String(analytics?.calls_today ?? 0), "Inbound calls that hit our voice webhook today (clinic timezone)."],
              [
                "Booked by voice",
                String(analytics?.booked_by_voice ?? 0),
                "Calls that ended with an appointment created from speech.",
              ],
              [
                "Not booked / dropped",
                String(analytics?.escalated_or_failed ?? 0),
                "Calls today that did not finish with a voice booking (hang-up, error, or slot issue).",
              ],
              [
                "Avg. handle (booked)",
                formatDuration(analytics?.avg_handle_seconds ?? null),
                "Rough time from first webhook to success, only for calls that booked.",
              ],
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
            <AdminSectionLabel help="Newest updates first. Transcript is what speech recognition heard.">
              Recent voice calls
            </AdminSectionLabel>
            {calls.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-gradient-to-b from-slate-50/60 to-white px-6 py-12 text-center">
                <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <IconBot className="h-7 w-7" />
                </span>
                <p className="text-sm font-semibold text-slate-800">No call logs yet</p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                  After Twilio sends traffic to the API, each call appears here with outcome and transcript.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200/90">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">When</th>
                      <th className="px-3 py-2">From</th>
                      <th className="px-3 py-2">Outcome</th>
                      <th className="px-3 py-2">Appointment</th>
                      <th className="px-3 py-2">Transcript</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {calls.map((row) => (
                      <tr key={row.id} className="align-top hover:bg-slate-50/50">
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                          {new Date(row.updated_at).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-700">{row.from_number || "—"}</td>
                        <td className="px-3 py-2">
                          <span className="font-medium text-slate-800">{row.outcome_label}</span>
                          {row.detail ? (
                            <p className="mt-0.5 max-w-[14rem] truncate text-xs text-slate-500" title={row.detail}>
                              {row.detail}
                            </p>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                          {row.appointment_id ? `#${row.appointment_id}` : "—"}
                        </td>
                        <td className="max-w-md px-3 py-2 text-slate-600">
                          <p className="line-clamp-2 text-xs" title={row.transcript}>
                            {row.transcript || "—"}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
