"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { HelpTip } from "@/components/help-tip";
import { IconBot } from "@/components/icons";

/**
 * AI phone / voice features are not connected to the clinic API yet.
 * This page shows an honest empty state instead of demo numbers.
 */
export default function AdminAIPage() {
  return (
    <div className="space-y-6">
      <AdminPageIntro
        title="AI voice assistant"
        description="When a phone or voice integration is connected, call volume, bookings from the bot, and escalations will appear here."
        pageHelp="There is no AI analytics endpoint in the API yet. This screen is ready to plug in once your voice provider sends events to the backend."
      />

      <div className="admin-panel flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">Integration status</p>
          <p className="mt-1 text-sm text-slate-500">Not connected — no live data.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Offline</span>
          <HelpTip label="Status">
            “Offline” means the app is not receiving AI call metrics from your server. It is not an error with your staff logins.
          </HelpTip>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          ["Calls today", "0", "Inbound calls handled by the assistant since midnight."],
          ["Booked by AI", "0", "Appointments created without front-desk staff."],
          ["Escalated", "0", "Calls transferred or flagged for a human."],
          ["Avg. handle time", "—", "Average length of completed calls."],
        ].map(([label, value, tip]) => (
          <div key={label} className="admin-panel opacity-90">
            <p className="flex items-center gap-1.5 text-sm text-slate-500">
              {label}
              <HelpTip label={String(label)}>{tip}</HelpTip>
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-400">{value}</p>
          </div>
        ))}
      </div>

      <div className="admin-panel">
        <AdminSectionLabel help="A future API version can append rows for each caller, intent, and outcome.">
          Call activity
        </AdminSectionLabel>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-gradient-to-b from-slate-50/60 to-white px-6 py-14 text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <IconBot className="h-7 w-7" />
          </span>
          <p className="text-sm font-semibold text-slate-800">No call logs yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
            Connect your voice or AI provider to the API to see real callers, intents, and durations. Until then, this list stays empty on
            purpose — we do not show fake demo rows.
          </p>
        </div>
      </div>
    </div>
  );
}
