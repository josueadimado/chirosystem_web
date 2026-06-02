"use client";

import { useState, type ReactNode } from "react";
import { IconEye } from "@/components/icons";
import { ApiError, apiPatch } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Stored on the patient record — shown on schedule blocks and visit panels. */
export type PatientPaymentProfile = "" | "insurance" | "cash";

export function normalizePaymentProfile(value: string | null | undefined): PatientPaymentProfile {
  const v = (value || "").trim().toLowerCase();
  if (v === "insurance" || v === "cash") return v;
  return "";
}

/** Short label for tooltips and plain-text titles (e.g. schedule month dots). */
export function paymentProfileShortLabel(profile: string | null | undefined): string {
  const p = normalizePaymentProfile(profile);
  if (p === "insurance") return "Insurance";
  if (p === "cash") return "Cash";
  return "";
}

/** Full name helper — use with PatientNameWithProfile everywhere staff see a patient name. */
export function patientFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

/**
 * Patient name with insurance (eye) or cash badge — use on lists, charts, billing, and headers.
 */
export function PatientNameWithProfile({
  name,
  profile,
  className,
  nameClassName,
  compactBadge = false,
}: {
  name: ReactNode;
  profile?: string | null;
  className?: string;
  nameClassName?: string;
  compactBadge?: boolean;
}) {
  return (
    <span className={cn("inline-flex max-w-full flex-wrap items-center gap-1.5", className)}>
      <span className={cn("min-w-0", nameClassName)}>{name}</span>
      <PatientPaymentProfileBadge profile={profile} compact={compactBadge} />
    </span>
  );
}

/** Small badge for calendar blocks and appointment lists. */
export function PatientPaymentProfileBadge({
  profile,
  compact = false,
  className,
}: {
  profile: string | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  const p = normalizePaymentProfile(profile);
  if (!p) return null;

  if (p === "insurance") {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-md bg-sky-100 text-sky-800 ring-1 ring-sky-200/80",
          compact ? "h-4 w-4" : "h-5 w-5 gap-0.5 px-1",
          className,
        )}
        title="Insurance patient"
        aria-label="Insurance patient"
      >
        <IconEye className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
        {!compact ? <span className="px-0.5 text-[10px] font-bold uppercase tracking-wide">Ins</span> : null}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md bg-amber-100 font-bold uppercase tracking-wide text-amber-950 ring-1 ring-amber-300/70",
        compact ? "px-1 py-0 text-[8px] leading-none" : "px-1.5 py-0.5 text-[9px]",
        className,
      )}
      title="Cash / self-pay"
      aria-label="Cash / self-pay"
    >
      Cash
    </span>
  );
}

type SelectorProps = {
  patientId: number;
  value: PatientPaymentProfile;
  /** e.g. `/admin/patient_intake/` or `/doctor/patient_intake/` */
  intakeSavePath: string;
  onSaved: (profile: PatientPaymentProfile) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Lets staff mark a patient as insurance or cash during a visit.
 * Saves to the patient record so every future schedule view shows the badge.
 */
export function PatientPaymentProfileSelector({
  patientId,
  value,
  intakeSavePath,
  onSaved,
  disabled = false,
  className,
}: SelectorProps) {
  const current = normalizePaymentProfile(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(profile: PatientPaymentProfile) {
    if (disabled || saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiPatch(intakeSavePath, { patient_id: patientId, payment_profile: profile });
      onSaved(profile);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save payment type.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Payment type (schedule label)
      </p>
      <p className="mt-0.5 text-xs text-slate-600">
        Shown on the calendar next to this patient&apos;s name for all staff.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || saving}
          onClick={() => void save("insurance")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition",
            current === "insurance"
              ? "border-sky-400 bg-sky-100 text-sky-950 shadow-sm"
              : "border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50/80",
            (disabled || saving) && "opacity-50",
          )}
          aria-pressed={current === "insurance"}
        >
          <IconEye className="h-4 w-4 shrink-0" />
          Insurance
        </button>
        <button
          type="button"
          disabled={disabled || saving}
          onClick={() => void save("cash")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition",
            current === "cash"
              ? "border-amber-400 bg-amber-100 text-amber-950 shadow-sm"
              : "border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50/80",
            (disabled || saving) && "opacity-50",
          )}
          aria-pressed={current === "cash"}
        >
          Cash
        </button>
        {current ? (
          <button
            type="button"
            disabled={disabled || saving}
            onClick={() => void save("")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Clear label
          </button>
        ) : null}
      </div>
      {saving ? <p className="mt-2 text-xs text-slate-500">Saving…</p> : null}
      {error ? <p className="mt-2 text-xs font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}
