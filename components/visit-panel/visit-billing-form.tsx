"use client";

import { HelpTip } from "@/components/help-tip";
import { VisitDiagnosisPicker } from "@/components/visit-panel/visit-diagnosis-picker";
import type { DiagnosisCatalogEntry } from "@/lib/diagnosis-catalog";
import {
  computeBillingEstimates,
  type BillableServiceOption,
  type VisitBillLine,
} from "@/lib/visit-billing-form-utils";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Shared billable-procedures + diagnosis + notes form (admin billing modal, doctor consult). */
export function VisitBillingForm({
  diagnosis,
  onDiagnosisChange,
  diagnosisCatalog,
  selectedDiagnosisIds,
  onToggleDiagnosis,
  diagnosisSearchQuery,
  onDiagnosisSearchQueryChange,
  doctorNotes,
  onDoctorNotesChange,
  professionalDiscount,
  onProfessionalDiscountChange,
  professionalDiscountReason,
  onProfessionalDiscountReasonChange,
  services,
  sortedServices,
  billLines,
  onToggleService,
  onUpdateLine,
  proceduresClassName,
  diagnosisClassName,
  notesClassName,
  showDiscountFields = true,
  showVisitNotes = true,
  showDiagnosis = true,
  compact = false,
  spacious = false,
  proceduresIntro,
  proceduresHelpLabel = "Lines",
  proceduresHelpContent,
  discountLayout = "separate",
  diagnosisSectionId,
  proceduresSectionId,
  notesSectionId,
}: {
  diagnosis: string;
  onDiagnosisChange: (value: string) => void;
  /** When set, diagnosis is chosen from catalog (checkboxes) instead of free text. */
  diagnosisCatalog?: DiagnosisCatalogEntry[];
  selectedDiagnosisIds?: number[];
  onToggleDiagnosis?: (id: number) => void;
  diagnosisSearchQuery?: string;
  onDiagnosisSearchQueryChange?: (value: string) => void;
  doctorNotes: string;
  onDoctorNotesChange: (value: string) => void;
  professionalDiscount: string;
  onProfessionalDiscountChange: (value: string) => void;
  professionalDiscountReason: string;
  onProfessionalDiscountReasonChange: (value: string) => void;
  services: BillableServiceOption[];
  sortedServices: BillableServiceOption[];
  billLines: VisitBillLine[];
  onToggleService: (serviceId: number) => void;
  onUpdateLine: (serviceId: number, patch: Partial<Pick<VisitBillLine, "quantity" | "unit_price">>) => void;
  proceduresClassName?: string;
  diagnosisClassName?: string;
  notesClassName?: string;
  showDiscountFields?: boolean;
  showVisitNotes?: boolean;
  showDiagnosis?: boolean;
  compact?: boolean;
  spacious?: boolean;
  proceduresIntro?: ReactNode;
  proceduresHelpLabel?: string;
  proceduresHelpContent?: ReactNode;
  /** Doctor consult puts discount inputs inside the green estimate card. */
  discountLayout?: "separate" | "embedded";
  diagnosisSectionId?: string;
  proceduresSectionId?: string;
  notesSectionId?: string;
}) {
  const isChecked = (serviceId: number) => billLines.some((r) => r.service_id === serviceId);
  const lineFor = (serviceId: number) => billLines.find((r) => r.service_id === serviceId);

  const { estimatedSubtotal, discountAmount, estimatedAfterDiscount } = computeBillingEstimates(
    billLines,
    services,
    professionalDiscount,
  );

  const defaultDiagnosisClass = spacious
    ? "min-h-[7rem] w-full rounded-lg border border-slate-200 p-3 text-base leading-relaxed"
    : compact
      ? "h-24 w-full rounded-lg border border-slate-200 p-2 text-sm"
      : "h-20 w-full rounded-lg border border-slate-200 p-2 text-sm";
  const defaultNotesClass = spacious
    ? "min-h-[10rem] w-full rounded-lg border border-slate-200 p-3 text-base leading-relaxed"
    : defaultDiagnosisClass;
  const defaultProcClass =
    proceduresClassName ??
    (spacious
      ? "max-h-[min(520px,52vh)] space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:max-h-[min(600px,56vh)]"
      : compact
        ? "max-h-60 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-2"
        : "max-h-72 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2");

  const unitInputClass = cn(
    "rounded border border-slate-200 bg-white p-1.5",
    spacious ? "text-base" : "text-sm",
  );

  return (
    <div className="space-y-4">
      {showDiagnosis ? (
        diagnosisCatalog && onToggleDiagnosis ? (
          <VisitDiagnosisPicker
            catalog={diagnosisCatalog}
            selectedIds={selectedDiagnosisIds ?? []}
            onToggle={onToggleDiagnosis}
            searchQuery={diagnosisSearchQuery ?? ""}
            onSearchQueryChange={onDiagnosisSearchQueryChange ?? (() => {})}
            compact={compact}
            spacious={spacious}
            sectionId={diagnosisSectionId}
          />
        ) : (
          <div id={diagnosisSectionId} className={diagnosisSectionId ? "scroll-mt-24" : undefined}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Diagnosis (for bill)</p>
            <textarea
              className={diagnosisClassName ?? defaultDiagnosisClass}
              placeholder="Clinical / billing diagnosis summary…"
              value={diagnosis}
              onChange={(e) => onDiagnosisChange(e.target.value)}
            />
          </div>
        )
      ) : null}
      <div id={proceduresSectionId} className={proceduresSectionId ? "scroll-mt-24" : undefined}>
        <div className="mb-2 flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billable procedures (tap to add)</p>
          <HelpTip label={proceduresHelpLabel} tone="emerald">
            {proceduresHelpContent ?? (
              <>Checked items appear on the invoice. Insurance-only services do not add to the patient total.</>
            )}
          </HelpTip>
        </div>
        {proceduresIntro ? <div className="mb-2 text-xs text-slate-500">{proceduresIntro}</div> : null}
        <div className={defaultProcClass}>
          {sortedServices.map((s) => {
            const on = isChecked(s.id);
            const line = lineFor(s.id);
            return (
              <div
                key={s.id}
                className={cn(
                  "rounded-lg border px-2 py-2 transition-colors",
                  spacious ? "px-3 py-2.5" : compact ? "" : "px-3 py-2.5",
                  on ? "border-[#16a349]/40 bg-white shadow-sm" : "border-transparent hover:bg-white/60",
                )}
              >
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggleService(s.id)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[#16a349] focus:ring-[#16a349]/40"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-mono text-[11px] font-semibold text-slate-500">
                        {s.billing_code?.trim() || "—"}
                      </span>
                      <span className={cn("font-medium text-slate-900", spacious ? "text-base" : "text-sm")}>{s.name}</span>
                      {s.charges_patient === false ? (
                        <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-900">
                          Insurance / no charge
                        </span>
                      ) : null}
                      <span className="text-xs tabular-nums text-slate-500">${s.price}</span>
                    </div>
                  </div>
                </label>
                {on && line ? (
                  <div className="mt-2 flex flex-wrap items-end gap-3 pl-7">
                    <label className="text-xs text-slate-600">
                      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Units</span>
                      <input
                        type="number"
                        min={1}
                        className={cn("w-16", unitInputClass)}
                        value={line.quantity}
                        onChange={(e) => onUpdateLine(s.id, { quantity: e.target.value })}
                      />
                    </label>
                    <label className="min-w-[6rem] flex-1 text-xs text-slate-600">
                      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Fee override
                      </span>
                      <input
                        className={cn("w-full", unitInputClass)}
                        placeholder="Auto"
                        value={line.unit_price}
                        onChange={(e) => onUpdateLine(s.id, { unit_price: e.target.value })}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {estimatedSubtotal != null && discountLayout === "embedded" ? (
          <div className="mt-3 space-y-3 rounded-xl border border-[#16a349]/30 bg-[#f0fdf4] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#0d5c2e]">Estimated patient amount</span>
                <HelpTip label="Estimated total" tone="emerald">
                  Based on checked procedures, units, fee overrides, and professional discount. Insurance-only lines are excluded.
                </HelpTip>
              </div>
              <span className="text-lg font-bold tabular-nums text-slate-900">
                {(estimatedAfterDiscount ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" })}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr),11rem] sm:items-end">
              <div className="text-xs text-slate-600">
                <p>
                  Subtotal before discount:{" "}
                  <strong className="font-semibold text-slate-900">
                    {estimatedSubtotal.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                  </strong>
                </p>
                <p>
                  Professional discount:{" "}
                  <strong className="font-semibold text-slate-900">
                    {discountAmount.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                  </strong>
                </p>
              </div>
              <label className="text-xs text-slate-700">
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Professional discount ($)
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={cn("w-full rounded border border-slate-200 bg-white p-2", spacious ? "text-base" : "text-sm")}
                  placeholder="0.00"
                  value={professionalDiscount}
                  onChange={(e) => onProfessionalDiscountChange(e.target.value)}
                />
              </label>
            </div>
            <label className="block text-xs text-slate-700">
              <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Discount reason (optional, internal only)
              </span>
              <input
                className={cn("w-full rounded border border-slate-200 bg-white p-2", spacious ? "text-base" : "text-sm")}
                placeholder="e.g. Professional courtesy"
                value={professionalDiscountReason}
                onChange={(e) => onProfessionalDiscountReasonChange(e.target.value)}
              />
            </label>
          </div>
        ) : null}
        {estimatedSubtotal != null && discountLayout === "separate" ? (
          <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2">
            <p className="text-xs text-slate-600">
              Subtotal before discount:{" "}
              <span className="font-semibold text-slate-900">
                {estimatedSubtotal.toLocaleString(undefined, { style: "currency", currency: "USD" })}
              </span>
            </p>
            <p className="text-xs text-slate-600">
              Professional discount (internal):{" "}
              <span className="font-semibold text-emerald-700">
                {discountAmount.toLocaleString(undefined, { style: "currency", currency: "USD" })}
              </span>
            </p>
            <p className="mt-1 text-sm font-semibold text-[#0d5c2e]">
              Estimated patient total:{" "}
              {(estimatedAfterDiscount ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" })}
            </p>
          </div>
        ) : null}
      </div>
      {showDiscountFields && discountLayout === "separate" ? (
        <>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Professional discount (internal)</p>
            <input
              type="number"
              min={0}
              step="0.01"
              className="w-full rounded-lg border border-slate-200 p-2 text-sm"
              value={professionalDiscount}
              onChange={(e) => onProfessionalDiscountChange(e.target.value)}
              placeholder="0.00"
            />
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Clinic-only adjustment — not shown as a separate line on the patient bill printout.
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Discount reason (optional, internal only)
            </p>
            <input
              className="w-full rounded-lg border border-slate-200 p-2 text-sm"
              value={professionalDiscountReason}
              onChange={(e) => onProfessionalDiscountReasonChange(e.target.value)}
              placeholder="e.g. Professional courtesy"
            />
          </div>
        </>
      ) : null}
      {showVisitNotes ? (
        <div id={notesSectionId} className={notesSectionId ? "scroll-mt-24" : undefined}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Consultation notes (SOAP)
          </p>
          <p className="mb-2 text-xs text-slate-500">
            Your exam documentation for this visit — saved when you complete the visit. Separate from visit reminders &
            handoff on the schedule.
          </p>
          <textarea
            className={notesClassName ?? defaultNotesClass}
            placeholder="Subjective, objective, assessment, plan… (not printed on the patient bill)"
            value={doctorNotes}
            onChange={(e) => onDoctorNotesChange(e.target.value)}
          />
        </div>
      ) : null}
    </div>
  );
}
