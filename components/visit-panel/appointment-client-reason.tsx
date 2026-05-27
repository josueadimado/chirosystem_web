"use client";

import { cn } from "@/lib/utils";

/**
 * Reason the patient typed when booking online (stored on the visit record).
 * Shown to doctors/staff before the visit starts so they know what to expect.
 */
export function AppointmentClientReason({
  reason,
  className,
  compact = false,
}: {
  reason?: string | null;
  className?: string;
  /** Smaller style for list rows and calendar tooltips. */
  compact?: boolean;
}) {
  const text = (reason || "").trim();
  if (!text) return null;

  if (compact) {
    return (
      <p className={cn("line-clamp-2 text-sm leading-snug text-sky-950", className)}>
        <span className="font-semibold text-sky-800">Reason: </span>
        {text}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-sky-200/90 bg-gradient-to-b from-sky-50/90 to-white px-3.5 py-3 shadow-sm ring-1 ring-sky-100/80",
        className,
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-sky-800">
        Patient&apos;s reason (from booking)
      </p>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{text}</p>
    </div>
  );
}
