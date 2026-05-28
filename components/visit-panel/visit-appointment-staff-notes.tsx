"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Compact staff-only notes on an appointment (admin + doctor). Saved per visit on the appointment row. */
export function VisitAppointmentStaffNotes({
  value,
  onChange,
  onSave,
  saving,
  loading,
  savePathLabel = "admin and doctors",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving?: boolean;
  loading?: boolean;
  savePathLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3", className)}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Staff notes & reminders</p>
      <p className="mt-0.5 text-xs text-slate-500">
        For {savePathLabel} only — not shown to patients. Saved on this appointment (birthday reminders, desk notes,
        etc.).
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        rows={3}
        placeholder="e.g. Bring birthday card · prefers afternoon calls · insurance question for front desk"
        className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15 disabled:opacity-60"
      />
      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          size="sm"
          className="h-8 rounded-lg text-xs"
          disabled={loading || saving}
          onClick={onSave}
        >
          {saving ? "Saving…" : "Save notes"}
        </Button>
      </div>
    </div>
  );
}
