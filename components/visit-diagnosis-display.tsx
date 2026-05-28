"use client";

export type VisitDiagnosisRow = {
  id?: number | null;
  code: string;
  description: string;
};

/** Shows structured diagnosis rows or legacy free-text diagnosis on charts and history. */
export function VisitDiagnosisDisplay({
  diagnosis,
  diagnoses,
  className = "text-sm text-slate-800",
}: {
  diagnosis?: string;
  diagnoses?: VisitDiagnosisRow[];
  className?: string;
}) {
  const rows = diagnoses?.filter((d) => (d.code || d.description).trim()) ?? [];
  if (rows.length > 0) {
    return (
      <ul className={`space-y-1.5 ${className}`}>
        {rows.map((d, i) => (
          <li key={d.id ?? `${d.code}-${i}`}>
            <span className="font-mono text-[11px] font-semibold text-slate-500">{d.code}</span>
            <span className="text-slate-800"> — {d.description}</span>
          </li>
        ))}
      </ul>
    );
  }
  const text = (diagnosis || "").trim();
  if (!text) return null;
  return <p className={className}>{text}</p>;
}

export function diagnosisRowsFromLegacyText(text: string): VisitDiagnosisRow[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const sep = line.includes(" — ") ? " — " : " - ";
      const idx = line.indexOf(sep);
      if (idx > 0) {
        return { code: line.slice(0, idx).trim(), description: line.slice(idx + sep.length).trim() };
      }
      return { code: "", description: line };
    });
}
