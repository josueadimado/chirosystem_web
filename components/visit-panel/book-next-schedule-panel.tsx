"use client";

import {
  SCHEDULE_DAY_START_MIN,
  appointmentBlocksScheduleGrid,
  minutesToLabel,
  parseTimeToMinutes,
  scheduleDayEndMinute,
  scheduleTotalMinutes,
  slotStartIsInPastForClinic,
  timePositionPercent,
} from "@/lib/admin-schedule-utils";
import {
  addDaysIso,
  dayOfMonth,
  isSameMonth,
  monthGridRange,
  monthYearLabel,
  shortWeekday,
  weekRangeContaining,
} from "@/lib/book-next-schedule-dates";
import { formatWeekdayMonthDayYear } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Loader2, Maximize2, Minimize2 } from "lucide-react";

export type BookNextDayAppointment = {
  id: number;
  patient_name: string;
  start_time: string;
  end_time: string;
  status: string;
  appointment_date?: string;
};

export type BookNextScheduleView = "day" | "week" | "month";

const DAY_GRID_PX = 520;
const COMPACT_DAY_PX = 240;

type Props = {
  dateIso: string;
  todayMinIso: string;
  providerName: string;
  onDateChange: (iso: string) => void;
  viewMode: BookNextScheduleView;
  onViewModeChange: (mode: BookNextScheduleView) => void;
  expanded?: boolean;
  onExpandedChange?: (v: boolean) => void;
  dayLoading: boolean;
  rangeLoading?: boolean;
  dayAppointments: BookNextDayAppointment[];
  rangeAppointments?: BookNextDayAppointment[];
  slotLabels: string[];
  slotTimes: string[];
  selectedSlot: string;
  onSelectSlot: (time: string, label: string) => void;
  slotsLoading: boolean;
  deskHours?: boolean;
};

function groupByDate(rows: BookNextDayAppointment[]): Map<string, BookNextDayAppointment[]> {
  const m = new Map<string, BookNextDayAppointment[]>();
  for (const a of rows) {
    const d = a.appointment_date;
    if (!d) continue;
    const list = m.get(d) ?? [];
    list.push(a);
    m.set(d, list);
  }
  return m;
}

function DayTimeGrid({
  dateIso,
  todayMinIso,
  dayEndMin,
  totalMin,
  blocking,
  slotTimes,
  slotLabels,
  selectedSlot,
  onSelectSlot,
  heightPx,
  compact,
}: {
  dateIso: string;
  todayMinIso: string;
  dayEndMin: number;
  totalMin: number;
  blocking: BookNextDayAppointment[];
  slotTimes: string[];
  slotLabels: string[];
  selectedSlot: string;
  onSelectSlot: (time: string, label: string) => void;
  heightPx: number;
  compact?: boolean;
}) {
  const timeRows: number[] = [];
  for (let m = SCHEDULE_DAY_START_MIN; m < dayEndMin; m += compact ? 120 : 60) {
    timeRows.push(m);
  }

  return (
    <div className={cn("flex gap-2", compact && "text-[9px]")}>
      <div className="relative w-11 shrink-0 text-[10px] font-medium text-slate-500" style={{ height: heightPx }}>
        {timeRows.map((m) => {
          const pct = ((m - SCHEDULE_DAY_START_MIN) / totalMin) * 100;
          return (
            <span
              key={m}
              className="absolute right-0 -translate-y-1/2 tabular-nums"
              style={{ top: `${pct}%` }}
            >
              {minutesToLabel(m).replace(" ", "\u00a0")}
            </span>
          );
        })}
      </div>
      <div
        className="relative min-w-0 flex-1 rounded-lg border border-slate-200 bg-white"
        style={{ height: heightPx }}
      >
        {blocking.map((a) => {
          const st = parseTimeToMinutes(a.start_time);
          const en = parseTimeToMinutes(a.end_time);
          const dur = Math.max(15, en - st);
          const { topPct, heightPct } = timePositionPercent(st, dur, dayEndMin);
          return (
            <div
              key={a.id}
              className="pointer-events-none absolute left-0.5 right-0.5 z-[2] overflow-hidden rounded border border-slate-300 bg-slate-200/90 px-1 py-0.5 font-medium text-slate-800"
              style={{ top: `${topPct}%`, height: `${heightPct}%`, minHeight: compact ? 10 : 14 }}
              title={`${a.patient_name} · ${a.status}`}
            >
              <span className="block truncate">{a.patient_name}</span>
            </div>
          );
        })}
        {slotTimes.map((timeVal, i) => {
          const label = slotLabels[i] || timeVal;
          const st = parseTimeToMinutes(timeVal || label);
          const past = slotStartIsInPastForClinic(dateIso, st, todayMinIso);
          const selected = selectedSlot === timeVal;
          const { topPct } = timePositionPercent(st, 15, dayEndMin);
          return (
            <button
              key={`${timeVal}-${i}`}
              type="button"
              disabled={past}
              onClick={() => onSelectSlot(timeVal, label)}
              className={cn(
                "absolute left-0.5 right-0.5 z-[3] rounded border px-1 py-0.5 text-left font-semibold transition",
                compact ? "text-[9px]" : "text-[10px]",
                past && "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400",
                !past &&
                  !selected &&
                  "border-emerald-300/80 bg-emerald-50 text-emerald-900 hover:border-[#16a349] hover:bg-emerald-100",
                selected && "border-[#16a349] bg-[#16a349] text-white shadow-sm",
              )}
              style={{ top: `${topPct}%`, height: compact ? 18 : 22 }}
              title={past ? "This time has passed" : `Book at ${label}`}
            >
              {label}
            </button>
          );
        })}
        {slotTimes.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center px-2 text-center text-slate-500">
            No open slots
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function BookNextSchedulePanel({
  dateIso,
  todayMinIso,
  providerName,
  onDateChange,
  viewMode,
  onViewModeChange,
  expanded = false,
  onExpandedChange,
  dayLoading,
  rangeLoading = false,
  dayAppointments,
  rangeAppointments = [],
  slotLabels,
  slotTimes,
  selectedSlot,
  onSelectSlot,
  slotsLoading,
  deskHours = true,
}: Props) {
  const dayEndMin = scheduleDayEndMinute(deskHours);
  const totalMin = scheduleTotalMinutes(dayEndMin);
  const blocking = dayAppointments.filter((a) => appointmentBlocksScheduleGrid(a.status));
  const byDate = groupByDate(rangeAppointments);
  const loading = dayLoading || slotsLoading || (viewMode !== "day" && rangeLoading);

  const shiftDate = (delta: number) => {
    const next = addDaysIso(dateIso, delta);
    if (next < todayMinIso) return;
    onDateChange(next);
  };

  const shiftWeek = (delta: number) => {
    onDateChange(addDaysIso(dateIso, delta * 7));
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(`${dateIso}T12:00:00`);
    d.setMonth(d.getMonth() + delta);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const next = `${y}-${m}-${day}`;
    if (next < todayMinIso) return;
    onDateChange(next);
  };

  const pickDay = (iso: string) => {
    if (iso < todayMinIso) return;
    onDateChange(iso);
  };

  const viewTabs: { id: BookNextScheduleView; label: string }[] = [
    { id: "day", label: "Day" },
    { id: "week", label: "Week" },
    { id: "month", label: "Month" },
  ];

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col rounded-xl border border-slate-200 bg-slate-50/80 shadow-sm",
        expanded && "lg:min-h-[min(72dvh,720px)]",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Schedule</p>
          <p className="truncate text-sm font-semibold text-slate-900">{providerName || "Provider"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100/80 p-0.5">
            {viewTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onViewModeChange(t.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                  viewMode === t.id
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {onExpandedChange ? (
            <button
              type="button"
              onClick={() => onExpandedChange(!expanded)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              title={expanded ? "Show patient details beside schedule" : "Make schedule larger"}
            >
              {expanded ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" aria-hidden />
                  Details
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                  Larger
                </>
              )}
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white/90 px-3 py-2 sm:px-4">
        <button
          type="button"
          onClick={() => (viewMode === "month" ? shiftMonth(-1) : viewMode === "week" ? shiftWeek(-1) : shiftDate(-1))}
          disabled={viewMode === "day" && dateIso <= todayMinIso}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          aria-label="Previous"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[10rem] text-center text-xs font-semibold text-slate-800 sm:text-sm">
          {viewMode === "month"
            ? monthYearLabel(dateIso)
            : viewMode === "week"
              ? (() => {
                  const w = weekRangeContaining(dateIso);
                  return `${formatWeekdayMonthDayYear(w.start)} – ${formatWeekdayMonthDayYear(w.end)}`;
                })()
              : formatWeekdayMonthDayYear(dateIso)}
        </span>
        <button
          type="button"
          onClick={() => (viewMode === "month" ? shiftMonth(1) : viewMode === "week" ? shiftWeek(1) : shiftDate(1))}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          aria-label="Next"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-3">
        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading schedule…
          </div>
        ) : viewMode === "day" ? (
          <DayTimeGrid
            dateIso={dateIso}
            todayMinIso={todayMinIso}
            dayEndMin={dayEndMin}
            totalMin={totalMin}
            blocking={blocking}
            slotTimes={slotTimes}
            slotLabels={slotLabels}
            selectedSlot={selectedSlot}
            onSelectSlot={onSelectSlot}
            heightPx={expanded ? DAY_GRID_PX + 80 : DAY_GRID_PX}
          />
        ) : viewMode === "week" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {weekRangeContaining(dateIso).days.map((dayIso) => {
                const isSelected = dayIso === dateIso;
                const isPast = dayIso < todayMinIso;
                const dayBlocks = (byDate.get(dayIso) ?? []).filter((a) =>
                  appointmentBlocksScheduleGrid(a.status),
                );
                return (
                  <button
                    key={dayIso}
                    type="button"
                    disabled={isPast}
                    onClick={() => pickDay(dayIso)}
                    className={cn(
                      "flex min-h-[4.5rem] flex-col rounded-lg border px-1 py-1.5 text-left transition sm:min-h-[5.5rem]",
                      isPast && "cursor-not-allowed opacity-50",
                      isSelected
                        ? "border-[#16a349] bg-emerald-50 ring-2 ring-[#16a349]/30"
                        : "border-slate-200 bg-white hover:border-slate-300",
                    )}
                  >
                    <span className="text-[9px] font-bold uppercase text-slate-500">{shortWeekday(dayIso)}</span>
                    <span className="text-sm font-bold tabular-nums text-slate-900">{dayOfMonth(dayIso)}</span>
                    <span className="mt-1 line-clamp-3 text-[9px] leading-tight text-slate-600">
                      {dayBlocks.length === 0
                        ? "No visits"
                        : dayBlocks.map((a) => a.patient_name.split(" ")[0]).join(", ")}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/50 px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900">
                Pick a time — {formatWeekdayMonthDayYear(dateIso)}
              </p>
            </div>
            <DayTimeGrid
              dateIso={dateIso}
              todayMinIso={todayMinIso}
              dayEndMin={dayEndMin}
              totalMin={totalMin}
              blocking={blocking}
              slotTimes={slotTimes}
              slotLabels={slotLabels}
              selectedSlot={selectedSlot}
              onSelectSlot={onSelectSlot}
              heightPx={COMPACT_DAY_PX}
              compact
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-slate-500">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthGridRange(dateIso).cells.map((cellIso) => {
                const inMonth = isSameMonth(cellIso, dateIso);
                const isSelected = cellIso === dateIso;
                const isPast = cellIso < todayMinIso;
                const count = (byDate.get(cellIso) ?? []).filter((a) =>
                  appointmentBlocksScheduleGrid(a.status),
                ).length;
                return (
                  <button
                    key={cellIso}
                    type="button"
                    disabled={isPast}
                    onClick={() => {
                      pickDay(cellIso);
                      onViewModeChange("day");
                    }}
                    className={cn(
                      "flex min-h-[3.25rem] flex-col items-center justify-center rounded-lg border py-1 transition sm:min-h-[3.75rem]",
                      !inMonth && "opacity-40",
                      isPast && "cursor-not-allowed",
                      isSelected
                        ? "border-[#16a349] bg-emerald-50 font-bold text-emerald-950 ring-2 ring-[#16a349]/25"
                        : "border-slate-200 bg-white hover:border-slate-300",
                    )}
                  >
                    <span className="text-sm tabular-nums">{dayOfMonth(cellIso)}</span>
                    {count > 0 ? (
                      <span className="mt-0.5 text-[9px] font-medium text-slate-600">{count} appt</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <p className="text-center text-xs text-slate-500">
              Tap a day to open <strong>Day</strong> view and choose an open time. Or stay here and use the picker below.
            </p>
            <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/50 px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900">
                Pick a time — {formatWeekdayMonthDayYear(dateIso)}
              </p>
            </div>
            <DayTimeGrid
              dateIso={dateIso}
              todayMinIso={todayMinIso}
              dayEndMin={dayEndMin}
              totalMin={totalMin}
              blocking={blocking}
              slotTimes={slotTimes}
              slotLabels={slotLabels}
              selectedSlot={selectedSlot}
              onSelectSlot={onSelectSlot}
              heightPx={COMPACT_DAY_PX}
              compact
            />
          </div>
        )}
      </div>
      <p className="border-t border-slate-200 px-3 py-2 text-[10px] leading-relaxed text-slate-500 sm:px-4">
        Gray = booked visits. Green = open times (click to select). Use <strong>Day</strong> for the largest view,{" "}
        <strong>Week</strong> or <strong>Month</strong> to browse, then pick a time on the selected day.
      </p>
    </div>
  );
}
