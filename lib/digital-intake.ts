/** Shared types for digital patient intake forms. */

export type IntakeFormType = "massage" | "pediatric" | "adult_chiropractic";

export type IntakeFormStatus = "not_started" | "draft" | "submitted";

export type IntakeFormPackItem = {
  form_type: IntakeFormType;
  label: string;
  status: IntakeFormStatus | string;
  submitted_at: string | null;
  answers: Record<string, unknown>;
  signature_name: string;
};

export type IntakeFormPack = {
  token: string;
  expires_at: string;
  patient: { id: number; display_name: string };
  forms: IntakeFormPackItem[];
  prefill: Record<string, unknown>;
};

export type IntakeSubmissionRow = {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_phone: string;
  patient_email: string;
  form_type: IntakeFormType | string;
  form_label: string;
  status: string;
  answers: Record<string, unknown>;
  signature_name: string;
  signed_at: string | null;
  submitted_at: string | null;
  updated_at: string | null;
  appointment_id: number | null;
};

export const FORM_TYPE_OPTIONS: { value: IntakeFormType; label: string }[] = [
  { value: "massage", label: "Massage intake" },
  { value: "pediatric", label: "Children / pediatric intake" },
  { value: "adult_chiropractic", label: "Adult chiropractic paperwork" },
];

export function strVal(answers: Record<string, unknown>, key: string): string {
  const v = answers[key];
  if (v == null) return "";
  return String(v);
}

export function boolVal(answers: Record<string, unknown>, key: string): boolean {
  return answers[key] === true || answers[key] === "true" || answers[key] === "yes" || answers[key] === "Y";
}

export function formatAnswerValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "—";
  const s = String(value).trim();
  return s || "—";
}
