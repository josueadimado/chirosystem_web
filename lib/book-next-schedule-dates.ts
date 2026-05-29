/** Date helpers for book-next week/month schedule views (clinic-local calendar days). */

export function isoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysIso(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return isoFromDate(d);
}

/** Sunday-start week containing `iso`. */
export function weekRangeContaining(iso: string): { start: string; end: string; days: string[] } {
  const d = new Date(`${iso}T12:00:00`);
  const start = addDaysIso(iso, -d.getDay());
  const days: string[] = [];
  for (let i = 0; i < 7; i++) days.push(addDaysIso(start, i));
  return { start, end: days[6]!, days };
}

/** Calendar grid start (Sunday before month) through end (Saturday after month). */
export function monthGridRange(iso: string): { start: string; end: string; cells: string[] } {
  const d = new Date(`${iso}T12:00:00`);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const gridStart = addDaysIso(isoFromDate(first), -first.getDay());
  const gridEnd = addDaysIso(isoFromDate(last), 6 - last.getDay());
  const cells: string[] = [];
  let cur = gridStart;
  while (cur <= gridEnd) {
    cells.push(cur);
    cur = addDaysIso(cur, 1);
  }
  return { start: gridStart, end: gridEnd, cells };
}

export function monthYearLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function shortWeekday(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });
}

export function dayOfMonth(iso: string): number {
  return new Date(`${iso}T12:00:00`).getDate();
}

export function isSameMonth(a: string, b: string): boolean {
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth();
}
