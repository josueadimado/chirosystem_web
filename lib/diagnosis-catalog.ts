/** Clinic diagnosis catalog entry (admin-maintained, used during consultations). */

export type DiagnosisCatalogEntry = {
  id: number;
  code: string;
  description: string;
  is_active?: boolean;
};

export function formatDiagnosisLine(entry: { code: string; description: string }): string {
  const c = entry.code?.trim() ?? "";
  const d = entry.description?.trim() ?? "";
  if (c && d) return `${c} — ${d}`;
  return c || d;
}

export function formatDiagnosisLines(entries: Array<{ code: string; description: string }>): string {
  return entries.map(formatDiagnosisLine).filter(Boolean).join("\n");
}

export function toggleDiagnosisId(selected: number[], id: number): number[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  return [...selected, id];
}

export function diagnosisFingerprint(ids: number[]): string {
  return [...ids].sort((a, b) => a - b).join(",");
}
