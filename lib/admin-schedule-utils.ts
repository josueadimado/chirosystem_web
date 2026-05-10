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

/** Minutes from midnight from API time "HH:MM:SS" or "HH:MM". */
export function parseTimeToMinutes(t: string): number {
  if (!t) return 0;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
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
export const SCHEDULE_DAY_END_MIN = 19 * 60;
export const SCHEDULE_TOTAL_MIN = SCHEDULE_DAY_END_MIN - SCHEDULE_DAY_START_MIN;

export function timePositionPercent(startMin: number, durationMin: number): { topPct: number; heightPct: number } {
  const relStart = Math.max(0, startMin - SCHEDULE_DAY_START_MIN);
  const dur = Math.max(15, durationMin);
  return {
    topPct: (relStart / SCHEDULE_TOTAL_MIN) * 100,
    heightPct: Math.min(100 - (relStart / SCHEDULE_TOTAL_MIN) * 100, (dur / SCHEDULE_TOTAL_MIN) * 100),
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
