/** Normalize pasted or typed birth dates to YYYY-MM-DD for date inputs and the API. */
export function normalizeDateOfBirthInput(raw: string): string | null {
  const s = raw
    .trim()
    .replace(/^["'([{]+|["')\]}]+$/g, "")
    .trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) return s;
    return null;
  }

  const us = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (us) {
    const month = parseInt(us[1], 10);
    const day = parseInt(us[2], 10);
    let year = parseInt(us[3], 10);
    if (us[3].length === 2) {
      year += year >= 70 ? 1900 : 2000;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const dt = new Date(year, month - 1, day);
    if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const isoHead = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoHead) {
    return normalizeDateOfBirthInput(isoHead[1]);
  }

  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const dt = new Date(t);
    const y = dt.getFullYear();
    const m = dt.getMonth() + 1;
    const d = dt.getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  return null;
}
