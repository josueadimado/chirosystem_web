/** US-style dates: month name, day, year (e.g. April 30, 2026). */

const LOCALE = "en-US";

/** IANA timezone for the clinic (Michigan). Override via NEXT_PUBLIC_CLINIC_TIMEZONE in web .env. */
export const CLINIC_TIMEZONE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_CLINIC_TIMEZONE?.trim()) ||
  "America/Detroit";

/** Today's date at the clinic as YYYY-MM-DD (not UTC / not the developer's browser TZ). */
export function clinicTodayIso(timeZone: string = CLINIC_TIMEZONE): string {
  return new Date().toLocaleDateString("en-CA", { timeZone });
}

const MONTH_DAY_YEAR: Intl.DateTimeFormatOptions = {
  month: "long",
  day: "numeric",
  year: "numeric",
};

/** API date-only string (usually YYYY-MM-DD). Parsed at noon local to avoid timezone shifting the calendar day. */
export function parseApiDateOnly(isoDate: string): Date {
  const s = isoDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T12:00:00`);
  }
  return new Date(s);
}

/** "April 30, 2026" from a date-only API value. */
export function formatMonthDayYear(isoDate: string | null | undefined): string {
  if (isoDate == null || String(isoDate).trim() === "") return "—";
  const d = parseApiDateOnly(String(isoDate));
  if (Number.isNaN(d.getTime())) return String(isoDate);
  return d.toLocaleDateString(LOCALE, MONTH_DAY_YEAR);
}

/** ISO timestamp → local calendar date as "April 30, 2026". */
export function formatInstantAsMonthDayYear(iso: string | null | undefined): string {
  if (iso == null || String(iso).trim() === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(LOCALE, MONTH_DAY_YEAR);
}

/** ISO timestamp → "April 30, 2026, 3:45 PM" (month-day-year + time). */
export function formatInstantMonthDayYearTime(iso: string | null | undefined): string {
  if (iso == null || String(iso).trim() === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(LOCALE, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Current moment as "April 30, 2026, 3:45 PM" for footers / "generated" lines. */
export function formatNowMonthDayYearTime(): string {
  return new Date().toLocaleString(LOCALE, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Thursday, April 30, 2026" from date-only. */
export function formatWeekdayMonthDayYear(isoDate: string): string {
  const d = parseApiDateOnly(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(LOCALE, {
    weekday: "long",
    ...MONTH_DAY_YEAR,
  });
}
