"use client";

import { CalendarClock } from "lucide-react";

/**
 * Planned maintenance window (used only to show/hide the banner — not shown to staff).
 * Remove this component after maintenance is done.
 */
const SCHEDULED_MAINTENANCE = {
  startIso: "2026-07-08T00:00:00-04:00",
  endIso: "2026-07-08T04:00:00-04:00",
} as const;

/** Shown on the admin dashboard before and during a planned maintenance window. */
export function AdminMaintenanceNotice() {
  const now = Date.now();
  const startMs = new Date(SCHEDULED_MAINTENANCE.startIso).getTime();
  const endMs = new Date(SCHEDULED_MAINTENANCE.endIso).getTime();

  if (now >= endMs) return null;

  const inProgress = now >= startMs;

  return (
    <div
      className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-950 shadow-sm ring-1 ring-amber-100"
      role="status"
      aria-live="polite"
    >
      <div className="flex gap-3">
        <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
        <div className="space-y-1">
          <p className="font-semibold text-amber-950">
            {inProgress ? "Scheduled maintenance in progress" : "Scheduled maintenance planned"}
          </p>
          <p className="leading-relaxed text-amber-900/90">
            {inProgress
              ? "We are performing planned maintenance. The admin site and related services may be briefly unavailable. Thank you for your patience."
              : "Planned maintenance is coming up. The admin site and related services may be briefly unavailable. Please save your work beforehand."}
          </p>
        </div>
      </div>
    </div>
  );
}
