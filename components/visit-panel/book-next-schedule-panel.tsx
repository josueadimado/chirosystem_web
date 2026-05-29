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
import { formatWeekdayMonthDayYear } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

export type BookNextDayAppointment = {
  id: number;
  patient_name: string;
  start_time: string;
  end_time: string;
  status: string;
};

const GRID_PX = 380;

type Props = {
  dateIso: string;
  todayMinIso: string;
  providerName: string;
  onDateChange: (iso: string) => void;
  dayLoading: boolean;
  dayAppointments: BookNextDayAppointment[];
  slotLabels: string[];
  slotTimes: string[];
  selectedSlot: string;
  onSelectSlot: (time: string, label: string) => void;
  slotsLoading: boolean;
  deskHours?: boolean;
};

export function BookNextSchedulePanel({
  dateIso,
  todayMinIso,
  providerName,
  onDateChange,
  dayLoading,
  dayAppointments,
  slotLabels,
  slotTimes,
  selectedSlot,
  onSelectSlot,
  slotsLoading,
  deskHours = true,
}: Props) {
  const dayEndMin = scheduleDayEndMinute(deskHours);
  const totalMin = scheduleTotalMinutes(dayEndMin);

  const shiftDate = (delta: number) => {
    const d = new Date(`${dateIso}T12:00:00`);
    d.setDate(d.getDate() + delta);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const next = `${y}-${m}-${day}`;
    if (next < todayMinIso) return;
    onDateChange(next);
  };

  const timeRows: number[] = [];
  for (let m = SCHEDULE_DAY_START_MIN; m < dayEndMin; m += 60) {
    timeRows.push(m);
  }

  const blocking = dayAppointments.filter((a) => appointmentBlocksScheduleGrid(a.status));

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-slate-50/80">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Day schedule</p>
          <p className="truncate text-sm font-semibold text-slate-900">{providerName || "Provider"}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftDate(-1)}
            disabled={dateIso <= todayMinIso}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[9.5rem] text-center text-xs font-semibold text-slate-800">
            {formatWeekdayMonthDayYear(dateIso)}
          </span>
          <button
            type="button"
            onClick={() => shiftDate(1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto p-2">
        {dayLoading || slotsLoading ? (
          <div className="flex h-[min(380px,50vh)] items-center justify-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading schedule…
          </div>
        ) : (
          <div className="flex gap-2">
            <div
              className="relative w-12 shrink-0 text-[10px] font-medium text-slate-500"
              style={{ height: GRID_PX }}
            >
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
              style={{ height: GRID_PX }}
            >
              {blocking.map((a) => {
                const st = parseTimeToMinutes(a.start_time);
                const en = parseTimeToMinutes(a.end_time);
                const dur = Math.max(15, en - st);
                const { topPct, heightPct } = timePositionPercent(st, dur, dayEndMin);
                return (
                  <div
                    key={a.id}
                    className="pointer-events-none absolute left-1 right-1 z-[2] overflow-hidden rounded-md border border-slate-300 bg-slate-200/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-800"
                    style={{ top: `${topPct}%`, height: `${heightPct}%`, minHeight: 14 }}
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
                      "absolute left-1 right-1 z-[3] rounded-md border px-1.5 py-0.5 text-left text-[10px] font-semibold transition",
                      past && "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400",
                      !past &&
                        !selected &&
                        "border-emerald-300/80 bg-emerald-50 text-emerald-900 hover:border-[#16a349] hover:bg-emerald-100",
                      selected && "border-[#16a349] bg-[#16a349] text-white shadow-sm",
                    )}
                    style={{ top: `${topPct}%`, height: 22 }}
                    title={past ? "This time has passed" : `Book at ${label}`}
                  >
                    {label}
                    <span className="ml-1 font-normal opacity-80">· open</span>
                  </button>
                );
              })}
              {slotTimes.length === 0 && !dayLoading ? (
                <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-slate-500">
                  No open slots this day — try another date or change service.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>
      <p className="border-t border-slate-200 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
        Gray blocks are existing visits. Green strips are open times — click one to book. Schedule shows desk hours
        through 9:00 PM.
      </p>
    </div>
  );
}
