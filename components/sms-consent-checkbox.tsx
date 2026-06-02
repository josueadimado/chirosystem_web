"use client";

import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
};

/** Relief brand green — matches booking site accents (#16a349). */
const CHECKED_CLASS =
  "border-[#16a349] bg-[#16a349] text-white shadow-sm";
const UNCHECKED_CLASS = "border-slate-300 bg-white text-transparent";

/**
 * SMS consent on public booking. Styled toggle (not a hidden native input) so
 * checked=true always shows a green box with a white checkmark.
 */
export function SmsConsentCheckbox({ id, checked, onCheckedChange, className }: Props) {
  return (
    <button
      type="button"
      id={id}
      role="checkbox"
      aria-checked={checked}
      data-checked={checked ? "true" : "false"}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16a349]/40 focus-visible:ring-offset-1",
        checked ? CHECKED_CLASS : UNCHECKED_CLASS,
        className,
      )}
    >
      <CheckIcon className="size-3.5" strokeWidth={3} aria-hidden />
    </button>
  );
}
