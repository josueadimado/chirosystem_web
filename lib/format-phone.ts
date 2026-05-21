/** Friendly US display for stored E.164 or formatted phone strings. */
export function formatPhoneDisplay(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return "";
  const d = trimmed.replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return trimmed;
}
