"use client";

import type { DiagnosisCatalogEntry } from "@/lib/diagnosis-catalog";
import { formatWeekdayMonthDayYear } from "@/lib/format-date";
import { cn } from "@/lib/utils";

export type DiagnosisPriorVisitHint = {
  appointment_date: string;
  start_time: string;
  service_name?: string;
};

/** Pick one or more catalog diagnoses (code + description) for the patient bill and chart. */
export function VisitDiagnosisPicker({
  catalog,
  selectedIds,
  onToggle,
  searchQuery,
  onSearchQueryChange,
  priorVisitHint,
  compact = false,
  spacious = false,
  sectionId,
}: {
  catalog: DiagnosisCatalogEntry[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  /** When set, diagnoses were pre-checked from this patient's last visit. */
  priorVisitHint?: DiagnosisPriorVisitHint | null;
  compact?: boolean;
  spacious?: boolean;
  sectionId?: string;
}) {
  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? catalog.filter(
        (d) =>
          d.code.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q),
      )
    : catalog;

  const listClass = spacious
    ? "max-h-[min(320px,40vh)] space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-3"
    : compact
      ? "max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-2"
      : "max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2";

  return (
    <div id={sectionId} className={sectionId ? "scroll-mt-24" : undefined}>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Diagnosis (for bill)
      </p>
      <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
        Tap to add diagnoses from the clinic list. They print on the bill and save in the patient&apos;s visit history.
      </p>
      {priorVisitHint && selectedIds.length > 0 ? (
        <p className="mb-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-sky-950">
          <span className="font-semibold">From last visit:</span> diagnoses below are pre-selected from this patient&apos;s prior
          appointment
          {priorVisitHint.service_name?.trim() ? ` (${priorVisitHint.service_name.trim()})` : ""} on{" "}
          {formatWeekdayMonthDayYear(priorVisitHint.appointment_date)}
          {priorVisitHint.start_time ? ` at ${priorVisitHint.start_time}` : ""}. Uncheck, add, or change as needed for today.
        </p>
      ) : null}
      <input
        type="search"
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        placeholder="Search code or description…"
        className="mb-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15"
        aria-label="Search diagnoses"
      />
      {catalog.length === 0 ? (
        <p className="rounded-lg border border-dashed border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          No diagnoses in the catalog yet. Ask admin to add codes under{" "}
          <span className="font-semibold">Diagnoses &amp; codes</span>.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-600">No matches for your search.</p>
      ) : (
        <div className={listClass}>
          {filtered.map((d) => {
            const on = selectedIds.includes(d.id);
            return (
              <label
                key={d.id}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-lg border px-2 py-2 transition-colors",
                  spacious ? "px-3 py-2.5" : "",
                  on ? "border-[#16a349]/40 bg-white shadow-sm" : "border-transparent hover:bg-white/60",
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onToggle(d.id)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[#16a349] focus:ring-[#16a349]/40"
                />
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-[11px] font-semibold text-slate-600">{d.code}</span>
                  <span className={cn("mt-0.5 block text-slate-900", spacious ? "text-base" : "text-sm")}>
                    {d.description}
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      )}
      {selectedIds.length > 0 ? (
        <p className="mt-2 text-xs font-medium text-[#0d5c2e]">
          {selectedIds.length} diagnosis{selectedIds.length === 1 ? "" : "es"} selected for this visit
        </p>
      ) : null}
    </div>
  );
}
