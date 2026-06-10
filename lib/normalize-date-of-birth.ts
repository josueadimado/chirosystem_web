/** Digits only, up to 8 (MMDDYYYY). */
export function usDateDigitsOnly(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 8);
}

/**
 * Show MM/DD/YYYY with slashes added automatically while typing (numbers only).
 * e.g. 951971 → 9/5/1971, 09051971 → 09/05/1971
 */
export function formatUsDatePartial(raw: string): string {
  const digits = usDateDigitsOnly(raw);
  if (!digits) return "";

  let pos = 0;

  const d0 = parseInt(digits[0], 10);
  let monthEnd: number;
  if (d0 > 1) {
    monthEnd = 1;
  } else if (digits.length === 1) {
    return digits;
  } else {
    const mm = parseInt(digits.slice(0, 2), 10);
    if (mm > 12) {
      monthEnd = 1;
    } else if (digits.length === 2) {
      return digits;
    } else {
      monthEnd = 2;
    }
  }

  const month = digits.slice(0, monthEnd);
  pos = monthEnd;
  if (pos >= digits.length) return month;

  const restAfterMonth = digits.slice(pos);
  const rd0 = parseInt(restAfterMonth[0], 10);
  let dayEnd: number;
  if (rd0 > 3) {
    dayEnd = 1;
  } else if (restAfterMonth.length === 1) {
    return `${month}/${restAfterMonth}`;
  } else {
    const dd = parseInt(restAfterMonth.slice(0, 2), 10);
    if (dd > 31) {
      dayEnd = 1;
    } else if (restAfterMonth.length === 2) {
      return `${month}/${restAfterMonth}`;
    } else {
      dayEnd = 2;
    }
  }

  const day = restAfterMonth.slice(0, dayEnd);
  pos += dayEnd;
  if (pos >= digits.length) return `${month}/${day}`;

  const year = digits.slice(pos);
  return `${month}/${day}/${year}`;
}

function tryBuildIso(month: number, day: number, year: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseUsDateDigits(digits: string): string | null {
  if (digits.length < 6) return null;
  const formatted = formatUsDatePartial(digits);
  const parts = formatted.split("/");
  if (parts.length !== 3) return null;

  const month = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);
  const yearPart = parts[2];
  if (yearPart.length !== 2 && yearPart.length !== 4) return null;

  let year = parseInt(yearPart, 10);
  if (yearPart.length === 2) {
    year += year >= 70 ? 1900 : 2000;
  }

  return tryBuildIso(month, day, year);
}

/** Normalize pasted or typed US dates (MM/DD/YYYY) to YYYY-MM-DD for the API. */
export function normalizeUsDateInput(raw: string): string | null {
  const s = raw
    .trim()
    .replace(/^["'([{]+|["')\]}]+$/g, "")
    .trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
    return tryBuildIso(m, d, y);
  }

  const us = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (us) {
    const month = parseInt(us[1], 10);
    const day = parseInt(us[2], 10);
    let year = parseInt(us[3], 10);
    if (us[3].length === 2) {
      year += year >= 70 ? 1900 : 2000;
    }
    return tryBuildIso(month, day, year);
  }

  const digitsOnly = usDateDigitsOnly(s);
  if (digitsOnly.length >= 6) {
    const fromDigits = parseUsDateDigits(digitsOnly);
    if (fromDigits) return fromDigits;
  }

  const isoHead = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoHead) {
    return normalizeUsDateInput(isoHead[1]);
  }

  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const dt = new Date(t);
    return tryBuildIso(dt.getMonth() + 1, dt.getDate(), dt.getFullYear());
  }

  return null;
}

/** @deprecated Use normalizeUsDateInput — kept for existing imports. */
export const normalizeDateOfBirthInput = normalizeUsDateInput;
