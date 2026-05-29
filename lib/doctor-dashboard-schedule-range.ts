import {
  addDays,
  endOfMonth,
  mondayOfWeekContaining,
  startOfMonth,
  toIsoDate,
} from "@/lib/admin-schedule-utils";
import { formatMonthDayYear } from "@/lib/format-date";

export type DoctorDashboardScheduleView = "day" | "week" | "month";

export function appointmentsQueryForDashboardView(
  view: DoctorDashboardScheduleView,
  focusIso: string,
  todayIso: string,
): string {
  if (view === "day") {
    return `date=${encodeURIComponent(todayIso)}`;
  }
  const focus = new Date(`${focusIso}T12:00:00`);
  if (view === "week") {
    const mon = mondayOfWeekContaining(focus);
    const fri = addDays(mon, 4);
    return `date_from=${encodeURIComponent(toIsoDate(mon))}&date_to=${encodeURIComponent(toIsoDate(fri))}`;
  }
  return `date_from=${encodeURIComponent(toIsoDate(startOfMonth(focus)))}&date_to=${encodeURIComponent(toIsoDate(endOfMonth(focus)))}`;
}

export function scheduleRangeLabel(
  view: DoctorDashboardScheduleView,
  focusIso: string,
  todayIso: string,
): string {
  if (view === "day") {
    return focusIso === todayIso ? `Today — ${formatMonthDayYear(todayIso)}` : formatMonthDayYear(todayIso);
  }
  const focus = new Date(`${focusIso}T12:00:00`);
  if (view === "week") {
    const mon = mondayOfWeekContaining(focus);
    const fri = addDays(mon, 4);
    return `${formatMonthDayYear(toIsoDate(mon))} – ${formatMonthDayYear(toIsoDate(fri))}`;
  }
  return focus.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function shiftScheduleFocus(
  view: DoctorDashboardScheduleView,
  focusIso: string,
  delta: number,
): string {
  const focus = new Date(`${focusIso}T12:00:00`);
  if (view === "week") {
    return toIsoDate(addDays(focus, delta * 7));
  }
  if (view === "month") {
    const d = new Date(focus.getFullYear(), focus.getMonth() + delta, 1, 12, 0, 0);
    return toIsoDate(d);
  }
  return focusIso;
}
