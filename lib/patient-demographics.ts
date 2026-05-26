import { formatMonthDayYear } from "@/lib/format-date";

/** API marital_status: Y = married, N = not married */
export function formatMaritalStatus(code: string | null | undefined): string {
  const v = (code || "").trim().toUpperCase();
  if (v === "Y") return "Married (Y)";
  if (v === "N") return "Not married (N)";
  return "—";
}

export function formatPatientAge(age: number | null | undefined): string {
  if (age == null || !Number.isFinite(age)) return "—";
  return `${age}`;
}

export function formatDemographicsDate(iso: string | null | undefined): string {
  if (iso == null || String(iso).trim() === "") return "—";
  return formatMonthDayYear(iso);
}
