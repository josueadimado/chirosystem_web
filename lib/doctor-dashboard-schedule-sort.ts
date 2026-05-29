import { clinicNowMinutesFromMidnight } from "@/lib/admin-schedule-utils";
import { clinicTodayIso } from "@/lib/format-date";

function parseTimeToMinutes(t: string): number {
  if (!t) return 0;
  let s = t.trim();
  const tIdx = s.indexOf("T");
  if (tIdx !== -1) s = s.slice(tIdx + 1);
  s = s.replace(/[Zz]$/, "");
  const dot = s.indexOf(".");
  if (dot !== -1) s = s.slice(0, dot);
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Minimal appointment fields needed for dashboard list ordering. */
export type DoctorDashboardSortableAppointment = {
  id: number;
  status: string;
  appointment_date: string;
  start_time_iso: string;
  end_time_iso?: string;
};

const ACTIVE_STATUS_ORDER: Record<string, number> = {
  checked_in: 0,
  in_consultation: 1,
  awaiting_payment: 2,
};

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "no_show"]);

function isPastSlot(
  appt: DoctorDashboardSortableAppointment,
  selectedDate: string,
  todayIso: string,
  nowMinutes: number,
): boolean {
  if (TERMINAL_STATUSES.has(appt.status)) return true;
  if (selectedDate < todayIso) return true;
  if (selectedDate > todayIso) return false;
  const endMin = parseTimeToMinutes(appt.end_time_iso || appt.start_time_iso);
  return endMin <= nowMinutes;
}

function sortTier(
  appt: DoctorDashboardSortableAppointment,
  selectedDate: string,
  todayIso: string,
  nowMinutes: number,
): number {
  if (appt.status in ACTIVE_STATUS_ORDER) return 0;
  if (appt.status === "booked" && !isPastSlot(appt, selectedDate, todayIso, nowMinutes)) return 1;
  return 2;
}

/**
 * Doctor dashboard day list: checked-in first, then in-consult / awaiting payment,
 * then upcoming (and “right now” booked), then past / completed at the bottom.
 */
export function sortDoctorDashboardAppointments<T extends DoctorDashboardSortableAppointment>(
  appts: T[],
  selectedDate: string,
  todayIso: string = clinicTodayIso(),
): T[] {
  const nowMinutes = clinicNowMinutesFromMidnight();

  return [...appts].sort((a, b) => {
    const ta = sortTier(a, selectedDate, todayIso, nowMinutes);
    const tb = sortTier(b, selectedDate, todayIso, nowMinutes);
    if (ta !== tb) return ta - tb;

    if (ta === 0) {
      const sa = ACTIVE_STATUS_ORDER[a.status] ?? 9;
      const sb = ACTIVE_STATUS_ORDER[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
    }

    const startA = parseTimeToMinutes(a.start_time_iso);
    const startB = parseTimeToMinutes(b.start_time_iso);

    if (ta === 1) {
      const aNow =
        !isPastSlot(a, selectedDate, todayIso, nowMinutes) && startA <= nowMinutes;
      const bNow =
        !isPastSlot(b, selectedDate, todayIso, nowMinutes) && startB <= nowMinutes;
      if (aNow !== bNow) return aNow ? -1 : 1;
      return startA - startB;
    }

    if (ta === 2) {
      return startB - startA;
    }

    return startA - startB;
  });
}
