"use client";

import { wrapChartNoteSelection } from "@/lib/chart-note-inline-format";
import { cn } from "@/lib/utils";
import { Bold, Italic, Underline } from "lucide-react";
import { useCallback, useRef } from "react";

type FormatKind = "bold" | "italic" | "underline";

const WRAPPERS: Record<FormatKind, [string, string]> = {
  bold: ["**", "**"],
  italic: ["*", "*"],
  underline: ["++", "++"],
};

function FormatToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border text-slate-700 transition",
        active
          ? "border-[#16a349]/50 bg-emerald-50 text-[#0d5c2e]"
          : "border-slate-200 bg-white hover:bg-slate-50",
      )}
    >
      {children}
    </button>
  );
}

/** Textarea with bold / italic / underline toolbar (saves `**bold**`, `*italic*`, `++underline++`). */
export function ChartNoteRichEditor({
  value,
  onChange,
  className,
  minHeightClassName = "min-h-[200px]",
  disabled,
  "aria-label": ariaLabel = "Edit chart handoff note",
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  minHeightClassName?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const applyFormat = useCallback(
    (kind: FormatKind) => {
      const el = textareaRef.current;
      if (!el || disabled) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;
      const { next, selectionStart, selectionEnd } = wrapChartNoteSelection(
        value,
        start,
        end,
        WRAPPERS[kind],
      );
      onChange(next);

      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(selectionStart, selectionEnd);
      });
    },
    [disabled, onChange, value],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 px-2 py-2">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Format</span>
        <FormatToolbarButton label="Bold" onClick={() => applyFormat("bold")}>
          <Bold className="h-4 w-4" strokeWidth={2.5} />
        </FormatToolbarButton>
        <FormatToolbarButton label="Italic" onClick={() => applyFormat("italic")}>
          <Italic className="h-4 w-4" strokeWidth={2.5} />
        </FormatToolbarButton>
        <FormatToolbarButton label="Underline" onClick={() => applyFormat("underline")}>
          <Underline className="h-4 w-4" strokeWidth={2.5} />
        </FormatToolbarButton>
        <span className="ml-1 hidden text-[11px] text-slate-500 sm:inline">
          Select text, then tap a button
        </span>
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={ariaLabel}
        className={cn(
          "w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm leading-relaxed text-slate-900 shadow-sm focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15 disabled:bg-slate-50",
          minHeightClassName,
          className,
        )}
      />

      <p className="text-[11px] leading-relaxed text-slate-500">
        <strong className="font-semibold text-slate-600">Bold</strong> = **text**,{" "}
        <em className="italic">italic</em> = *text*, <u>underline</u> = ++text++. Section titles like{" "}
        <span className="font-mono">Subjective:</span> on their own line still get large headings in the chart view.
      </p>
    </div>
  );
}
