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

/** Extra tooltip fragment when the patient has the Iris tag. */
export function irisTagShortLabel(irisTag: boolean | null | undefined): string {
  return irisTag ? "IRIS" : "";
}

/** Combines payment + IRIS labels for calendar tooltips. */
export function patientScheduleLabels(
  profile: string | null | undefined,
  irisTag?: boolean | null,
): string {
  const parts = [paymentProfileShortLabel(profile), irisTagShortLabel(irisTag)].filter(Boolean);
  return parts.join(" · ");
}

/** Full name helper — use with PatientNameWithProfile everywhere staff see a patient name. */
export function patientFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

/**
 * Patient name with insurance (eye), cash, and/or orange IRIS badge —
 * use on lists, charts, billing, and headers.
 */
export function PatientNameWithProfile({
  name,
  profile,
  irisTag = false,
  className,
  nameClassName,
  compactBadge = false,
}: {
  name: ReactNode;
  profile?: string | null;
  /** Independent of cash/insurance — Iris referral or Iris nutrition patient. */
  irisTag?: boolean | null;
  className?: string;
  nameClassName?: string;
  compactBadge?: boolean;
}) {
  return (
    <span className={cn("inline-flex max-w-full flex-wrap items-center gap-1.5", className)}>
      <span className={cn("min-w-0", nameClassName)}>{name}</span>
      <PatientPaymentProfileBadge profile={profile} compact={compactBadge} />
      <PatientIrisBadge irisTag={irisTag} compact={compactBadge} />
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
          "inline-flex shrink-0 items-center justify-center rounded-md bg-[#dbe7fb] font-semibold text-[#277eff] ring-1 ring-[#277eff]/25",
          compact ? "h-4 w-4" : "h-5 gap-0.5 px-1.5",
          className,
        )}
        title="Insurance patient"
        aria-label="Insurance patient"
      >
        <IconEye className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
        {!compact ? <span className="text-[10px] font-semibold tracking-wide">Ins</span> : null}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md bg-[#ecfdf5] font-semibold tracking-wide text-[#0d5c2e] ring-1 ring-[#16a349]/30",
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

/** Orange IRIS badge — can show next to Cash or Insurance. */
export function PatientIrisBadge({
  irisTag,
  compact = false,
  className,
}: {
  irisTag: boolean | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  if (!irisTag) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md bg-[#e9982f] font-semibold tracking-wide text-white ring-1 ring-[#c47d1f]/50",
        compact ? "px-1 py-0 text-[8px] leading-none" : "px-1.5 py-0.5 text-[9px]",
        className,
      )}
      title="Iris patient (referral or nutrition)"
      aria-label="Iris patient"
    >
      IRIS
    </span>
  );
}

type SelectorProps = {
  patientId: number;
  value: PatientPaymentProfile;
  /** e.g. `/admin/patient_intake/` or `/doctor/patient_intake/` */
  intakeSavePath: string;
  onSaved: (profile: PatientPaymentProfile) => void;
  /** Independent Iris tag — can be on at the same time as Cash or Insurance. */
  irisTag?: boolean;
  onIrisSaved?: (irisTag: boolean) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Lets staff mark a patient as insurance or cash during a visit, plus an optional IRIS tag.
 * Saves to the patient record so every future schedule view shows the badges.
 */
export function PatientPaymentProfileSelector({
  patientId,
  value,
  intakeSavePath,
  onSaved,
  irisTag = false,
  onIrisSaved,
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

  async function saveIris(next: boolean) {
    if (disabled || saving || !onIrisSaved) return;
    setSaving(true);
    setError(null);
    try {
      await apiPatch(intakeSavePath, { patient_id: patientId, iris_tag: next });
      onIrisSaved(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save IRIS tag.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("rounded-xl border border-[#e8e8e8] bg-[#f8f8f7] px-3 py-3", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#949494]">
        Labels (schedule badges)
      </p>
      <p className="mt-0.5 text-xs text-[#5a7a62]">
        Payment type is Cash or Insurance. IRIS can be on at the same time (Iris referral or nutrition
        patient).
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || saving}
          onClick={() => void save("insurance")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition",
            current === "insurance"
              ? "border-[#277eff]/50 bg-[#dbe7fb] text-[#1d4ed8] shadow-sm"
              : "border-[#e8e8e8] bg-white text-[#0d1f14] hover:border-[#277eff]/40 hover:bg-[#dbe7fb]/50",
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
              ? "border-[#16a349]/40 bg-[#ecfdf5] text-[#0d5c2e] shadow-sm"
              : "border-[#e8e8e8] bg-white text-[#0d1f14] hover:border-[#16a349]/35 hover:bg-[#ecfdf5]",
            (disabled || saving) && "opacity-50",
          )}
          aria-pressed={current === "cash"}
        >
          Cash
        </button>
        {onIrisSaved ? (
          <button
            type="button"
            disabled={disabled || saving}
            onClick={() => void saveIris(!irisTag)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition",
              irisTag
                ? "border-[#e9982f] bg-[#e9982f] text-white shadow-sm"
                : "border-[#e8e8e8] bg-white text-[#0d1f14] hover:border-[#e9982f]/50 hover:bg-[#fff7ed]",
              (disabled || saving) && "opacity-50",
            )}
            aria-pressed={irisTag}
            title="Mark as Iris referral or Iris nutrition patient"
          >
            IRIS
          </button>
        ) : null}
        {current ? (
          <button
            type="button"
            disabled={disabled || saving}
            onClick={() => void save("")}
            className="rounded-lg border border-[#e8e8e8] bg-white px-3 py-2 text-xs font-medium text-[#949494] hover:bg-[#f5f5f5] disabled:opacity-50"
          >
            Clear payment label
          </button>
        ) : null}
      </div>
      {saving ? <p className="mt-2 text-xs text-[#949494]">Saving…</p> : null}
      {error ? <p className="mt-2 text-xs font-medium text-[#ef4444]">{error}</p> : null}
    </div>
  );
}
