"use client";

import { IconCheck } from "@/components/icons";
import { cn } from "@/lib/utils";

type BookingProviderCardProps = {
  name: string;
  /** Optional short line under the name (real data only — never invent credentials) */
  subtitle?: string;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
};

function initialsFromName(name: string): string {
  const cleaned = name.replace(/,.*/, "").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

/**
 * Banani-style selectable provider card for the booking wizard (Step 2).
 * Uses initials avatar — we do not invent photos, credentials, or specialties.
 */
export function BookingProviderCard({
  name,
  subtitle,
  selected = false,
  onClick,
  disabled = false,
  className,
}: BookingProviderCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={cn(
        "flex flex-col items-center gap-4 rounded-xl border-2 p-6 text-center transition-colors",
        selected
          ? "border-[#16a349] bg-[#dbe7fb]"
          : "border-[#e8e8e8] bg-white hover:border-[#16a349]/50 hover:bg-[#ecfdf5]",
        (disabled || !onClick) && !selected && "cursor-default opacity-90",
        (disabled || !onClick) && selected && "cursor-default",
        className,
      )}
      aria-pressed={selected}
    >
      <div
        className={cn(
          "flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 text-xl font-bold",
          selected
            ? "border-[#16a349]/30 bg-[#16a349] text-white"
            : "border-[#e8e8e8] bg-[#ecfdf5] text-[#0d5c2e]",
        )}
        aria-hidden
      >
        {initialsFromName(name)}
      </div>
      <div className="flex flex-col gap-1">
        <div
          className={cn(
            "text-base font-semibold",
            selected ? "text-[#16a349]" : "text-[#0d1f14]",
          )}
        >
          {name}
        </div>
        {subtitle ? (
          <div className="text-sm leading-relaxed text-[#949494]">{subtitle}</div>
        ) : null}
      </div>
      {selected ? (
        <div className="mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#16a349] text-white">
          <IconCheck className="h-3 w-3" />
        </div>
      ) : (
        <div className="mt-1 h-5 w-5" aria-hidden />
      )}
    </button>
  );
}
