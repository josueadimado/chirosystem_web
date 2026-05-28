import { formatMonthDayYear } from "@/lib/format-date";

export type BirthdayReminder = {
  /** Days from appointment date to birthday (0 = same day). */
  daysUntil: number;
  birthdayLabel: string;
  headline: string;
  detail: string;
  tone: "today" | "soon";
};

/** Parse YYYY-MM-DD without timezone drift. */
function parseIsoDate(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function toUtcMs(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d);
}

/**
 * Birthday reminder relative to the visit date (not “today”), so front desk sees it when the patient comes in.
 * Shows when birthday is on the visit day or within the next `withinDays` days after the visit.
 */
export function getBirthdayReminderForVisit(
  appointmentDateIso: string,
  dateOfBirthIso: string | null | undefined,
  withinDays = 14,
): BirthdayReminder | null {
  if (!dateOfBirthIso?.trim()) return null;
  const appt = parseIsoDate(appointmentDateIso);
  const dob = parseIsoDate(dateOfBirthIso);
  if (!appt || !dob) return null;

  const apptMs = toUtcMs(appt.y, appt.m, appt.d);
  let bdayMs = toUtcMs(appt.y, dob.m, dob.d);
  if (bdayMs < apptMs) {
    bdayMs = toUtcMs(appt.y + 1, dob.m, dob.d);
  }
  const daysUntil = Math.round((bdayMs - apptMs) / (24 * 60 * 60 * 1000));
  if (daysUntil < 0 || daysUntil > withinDays) return null;

  const birthdayLabel = formatMonthDayYear(
    `${dob.y}-${String(dob.m).padStart(2, "0")}-${String(dob.d).padStart(2, "0")}`,
  );

  if (daysUntil === 0) {
    return {
      daysUntil: 0,
      birthdayLabel,
      headline: "Birthday today",
      detail: `Patient birthday is ${birthdayLabel} — same day as this visit.`,
      tone: "today",
    };
  }
  if (daysUntil === 1) {
    return {
      daysUntil: 1,
      birthdayLabel,
      headline: "Birthday tomorrow",
      detail: `Birthday ${birthdayLabel} (day after this visit).`,
      tone: "soon",
    };
  }
  return {
    daysUntil,
    birthdayLabel,
    headline: `Birthday in ${daysUntil} days`,
    detail: `Birthday ${birthdayLabel} — coming up after this visit.`,
    tone: "soon",
  };
}
