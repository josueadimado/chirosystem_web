"use client";

import {
  SCHEDULE_DAY_START_MIN,
  appointmentBlocksScheduleGrid,
  appointmentDurationMinutes,
  computeOpenGaps,
  minuteAtGridY,
  minutesToLabel,
  openGapAtMinute,
  parseTimeToMinutes,
  scheduleDayEndMinute,
  scheduleGridPixelHeight,
  scheduleTotalMinutes,
  slotStartIsInPastForClinic,
  snapMinuteInsideOpenGap,
  timePositionPercent,
  type TimeInterval,
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

const SCHEDULE_HEADER_PX = 52;

function scheduleGridHours(dayEndMin: number): number {
  return (dayEndMin - SCHEDULE_DAY_START_MIN) / 60;
}

/** Hour / half-hour / quarter-hour lines — matches main schedule grid. */
function ScheduleGridBackground({ hours }: { hours: number }) {
  const hourPct = 100 / hours;
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(
            to bottom,
            rgb(248 250 252 / 0.65) 0,
            rgb(248 250 252 / 0.65) ${hourPct}%,
            transparent ${hourPct}%,
            transparent ${hourPct * 2}%
          )`,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgb(71 85 105) 1px, transparent 1px)`,
          backgroundSize: `100% ${hourPct}%`,
          opacity: 0.55,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgb(148 163 184) 1px, transparent 1px)`,
          backgroundSize: `100% ${hourPct / 2}%`,
          opacity: 0.38,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgb(203 213 225) 1px, transparent 1px)`,
          backgroundSize: `100% ${hourPct / 4}%`,
          opacity: 0.22,
        }}
        aria-hidden
      />
    </>
  );
}

function TimeLabelsColumn({ dayEndMin, gridPx }: { dayEndMin: number; gridPx: number }) {
  const totalMin = scheduleTotalMinutes(dayEndMin);
  const rows: number[] = [];
  for (let m = SCHEDULE_DAY_START_MIN; m < dayEndMin; m += 30) {
    rows.push(m);
  }
  return (
    <div className="flex w-[5.25rem] shrink-0 flex-col border-r border-slate-200 bg-slate-50/50">
      <div
        className="flex shrink-0 items-center justify-center border-b border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100/80 px-2 py-2.5"
        style={{ minHeight: SCHEDULE_HEADER_PX }}
        aria-hidden
      >
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Time</span>
      </div>
      <div
        className="relative text-[13px] font-medium leading-none text-slate-600"
        style={{ height: gridPx, minHeight: gridPx }}
      >
        {rows.map((m) => {
          const pct = ((m - SCHEDULE_DAY_START_MIN) / totalMin) * 100;
          const onHour = m % 60 === 0;
          return (
            <span
              key={m}
              className={cn(
                "absolute left-0 right-1 -translate-y-1/2 text-right tabular-nums tracking-tight",
                onHour ? "font-medium text-slate-600" : "text-[10px] font-normal text-slate-400",
              )}
              style={{ top: `${pct}%` }}
            >
              {minutesToLabel(m).replace(" ", "\u00a0")}
            </span>
          );
        })}
      </div>
    </div>
  );
}

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

/** Day column — same proportional layout as admin schedule (duration = block height). */
function BookNextDayTimeline({
  dateIso,
  todayMinIso,
  providerName,
  dayEndMin,
  gridPx,
  blocking,
  slotLabels,
  slotTimes,
  selectedSlot,
  onSelectSlot,
  visitDurationMin,
  calendarSpanMin,
  serviceName,
  serviceType,
}: {
  dateIso: string;
  todayMinIso: string;
  providerName: string;
  dayEndMin: number;
  gridPx: number;
  blocking: BookNextDayAppointment[];
  slotLabels: string[];
  slotTimes: string[];
  selectedSlot: string;
  onSelectSlot: (time: string, label: string) => void;
  visitDurationMin: number;
  calendarSpanMin: number;
  serviceName: string;
  serviceType?: string;
}) {
  const hours = scheduleGridHours(dayEndMin);
  const massageTail = serviceType === "massage" ? 15 : 0;

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100/80">
      <div className="flex min-w-[min(100%,520px)]">
        <TimeLabelsColumn dayEndMin={dayEndMin} gridPx={gridPx} />
        <div className="min-w-[280px] flex-1">
          <div
            className="flex shrink-0 items-center justify-center border-b border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100/80 px-3 py-2.5 text-center"
            style={{ minHeight: SCHEDULE_HEADER_PX }}
          >
            <p className="text-[15px] font-semibold leading-snug text-slate-800">{providerName}</p>
          </div>
          <div className="relative bg-white" style={{ height: gridPx, minHeight: gridPx }}>
            <ScheduleGridBackground hours={hours} />
            {blocking.map((a) => {
              const st = parseTimeToMinutes(a.start_time);
              const dur = appointmentDurationMinutes(a.start_time, a.end_time);
              const { topPct, heightPct } = timePositionPercent(st, dur, dayEndMin);
              return (
                <div
                  key={a.id}
                  className="pointer-events-none absolute left-1.5 right-1.5 z-[2] overflow-hidden rounded-lg border border-slate-300 bg-slate-200/95 px-2 py-1 shadow-sm"
                  style={{ top: `${topPct}%`, height: `${heightPct}%`, minHeight: 28 }}
                  title={`${a.patient_name} · booked`}
                >
                  <span className="block truncate text-sm font-semibold text-slate-800">{a.patient_name}</span>
                  <span className="block truncate text-[11px] text-slate-600">
                    {minutesToLabel(st)} – {minutesToLabel(st + dur)}
                  </span>
                </div>
              );
            })}
            {slotTimes.map((timeVal, i) => {
              const label = slotLabels[i] || timeVal;
              const st = parseTimeToMinutes(timeVal || label);
              const past = slotStartIsInPastForClinic(dateIso, st, todayMinIso);
              const selected = selectedSlot === timeVal;
              const { topPct, heightPct } = timePositionPercent(st, calendarSpanMin, dayEndMin);
              const endLabel = minutesToLabel(st + calendarSpanMin);
              return (
                <button
                  key={`${timeVal}-${i}`}
                  type="button"
                  disabled={past}
                  data-schedule-open-gap
                  onClick={() => onSelectSlot(timeVal, label)}
                  className={cn(
                    "absolute left-1.5 right-1.5 z-[3] flex flex-col overflow-hidden rounded-lg border-2 px-2 py-1.5 text-left shadow-sm transition",
                    past && "cursor-not-allowed border-slate-200 bg-slate-100/90 opacity-60",
                    !past &&
                      !selected &&
                      "border-emerald-400/90 bg-emerald-50 text-emerald-950 hover:border-[#16a349] hover:bg-emerald-100",
                    selected && "border-[#16a349] bg-[#16a349] text-white shadow-md ring-2 ring-[#16a349]/35",
                  )}
                  style={{ top: `${topPct}%`, height: `${heightPct}%`, minHeight: 36 }}
                  title={
                    past
                      ? "Past"
                      : `Book at ${label} · ${visitDurationMin} min visit${massageTail ? ` (+${massageTail} min on calendar)` : ""}`
                  }
                >
                  <span className="truncate text-sm font-bold leading-tight">{label}</span>
                  <span className={cn("truncate text-[11px] leading-tight", selected ? "text-emerald-50" : "text-emerald-800")}>
                    {visitDurationMin} min{massageTail ? ` + ${massageTail} min cleanup` : ""} → {endLabel}
                  </span>
                  {selected ? (
                    <span className="mt-auto text-[10px] font-bold uppercase tracking-wide text-emerald-100">
                      Selected
                    </span>
                  ) : null}
                </button>
              );
            })}
            {slotTimes.length === 0 ? (
              <p className="absolute inset-0 z-[4] flex items-center justify-center px-6 text-center text-sm font-medium text-slate-500">
                No open times this day — try Week or Month to pick another date.
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <p className="border-t border-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-600">
        <strong className="text-slate-800">Gray</strong> = already booked.{" "}
        <strong className="text-emerald-800">Green</strong> = open start times for{" "}
        <strong>{serviceName || "this visit"}</strong> — each block’s height matches how long it will sit on the
        schedule ({visitDurationMin} min
        {massageTail ? `, plus ${massageTail} min after for massage room time on the calendar` : ""}). Tap a green
        block to select that start time.
      </p>
    </div>
  );
}

/** Seven-day column grid — same layout as the main schedule week view. */
function BookNextWeekGrid({
  anchorDateIso,
  todayMinIso,
  selectedDateIso,
  dayEndMin,
  gridPx,
  rangeAppointments,
  slotLabels,
  slotTimes,
  selectedSlot,
  onSelectSlot,
  onPickDayAndStartMinute,
  onSelectDate,
  visitDurationMin,
  calendarSpanMin,
  slotsLoading,
}: {
  anchorDateIso: string;
  todayMinIso: string;
  selectedDateIso: string;
  dayEndMin: number;
  gridPx: number;
  rangeAppointments: BookNextDayAppointment[];
  slotLabels: string[];
  slotTimes: string[];
  selectedSlot: string;
  onSelectSlot: (time: string, label: string) => void;
  onPickDayAndStartMinute: (dateIso: string, startMinute: number) => void;
  onSelectDate: (iso: string) => void;
  visitDurationMin: number;
  calendarSpanMin: number;
  slotsLoading: boolean;
}) {
  const hours = scheduleGridHours(dayEndMin);
  const week = weekRangeContaining(anchorDateIso);
  const todayIso = todayMinIso;

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100/80">
      <div className="flex min-w-[980px]">
        <TimeLabelsColumn dayEndMin={dayEndMin} gridPx={gridPx} />
        <div
          className="grid flex-1"
          style={{ gridTemplateColumns: `repeat(${week.days.length}, minmax(120px, 1fr))` }}
        >
          {week.days.map((dayIso) => {
            const isSelected = dayIso === selectedDateIso;
            const isPast = dayIso < todayIso;
            const isToday = dayIso === todayIso;
            const dayBlocking = rangeAppointments
              .filter((a) => a.appointment_date === dayIso)
              .filter((a) => appointmentBlocksScheduleGrid(a.status));
            const busy: TimeInterval[] = dayBlocking.map((a) => ({
              startMin: parseTimeToMinutes(a.start_time),
              endMin: parseTimeToMinutes(a.end_time),
            }));
            const openGaps = computeOpenGaps(busy, SCHEDULE_DAY_START_MIN, dayEndMin).filter(
              (g) => g.endMin - g.startMin >= calendarSpanMin,
            );

            return (
              <div
                key={dayIso}
                className={cn(
                  "relative border-l border-slate-100",
                  isSelected && "bg-emerald-50/50 ring-2 ring-inset ring-[#16a349]/30",
                  isToday && !isSelected && "bg-sky-50/30",
                )}
              >
                <button
                  type="button"
                  disabled={isPast}
                  onClick={() => onSelectDate(dayIso)}
                  className={cn(
                    "flex w-full shrink-0 flex-col items-center border-b border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100/80 px-1 py-2.5 text-center transition",
                    isPast && "cursor-not-allowed opacity-50",
                    !isPast && "hover:bg-white",
                  )}
                  style={{ minHeight: SCHEDULE_HEADER_PX }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {shortWeekday(dayIso)}
                  </p>
                  <p className="text-[15px] font-bold leading-none text-slate-900">{dayOfMonth(dayIso)}</p>
                </button>
                <div
                  className="relative bg-white"
                  style={{ height: gridPx, minHeight: gridPx }}
                  onClick={(e) => {
                    if (isPast) return;
                    const target = e.target as HTMLElement;
                    if (target.closest("[data-book-next-slot]") || target.closest("[data-book-next-booked]")) {
                      return;
                    }
                    const rect = e.currentTarget.getBoundingClientRect();
                    const minute = minuteAtGridY(e.clientY, rect, dayEndMin);
                    const gap = openGapAtMinute(openGaps, minute);
                    if (!gap) return;
                    const startMin = snapMinuteInsideOpenGap(e.clientY, rect, gap.startMin, gap.endMin);
                    if (startMin + calendarSpanMin > gap.endMin) return;
                    if (!slotStartIsInPastForClinic(dayIso, startMin, todayMinIso)) {
                      onPickDayAndStartMinute(dayIso, startMin);
                    }
                  }}
                >
                  <ScheduleGridBackground hours={hours} />
                  {openGaps.map((gap) => {
                    const { topPct, heightPct } = timePositionPercent(
                      gap.startMin,
                      gap.endMin - gap.startMin,
                      dayEndMin,
                    );
                    return (
                      <div
                        key={`gap-${dayIso}-${gap.startMin}`}
                        className="pointer-events-none absolute left-0.5 right-0.5 z-[1] rounded-md border border-emerald-200/70 bg-emerald-50/75"
                        style={{ top: `${topPct}%`, height: `${heightPct}%`, minHeight: 8 }}
                        title={`Open ${minutesToLabel(gap.startMin)} – ${minutesToLabel(gap.endMin)}`}
                      />
                    );
                  })}
                  {dayBlocking.map((a) => {
                    const st = parseTimeToMinutes(a.start_time);
                    const dur = appointmentDurationMinutes(a.start_time, a.end_time);
                    const { topPct, heightPct } = timePositionPercent(st, dur, dayEndMin);
                    return (
                      <div
                        key={a.id}
                        data-book-next-booked
                        className="pointer-events-none absolute left-0.5 right-0.5 z-[2] overflow-hidden rounded-md border border-slate-300 bg-slate-200/95 px-1 py-0.5 text-[10px] font-semibold text-slate-800"
                        style={{ top: `${topPct}%`, height: `${heightPct}%`, minHeight: 14 }}
                        title={a.patient_name}
                      >
                        <span className="block truncate">{a.patient_name}</span>
                      </div>
                    );
                  })}
                  {isSelected &&
                    slotTimes.map((timeVal, i) => {
                      const label = slotLabels[i] || timeVal;
                      const st = parseTimeToMinutes(timeVal || label);
                      const past = slotStartIsInPastForClinic(dayIso, st, todayMinIso);
                      const selected = selectedSlot === timeVal;
                      const { topPct, heightPct } = timePositionPercent(st, calendarSpanMin, dayEndMin);
                      return (
                        <button
                          key={`slot-${timeVal}-${i}`}
                          type="button"
                          data-book-next-slot
                          disabled={past}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectSlot(timeVal, label);
                          }}
                          className={cn(
                            "absolute left-0.5 right-0.5 z-[3] flex flex-col overflow-hidden rounded-md border-2 px-1 py-0.5 text-left text-[10px] font-bold leading-tight",
                            past && "opacity-40",
                            selected
                              ? "border-[#16a349] bg-[#16a349] text-white"
                              : "border-emerald-500 bg-emerald-100 text-emerald-950 hover:bg-emerald-200",
                          )}
                          style={{ top: `${topPct}%`, height: `${heightPct}%`, minHeight: 20 }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  {isSelected && slotsLoading ? (
                    <div className="absolute inset-0 z-[4] flex items-center justify-center bg-white/60 text-xs font-medium text-slate-600">
                      Loading times…
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="border-t border-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-600">
        <strong className="text-slate-800">Gray</strong> = booked. <strong className="text-emerald-800">Light green</strong> = open
        time (fits a {visitDurationMin}-minute visit). Click an open area to select that day and start time. The highlighted column
        shows exact bookable slots for the selected day.
      </p>
    </div>
  );
}

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
  visitDurationMin: number;
  calendarSpanMin: number;
  serviceName: string;
  serviceType?: string;
  onPickDayAndStartMinute: (dateIso: string, startMinute: number) => void;
};

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
  visitDurationMin,
  calendarSpanMin,
  serviceName,
  serviceType,
  onPickDayAndStartMinute,
}: Props) {
  const dayEndMin = scheduleDayEndMinute(deskHours);
  const gridPx = scheduleGridPixelHeight(dayEndMin);
  const blocking = dayAppointments.filter((a) => appointmentBlocksScheduleGrid(a.status));
  const byDate = groupByDate(rangeAppointments);
  const timelineLoading =
    viewMode === "week"
      ? rangeLoading
      : dayLoading || slotsLoading;

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
    <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/50 shadow-sm">
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

      <div className="space-y-4 p-4 sm:p-5">
        {viewMode === "week" && !timelineLoading ? (
          <BookNextWeekGrid
            anchorDateIso={dateIso}
            todayMinIso={todayMinIso}
            selectedDateIso={dateIso}
            dayEndMin={dayEndMin}
            gridPx={gridPx}
            rangeAppointments={rangeAppointments}
            slotLabels={slotLabels}
            slotTimes={slotTimes}
            selectedSlot={selectedSlot}
            onSelectSlot={onSelectSlot}
            onPickDayAndStartMinute={onPickDayAndStartMinute}
            onSelectDate={pickDay}
            visitDurationMin={visitDurationMin}
            calendarSpanMin={calendarSpanMin}
            slotsLoading={slotsLoading}
          />
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
              Tap a day to open the <strong>Day</strong> schedule below.
            </p>
          </div>
        ) : null}

        {timelineLoading ? (
          <div
            className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-16 text-base text-slate-600"
            style={{ minHeight: Math.min(gridPx + SCHEDULE_HEADER_PX, 480) }}
          >
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Loading schedule…
          </div>
        ) : viewMode === "week" ? null : (
          <BookNextDayTimeline
            dateIso={dateIso}
            todayMinIso={todayMinIso}
            providerName={providerName}
            dayEndMin={dayEndMin}
            gridPx={gridPx}
            blocking={blocking}
            slotLabels={slotLabels}
            slotTimes={slotTimes}
            selectedSlot={selectedSlot}
            onSelectSlot={onSelectSlot}
            visitDurationMin={visitDurationMin}
            calendarSpanMin={calendarSpanMin}
            serviceName={serviceName}
            serviceType={serviceType}
          />
        )}
      </div>
    </div>
  );
}
