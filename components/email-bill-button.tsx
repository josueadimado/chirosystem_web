"use client";

import { formatPatientBillEmailSentButtonLabel } from "@/lib/patient-bill-email";
import { cn } from "@/lib/utils";

type EmailBillButtonProps = {
  onClick: () => void;
  sending?: boolean;
  sentTo?: string | null;
  className?: string;
  /** Default: "Email bill" */
  label?: string;
  compact?: boolean;
};

/** Email bill action with clear sending / sent states for staff. */
export function EmailBillButton({
  onClick,
  sending = false,
  sentTo = null,
  className,
  label = "Email bill",
  compact = false,
}: EmailBillButtonProps) {
  const sent = !!(sentTo || "").trim();

  return (
    <button
      type="button"
      disabled={sending || sent}
      onClick={onClick}
      title={sent && sentTo ? `Bill emailed to ${sentTo}` : undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-sm transition disabled:opacity-60",
        sent
          ? "border-emerald-400 bg-emerald-100 text-emerald-950"
          : "border-[#0f766e]/40 bg-white text-[#0d5c2e] hover:bg-emerald-50",
        compact && "px-3 py-2 text-xs",
        className,
      )}
    >
      {sending ? "Sending…" : sent ? formatPatientBillEmailSentButtonLabel(sentTo!) : label}
    </button>
  );
}
