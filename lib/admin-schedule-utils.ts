/** Front-desk schedule helpers: time math, stable provider colors, open-slot gaps. */

/** Greens, blues, teals, purples, oranges — no red (reserved for cancelled). */
export const PROVIDER_COLOR_PALETTE = [
  "#0d9488",
  "#0284c7",
  "#4f46e5",
  "#7c3aed",
  "#0369a1",
  "#059669",
  "#0f766e",
  "#2563eb",
  "#65a30d",
  "#ca8a04",
  "#c2410c",
  "#db2777",
] as const;

/** Same provider ID always maps to the same swatch (survives reloads). */
export function providerColorForId(providerId: number): string {
  const n = PROVIDER_COLOR_PALETTE.length;
  const idx = providerId <= 0 ? 0 : ((providerId % n) + n) % n;
  return PROVIDER_COLOR_PALETTE[idx];
}

/**
 * Minutes from midnight from API time strings.
 * Supports: "HH:MM", "HH:MM:SS", ISO fragments like "1970-01-01T08:30:00Z", and "H:MM AM/PM".
 */
export function parseTimeToMinutes(t: string): number {
  if (!t) return 0;
  let s = t.trim();
  const tIdx = s.indexOf("T");
  if (tIdx !== -1) s = s.slice(tIdx + 1);
  s = s.replace(/[Zz]$/, "");
  const dot = s.indexOf(".");
  if (dot !== -1) s = s.slice(0, dot);

  const ampm = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])\s*$/);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const min = parseInt(ampm[2], 10);
    const ap = ampm[4].toUpperCase();
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return h * 60 + min;
  }

  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return 0;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  return h * 60 + min;
}

export function minutesToLabel(totalMin: number): string {
  const h24 = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export const SCHEDULE_DAY_START_MIN = 7 * 60;
/** Default day grid end (7 PM) — matches the front-desk calendar display. */
export const SCHEDULE_DAY_END_MIN = 19 * 60;
/** Staff click-to-book / desk API may schedule through 9 PM (patients still use public closing). */
export const SCHEDULE_DESK_DAY_END_MIN = 21 * 60;

export function scheduleDayEndMinute(deskBookingEnabled?: boolean): number {
  return deskBookingEnabled ? SCHEDULE_DESK_DAY_END_MIN : SCHEDULE_DAY_END_MIN;
}

export function scheduleTotalMinutes(dayEndMin: number = SCHEDULE_DAY_END_MIN): number {
  return dayEndMin - SCHEDULE_DAY_START_MIN;
}

/** @deprecated Use scheduleTotalMinutes(dayEndMin) when desk overtime is enabled. */
export const SCHEDULE_TOTAL_MIN = SCHEDULE_DAY_END_MIN - SCHEDULE_DAY_START_MIN;

export function timePositionPercent(
  startMin: number,
  durationMin: number,
  dayEndMin: number = SCHEDULE_DAY_END_MIN,
): { topPct: number; heightPct: number } {
  const totalMin = scheduleTotalMinutes(dayEndMin);
  const relStart = Math.max(0, startMin - SCHEDULE_DAY_START_MIN);
  const dur = Math.max(15, durationMin);
  return {
    topPct: (relStart / totalMin) * 100,
    heightPct: Math.min(100 - (relStart / totalMin) * 100, (dur / totalMin) * 100),
  };
}

export function appointmentDurationMinutes(start: string, end: string): number {
  const a = parseTimeToMinutes(start);
  const b = parseTimeToMinutes(end);
  return Math.max(15, b - a);
}

export type TimeInterval = { startMin: number; endMin: number };

/** Merge busy intervals (appointments + blocks) and return gaps within [dayStart, dayEnd]. */
export function computeOpenGaps(busy: TimeInterval[], dayStart = SCHEDULE_DAY_START_MIN, dayEnd = SCHEDULE_DAY_END_MIN): TimeInterval[] {
  const sorted = busy
    .map((x) => ({
      startMin: Math.max(dayStart, Math.min(dayEnd, x.startMin)),
      endMin: Math.max(dayStart, Math.min(dayEnd, x.endMin)),
    }))
    .filter((x) => x.endMin > x.startMin)
    .sort((a, b) => a.startMin - b.startMin);

  const gaps: TimeInterval[] = [];
  let cursor = dayStart;
  for (const b of sorted) {
    if (b.startMin > cursor) {
      gaps.push({ startMin: cursor, endMin: b.startMin });
    }
    cursor = Math.max(cursor, b.endMin);
  }
  if (cursor < dayEnd) {
    gaps.push({ startMin: cursor, endMin: dayEnd });
  }
  return gaps;
}

export function formatIntervalLabel(startMin: number, endMin: number): string {
  return `${minutesToLabel(startMin)} – ${minutesToLabel(endMin)}`;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/** Monday 00:00 local (use noon for DST safety when copying). */
export function mondayOfWeekContaining(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  const wd = x.getDay();
  const offset = wd === 0 ? -6 : 1 - wd;
  x.setDate(x.getDate() + offset);
  return x;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 12, 0, 0);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Cancelled / no-show show on the grid (red styling) but do not block desk booking. */
const SCHEDULE_GRID_NON_BLOCKING_STATUSES = new Set(["cancelled", "no_show"]);

/** Whether an appointment should render on the schedule grid. */
export function appointmentVisibleOnScheduleGrid(status: string, statusFilter = ""): boolean {
  if (statusFilter) return status === statusFilter;
  return true;
}

/** True when this visit still occupies the calendar / blocks desk booking in that time range. */
export function appointmentBlocksScheduleGrid(status: string): boolean {
  return !SCHEDULE_GRID_NON_BLOCKING_STATUSES.has(status);
}

export function filterAppointmentsForScheduleGrid<T extends { status: string }>(
  appointments: T[],
  statusFilter = "",
): T[] {
  return appointments.filter((a) => appointmentVisibleOnScheduleGrid(a.status, statusFilter));
}

/** Snap a Y position on the day grid to a 15-minute start that keeps `durationMin` inside working hours. */
export function snapScheduleGridStartMinute(
  clientY: number,
  gridRect: DOMRect,
  durationMin: number,
  dayEndMin: number = SCHEDULE_DAY_END_MIN,
): number {
  const totalMin = scheduleTotalMinutes(dayEndMin);
  const h = Math.max(gridRect.height, 1);
  const frac = Math.max(0, Math.min(1, (clientY - gridRect.top) / h));
  const continuous = SCHEDULE_DAY_START_MIN + frac * totalMin;
  const snapped = Math.round(continuous / 15) * 15;
  const maxStart = dayEndMin - Math.max(15, durationMin);
  return Math.max(SCHEDULE_DAY_START_MIN, Math.min(maxStart, snapped));
}

/** API time string (HH:MM:SS) from minutes since midnight. */
export function minutesToApiTime(totalMin: number): string {
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/** Value for HTML `<input type="time">` from minutes since midnight. */
export function minutesToTimeInputValue(totalMin: number): string {
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** HH:MM for `<input type="time">` from API time strings. */
export function apiTimeToTimeInputValue(t: string): string {
  const m = parseTimeToMinutes(t);
  return minutesToTimeInputValue(m);
}

/** Visits that can be dragged on the desk day grid (same rules as drawer reschedule). */
export function canDragAppointmentOnSchedule(status: string): boolean {
  return status !== "completed" && status !== "cancelled" && status !== "no_show";
}
