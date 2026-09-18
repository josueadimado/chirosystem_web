"use client";

import { cn } from "@/lib/utils";

type BookingProgressProps = {
  /** Zero-based index of the current step */
  current: number;
  steps?: string[];
  className?: string;
  /** When true, clicking a completed or earlier step calls onStepClick(1-based step) */
  onStepClick?: (stepIndex1Based: number) => void;
};

/**
 * Banani-style booking wizard progress: numbered circles + labels + connectors.
 */
export function BookingProgress({
  current,
  steps = ["Visit Type", "Provider", "Date & Time", "Your Info", "Confirm"],
  className,
  onStepClick,
}: BookingProgressProps) {
  return (
    <div className={cn("flex w-full items-center gap-0", className)} role="list" aria-label="Booking progress">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const clickable = Boolean(onStepClick) && i <= current;
        const circle = (
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
                done || active
                  ? "bg-[#16a349] text-white"
                  : "bg-[#e8e8e8] text-[#949494]",
                active && "ring-4 ring-[#dbe7fb]",
              )}
            >
              {done ? "✓" : i + 1}
            </div>
            <span
              className={cn(
                "hidden whitespace-nowrap text-xs sm:block",
                active ? "font-semibold text-[#16a349]" : "text-[#949494]",
              )}
            >
              {label}
            </span>
          </div>
        );

        return (
          <div key={label} className="flex flex-1 items-center last:flex-none" role="listitem">
            {clickable ? (
              <button
                type="button"
                onClick={() => onStepClick?.(i + 1)}
                className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16a349]/40"
                aria-current={active ? "step" : undefined}
                aria-label={`Step ${i + 1}: ${label}`}
              >
                {circle}
              </button>
            ) : (
              <div aria-current={active ? "step" : undefined}>{circle}</div>
            )}
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "mx-2 mb-5 h-0.5 flex-1",
                  i < current ? "bg-[#16a349]" : "bg-[#e8e8e8]",
                )}
                aria-hidden
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
