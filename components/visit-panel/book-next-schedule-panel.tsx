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
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

export type BookNextDayAppointment = {
  id: number;
  patient_name: string;
  start_time: string;
  end_time: string;
  status: string;
  appointment_date?: string;
};

export type BookNextScheduleView = "day" | "week" | "month";

/** Short timeline showing booked visits only (open times use the list picker below). */
const DAY_OVERVIEW_PX = 300;

type Props = {
  dateIso: string;
  todayMinIso: string;
  providerName: string;
  onDateChange: (iso: string) => void;
  viewMode: BookNextScheduleView;
  onViewModeChange: (mode: BookNextScheduleView) => void;
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

/** Large, easy-to-tap buttons — primary way to pick an open time. */
function OpenTimesPicker({
  dateIso,
  todayMinIso,
  slotLabels,
  slotTimes,
  selectedSlot,
  onSelectSlot,
  slotsLoading,
}: {
  dateIso: string;
  todayMinIso: string;
  slotLabels: string[];
  slotTimes: string[];
  selectedSlot: string;
  onSelectSlot: (time: string, label: string) => void;
  slotsLoading: boolean;
}) {
  return (
    <section className="rounded-xl border-2 border-emerald-200/90 bg-gradient-to-b from-emerald-50/80 to-white p-4 sm:p-5">
      <h3 className="text-base font-bold text-emerald-950 sm:text-lg">
        Choose an open time
      </h3>
      <p className="mt-1 text-sm text-emerald-900/80">
        {formatWeekdayMonthDayYear(dateIso)} — tap a time below to select it.
      </p>
      {slotsLoading ? (
        <div className="mt-6 flex items-center justify-center gap-2 py-10 text-base text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Loading open times…
        </div>
      ) : slotTimes.length === 0 ? (
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm font-medium text-amber-950">
          No open times on this day for this provider and service. Try another day using Week or Month above.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {slotTimes.map((timeVal, i) => {
            const label = slotLabels[i] || timeVal;
            const st = parseTimeToMinutes(timeVal || label);
            const past = slotStartIsInPastForClinic(dateIso, st, todayMinIso);
            const selected = selectedSlot === timeVal;
            return (
              <button
                key={`${timeVal}-${i}`}
                type="button"
                disabled={past}
                onClick={() => onSelectSlot(timeVal, label)}
                className={cn(
                  "min-h-[3.25rem] rounded-xl border-2 px-3 py-3 text-center text-base font-bold tabular-nums transition sm:min-h-[3.5rem] sm:text-lg",
                  past && "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400",
                  !past &&
                    !selected &&
                    "border-emerald-300 bg-white text-emerald-950 shadow-sm hover:border-[#16a349] hover:bg-emerald-50",
                  selected && "border-[#16a349] bg-[#16a349] text-white shadow-md ring-2 ring-[#16a349]/30",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Booked visits only — avoids stacking dozens of tiny green slot bars. */
function DayBookedOverview({
  dayEndMin,
  totalMin,
  blocking,
}: {
  dayEndMin: number;
  totalMin: number;
  blocking: BookNextDayAppointment[];
}) {
  const timeRows: number[] = [];
  for (let m = SCHEDULE_DAY_START_MIN; m < dayEndMin; m += 60) {
    timeRows.push(m);
  }

  return (
    <details className="rounded-xl border border-slate-200 bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-700 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="text-slate-500">Optional — </span>
        See who is already booked this day
      </summary>
      <div className="border-t border-slate-100 px-3 pb-4 pt-2">
        <div className="flex gap-3">
          <div
            className="relative w-14 shrink-0 text-xs font-medium text-slate-500"
            style={{ height: DAY_OVERVIEW_PX }}
          >
            {timeRows.map((m) => {
              const pct = ((m - SCHEDULE_DAY_START_MIN) / totalMin) * 100;
              return (
                <span
                  key={m}
                  className="absolute right-0 -translate-y-1/2 tabular-nums"
                  style={{ top: `${pct}%` }}
                >
                  {minutesToLabel(m)}
                </span>
              );
            })}
          </div>
          <div
            className="relative min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50/80"
            style={{ height: DAY_OVERVIEW_PX }}
          >
            {blocking.length === 0 ? (
              <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-slate-500">
                No other visits on the books this day yet.
              </p>
            ) : (
              blocking.map((a) => {
                const st = parseTimeToMinutes(a.start_time);
                const en = parseTimeToMinutes(a.end_time);
                const dur = Math.max(15, en - st);
                const { topPct, heightPct } = timePositionPercent(st, dur, dayEndMin);
                return (
                  <div
                    key={a.id}
                    className="pointer-events-none absolute left-1 right-1 z-[2] overflow-hidden rounded-md border border-slate-300 bg-slate-200 px-2 py-1 text-sm font-medium text-slate-800"
                    style={{ top: `${topPct}%`, height: `${heightPct}%`, minHeight: 28 }}
                    title={`${a.patient_name} · ${a.status}`}
                  >
                    <span className="block truncate">{a.patient_name}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </details>
  );
}

export function BookNextSchedulePanel({
  dateIso,
  todayMinIso,
  providerName,
  onDateChange,
  viewMode,
  onViewModeChange,
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
    <div className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-slate-50/50 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Provider</p>
          <p className="truncate text-base font-semibold text-slate-900 sm:text-lg">
            {providerName || "Provider"}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100/80 p-1">
          {viewTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onViewModeChange(t.id)}
              className={cn(
                "rounded-md px-4 py-2 text-sm font-semibold transition",
                viewMode === t.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white px-4 py-2.5 sm:px-5">
        <button
          type="button"
          onClick={() => (viewMode === "month" ? shiftMonth(-1) : viewMode === "week" ? shiftWeek(-1) : shiftDate(-1))}
          disabled={viewMode === "day" && dateIso <= todayMinIso}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          aria-label="Previous"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="min-w-[12rem] text-center text-sm font-bold text-slate-900 sm:text-base">
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
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          aria-label="Next"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 sm:p-5">
        {loading && viewMode !== "day" ? (
          <div className="flex min-h-[200px] items-center justify-center gap-2 text-base text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Loading calendar…
          </div>
        ) : null}

        {viewMode === "week" ? (
          <div className="grid grid-cols-7 gap-2 sm:gap-3">
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
                    "flex min-h-[5.5rem] flex-col rounded-xl border-2 px-2 py-2.5 text-left transition sm:min-h-[6.5rem]",
                    isPast && "cursor-not-allowed opacity-50",
                    isSelected
                      ? "border-[#16a349] bg-emerald-50 ring-2 ring-[#16a349]/25"
                      : "border-slate-200 bg-white hover:border-slate-300",
                  )}
                >
                  <span className="text-[10px] font-bold uppercase text-slate-500">{shortWeekday(dayIso)}</span>
                  <span className="text-lg font-bold tabular-nums text-slate-900">{dayOfMonth(dayIso)}</span>
                  <span className="mt-1 line-clamp-2 text-xs leading-snug text-slate-600">
                    {dayBlocks.length === 0 ? "Open" : `${dayBlocks.length} booked`}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {viewMode === "month" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold uppercase text-slate-500">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
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
                      "flex min-h-[3.5rem] flex-col items-center justify-center rounded-lg border-2 py-1.5 transition sm:min-h-[4rem]",
                      !inMonth && "opacity-40",
                      isPast && "cursor-not-allowed",
                      isSelected
                        ? "border-[#16a349] bg-emerald-50 font-bold text-emerald-950 ring-2 ring-[#16a349]/25"
                        : "border-slate-200 bg-white hover:border-slate-300",
                    )}
                  >
                    <span className="text-base tabular-nums sm:text-lg">{dayOfMonth(cellIso)}</span>
                    {count > 0 ? (
                      <span className="mt-0.5 text-[10px] font-medium text-slate-600">{count} appt</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <p className="text-center text-sm text-slate-600">
              Tap a day, then pick an open time below.
            </p>
          </div>
        ) : null}

        <OpenTimesPicker
          dateIso={dateIso}
          todayMinIso={todayMinIso}
          slotLabels={slotLabels}
          slotTimes={slotTimes}
          selectedSlot={selectedSlot}
          onSelectSlot={onSelectSlot}
          slotsLoading={slotsLoading || (viewMode === "day" && dayLoading)}
        />

        {viewMode === "day" && !dayLoading ? (
          <DayBookedOverview dayEndMin={dayEndMin} totalMin={totalMin} blocking={blocking} />
        ) : null}
      </div>
    </div>
  );
}
