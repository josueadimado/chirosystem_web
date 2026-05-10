"use client";

import { cn } from "@/lib/utils";
import {
  SCHEDULE_DAY_END_MIN,
  SCHEDULE_DAY_START_MIN,
  SCHEDULE_TOTAL_MIN,
  addDays,
  appointmentDurationMinutes,
  computeOpenGaps,
  formatIntervalLabel,
  isSameDay,
  minutesToLabel,
  mondayOfWeekContaining,
  parseTimeToMinutes,
  providerColorForId,
  timePositionPercent,
  toIsoDate,
  type TimeInterval,
} from "@/lib/admin-schedule-utils";
import { formatWeekdayMonthDayYear } from "@/lib/format-date";
import { useEffect, useMemo, useState } from "react";

/** Mirrors API fields used by the admin schedule (names unchanged). */
export type ScheduleAppointment = {
  id: number;
  patient_name: string;
  provider: number;
  provider_name: string;
  service_name: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  start_time_display?: string;
  end_time_display?: string;
  status: string;
};

export type ProviderRow = { id: number; provider_name: string };

export type ProviderBlock = {
  id: number;
  provider: number;
  block_date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
};

export type ScheduleViewMode = "day" | "week" | "month";

const STRIPE_BG =
  "repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(15,23,42,0.08) 5px, rgba(15,23,42,0.08) 10px)";

function formatTimeShort(t: string): string {
  if (!t) return "";
  const m = t.trim().match(/(\d{1,2}):(\d{2})/);
  if (!m) return t;
  const h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${min} ${ampm}`;
}

function statusBlockStyles(status: string, baseColor: string): { wrap: string; text: string } {
  if (status === "cancelled") {
    return {
      wrap: "border border-rose-200 bg-rose-100/90 text-rose-950 shadow-sm",
      text: "line-through decoration-rose-700/80",
    };
  }
  if (status === "no_show") {
    return {
      wrap: "border border-amber-300 bg-amber-100/95 text-amber-950 shadow-sm",
      text: "",
    };
  }
  if (status === "completed") {
    return {
      wrap: "border shadow-sm text-slate-900",
      text: "",
    };
  }
  if (status === "checked_in" || status === "in_consultation" || status === "awaiting_payment") {
    return {
      wrap: "border shadow-sm text-white",
      text: "",
    };
  }
  return {
    wrap: "border shadow-sm text-white",
    text: "",
  };
}

function blockBackground(status: string, baseColor: string): string {
  if (status === "cancelled") return "";
  if (status === "no_show") return "";
  if (status === "completed") return `linear-gradient(to bottom, ${baseColor}aa, ${baseColor}77)`;
  return baseColor;
}

function AppointmentBlockDecor({ status }: { status: string }) {
  if (status === "cancelled") return null;
  if (status === "no_show") {
    return (
      <span className="pointer-events-none absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded bg-amber-900/15 text-[10px] font-bold text-amber-900">
        ✕
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="pointer-events-none absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded bg-white/40 text-[10px] text-slate-800">
        ✓
      </span>
    );
  }
  if (status === "checked_in" || status === "in_consultation" || status === "awaiting_payment") {
    return (
      <span className="pointer-events-none absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded bg-black/15 text-[10px] text-white">
        ✓
      </span>
    );
  }
  return null;
}

const GRID_PX = 640;

/** Horizontal “now” line position (% from top of day grid), or null if outside 7–7 or not today. */
function nowLinePercent(focusDate: Date): number | null {
  const now = new Date();
  if (!isSameDay(focusDate, now)) return null;
  const mins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  if (mins < SCHEDULE_DAY_START_MIN || mins >= SCHEDULE_DAY_END_MIN) return null;
  const rel = mins - SCHEDULE_DAY_START_MIN;
  return (rel / SCHEDULE_TOTAL_MIN) * 100;
}

export function schedulePeriodLabel(view: ScheduleViewMode, focusDate: Date): string {
  if (view === "month") {
    return focusDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  if (view === "week") {
    const mon = mondayOfWeekContaining(focusDate);
    const fri = addDays(mon, 4);
    const sameMonth = mon.getMonth() === fri.getMonth();
    if (sameMonth) {
      return `${mon.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${fri.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return `${mon.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} – ${fri.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  return formatWeekdayMonthDayYear(toIsoDate(focusDate));
}

export function navigateFocusDate(view: ScheduleViewMode, focusDate: Date, direction: -1 | 1): Date {
  const d = new Date(focusDate.getFullYear(), focusDate.getMonth(), focusDate.getDate(), 12, 0, 0);
  if (view === "day") {
    d.setDate(d.getDate() + direction);
  } else if (view === "week") {
    d.setDate(d.getDate() + direction * 7);
  } else {
    d.setMonth(d.getMonth() + direction);
  }
  return d;
}

type CalendarProps = {
  view: ScheduleViewMode;
  focusDate: Date;
  appointments: ScheduleAppointment[];
  providers: ProviderRow[];
  providerFilter: string;
  blocks: ProviderBlock[];
  selectedId: number | null;
  onSelect: (a: ScheduleAppointment) => void;
  onPickDayInMonth: (d: Date) => void;
};

export function AdminScheduleCalendar({
  view,
  focusDate,
  appointments,
  providers,
  providerFilter,
  blocks,
  selectedId,
  onSelect,
  onPickDayInMonth,
}: CalendarProps) {
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setNowTick((x) => x + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const visibleProviders = useMemo(() => {
    if (providerFilter) {
      const id = Number.parseInt(providerFilter, 10);
      return providers.filter((p) => p.id === id);
    }
    return [...providers].sort((a, b) => a.id - b.id);
  }, [providerFilter, providers]);

  const weekDays = useMemo(() => {
    const mon = mondayOfWeekContaining(focusDate);
    return [0, 1, 2, 3, 4].map((i) => addDays(mon, i));
  }, [focusDate]);

  const nowPct = useMemo(() => {
    void nowTick;
    return view === "day" ? nowLinePercent(focusDate) : null;
  }, [view, focusDate, nowTick]);

  if (visibleProviders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center text-sm text-slate-600">
        No providers loaded. Add providers or refresh the page.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ProviderLegend providers={visibleProviders} />

      {view === "day" && (
        <DayGrid
          focusDate={focusDate}
          providers={visibleProviders}
          appointments={appointments}
          blocks={blocks}
          selectedId={selectedId}
          onSelect={onSelect}
          nowPct={nowPct}
        />
      )}

      {view === "week" && (
        <WeekGrid
          weekDays={weekDays}
          providers={visibleProviders}
          appointments={appointments}
          blocks={blocks}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      )}

      {view === "month" && (
        <MonthGrid focusDate={focusDate} appointments={appointments} onPickDay={onPickDayInMonth} />
      )}
    </div>
  );
}

function ProviderLegend({ providers }: { providers: ProviderRow[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <span className="font-semibold text-slate-500">Providers</span>
      {providers.map((p) => {
        const c = providerColorForId(p.id);
        return (
          <span key={p.id} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm shadow-sm" style={{ backgroundColor: c }} />
            <span className="font-medium text-slate-800">{p.provider_name}</span>
          </span>
        );
      })}
      <span className="inline-flex items-center gap-1.5 border-l border-slate-200 pl-4">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-rose-200 ring-1 ring-rose-300" />
        <span className="text-slate-600">Cancelled</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="h-2.5 w-8 shrink-0 rounded-sm ring-1 ring-slate-300"
          style={{ backgroundImage: STRIPE_BG, backgroundColor: "#e5e7eb" }}
        />
        <span className="text-slate-600">Blocked</span>
      </span>
    </div>
  );
}

function TimeLabelsColumn() {
  const rows: number[] = [];
  for (let m = SCHEDULE_DAY_START_MIN; m < SCHEDULE_DAY_END_MIN; m += 60) {
    rows.push(m);
  }
  return (
    <div
      className="relative w-12 shrink-0 border-r border-slate-200 text-xs leading-none text-slate-500"
      style={{ height: GRID_PX }}
    >
      {rows.map((m) => {
        const pct = ((m - SCHEDULE_DAY_START_MIN) / SCHEDULE_TOTAL_MIN) * 100;
        return (
          <span
            key={m}
            className="absolute left-0 right-1 -translate-y-1/2 text-right tabular-nums"
            style={{ top: `${pct}%` }}
          >
            {minutesToLabel(m).replace(" ", "\u00a0")}
          </span>
        );
      })}
    </div>
  );
}

function DayGrid({
  focusDate,
  providers,
  appointments,
  blocks,
  selectedId,
  onSelect,
  nowPct,
}: {
  focusDate: Date;
  providers: ProviderRow[];
  appointments: ScheduleAppointment[];
  blocks: ProviderBlock[];
  selectedId: number | null;
  onSelect: (a: ScheduleAppointment) => void;
  nowPct: number | null;
}) {
  const iso = toIsoDate(focusDate);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex min-w-[720px]">
        <TimeLabelsColumn />
        <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${providers.length}, minmax(120px, 1fr))` }}>
          {providers.map((p) => (
            <DayProviderColumn
              key={p.id}
              provider={p}
              isoDate={iso}
              appointments={appointments.filter((a) => a.provider === p.id && a.appointment_date === iso)}
              blocks={blocks.filter((b) => b.provider === p.id && b.block_date === iso)}
              selectedId={selectedId}
              onSelect={onSelect}
              nowPct={nowPct}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayProviderColumn({
  provider,
  isoDate,
  appointments,
  blocks,
  selectedId,
  onSelect,
  nowPct,
}: {
  provider: ProviderRow;
  isoDate: string;
  appointments: ScheduleAppointment[];
  blocks: ProviderBlock[];
  selectedId: number | null;
  onSelect: (a: ScheduleAppointment) => void;
  nowPct: number | null;
}) {
  const base = providerColorForId(provider.id);

  const busyIntervals: TimeInterval[] = useMemo(() => {
    const ap = appointments.map((a) => ({
      startMin: parseTimeToMinutes(a.start_time),
      endMin: parseTimeToMinutes(a.end_time),
    }));
    const bl = blocks.flatMap((b) => {
      if (b.all_day) {
        return [{ startMin: SCHEDULE_DAY_START_MIN, endMin: SCHEDULE_DAY_END_MIN }];
      }
      if (b.start_time && b.end_time) {
        return [{ startMin: parseTimeToMinutes(b.start_time), endMin: parseTimeToMinutes(b.end_time) }];
      }
      return [];
    });
    return [...ap, ...bl].filter((x) => x.endMin > x.startMin);
  }, [appointments, blocks]);

  const openGaps = useMemo(() => computeOpenGaps(busyIntervals), [busyIntervals]);

  return (
    <div className="relative border-l border-slate-100">
      <div className="border-b border-slate-200 bg-slate-50/90 px-2 py-2 text-center">
                <p className="text-sm font-semibold leading-snug text-slate-800">{provider.provider_name}</p>
      </div>
      <div className="relative bg-slate-50/30" style={{ height: GRID_PX }}>
        {/* hour lines */}
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: `linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)`,
            backgroundSize: `100% ${100 / ((SCHEDULE_DAY_END_MIN - SCHEDULE_DAY_START_MIN) / 60)}%`,
          }}
        />

        {blocks.map((b) => {
          if (b.all_day) {
            return (
              <div
                key={b.id}
                className="pointer-events-none absolute left-0 right-0 z-[1] rounded border border-slate-300"
                style={{
                  top: 0,
                  height: "100%",
                  backgroundImage: STRIPE_BG,
                  backgroundColor: "#e5e7eb",
                }}
                title="Blocked (online booking)"
              />
            );
          }
          if (!b.start_time || !b.end_time) return null;
          const st = parseTimeToMinutes(b.start_time);
          const en = parseTimeToMinutes(b.end_time);
          const { topPct, heightPct } = timePositionPercent(st, en - st);
          return (
            <div
              key={b.id}
              className="pointer-events-none absolute left-0.5 right-0.5 z-[1] rounded border border-slate-300"
              style={{
                top: `${topPct}%`,
                height: `${heightPct}%`,
                minHeight: 4,
                backgroundImage: STRIPE_BG,
                backgroundColor: "#e5e7eb",
              }}
              title="Blocked (online booking)"
            />
          );
        })}

        {openGaps.map((g, i) => {
          const dur = g.endMin - g.startMin;
          const { topPct, heightPct } = timePositionPercent(g.startMin, dur);
          return (
            <div
              key={`gap-${i}`}
              className="group absolute left-0.5 right-0.5 z-[2] cursor-default"
              style={{ top: `${topPct}%`, height: `${heightPct}%`, minHeight: 8 }}
              title={`Open · ${formatIntervalLabel(g.startMin, g.endMin)} · ${dur} min available`}
            >
              <div className="h-full w-full rounded-sm bg-emerald-500/0 transition group-hover:bg-emerald-500/10" />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 hidden w-max max-w-[220px] -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-800 shadow-lg group-hover:block">
                Open · {formatIntervalLabel(g.startMin, g.endMin)} · {dur} min available
              </div>
            </div>
          );
        })}

        {appointments.map((a) => {
          const st = parseTimeToMinutes(a.start_time);
          const dur = appointmentDurationMinutes(a.start_time, a.end_time);
          const { topPct, heightPct } = timePositionPercent(st, dur);
          const styles = statusBlockStyles(a.status, base);
          const bg = a.status === "cancelled" || a.status === "no_show" ? undefined : blockBackground(a.status, base);
          const selected = selectedId === a.id;
          const tip = [
            a.patient_name,
            a.service_name || "Service",
            `${formatTimeShort(a.start_time)} – ${formatTimeShort(a.end_time)} (${dur} min)`,
            a.status.replace(/_/g, " "),
          ].join("\n");
          return (
            <button
              key={a.id}
              type="button"
              title={tip}
              onClick={() => onSelect(a)}
              className={cn(
                "group absolute left-0.5 right-0.5 z-[3] overflow-hidden rounded-md border text-left text-xs leading-snug transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#16a349]",
                styles.wrap,
                selected && "ring-2 ring-[#16a349] ring-offset-1",
              )}
              style={{
                top: `${topPct}%`,
                height: `${heightPct}%`,
                minHeight: 28,
                background: bg,
                borderColor: a.status === "cancelled" ? "#fecaca" : selected ? "#16a349" : "rgba(255,255,255,0.35)",
              }}
            >
              <AppointmentBlockDecor status={a.status} />
              <span className={cn("block truncate px-1.5 pt-1 font-semibold", styles.text)}>{a.patient_name}</span>
              <span className="block truncate px-1.5 text-[12px] leading-tight opacity-90">
                {a.provider_name ? `${a.provider_name} · ` : ""}
                {a.start_time_display || formatTimeShort(a.start_time)} · {dur}m
              </span>
            </button>
          );
        })}

        {nowPct != null && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-[5]"
            style={{ top: `${nowPct}%` }}
            aria-hidden
          >
            <div className="h-0.5 bg-red-500 shadow-sm" />
          </div>
        )}
      </div>
    </div>
  );
}

function WeekGrid({
  weekDays,
  providers,
  appointments,
  blocks,
  selectedId,
  onSelect,
}: {
  weekDays: Date[];
  providers: ProviderRow[];
  appointments: ScheduleAppointment[];
  blocks: ProviderBlock[];
  selectedId: number | null;
  onSelect: (a: ScheduleAppointment) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex min-w-[900px]">
        <TimeLabelsColumn />
        <div
          className="grid flex-1"
          style={{ gridTemplateColumns: `repeat(${weekDays.length}, minmax(140px, 1fr))` }}
        >
          {weekDays.map((d) => {
            const iso = toIsoDate(d);
            const dayAppts = appointments.filter((a) => a.appointment_date === iso);
            const dayBlocks = blocks.filter((b) => b.block_date === iso);
            const isToday = isSameDay(d, new Date());
            return (
              <div
                key={iso}
                className={cn(
                  "relative border-l border-slate-100",
                  isToday && "bg-emerald-50/40",
                )}
              >
                <div className="border-b border-slate-200 bg-slate-50/90 px-2 py-2 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {d.toLocaleDateString(undefined, { weekday: "short" })}
                  </p>
                  <p className="text-sm font-bold text-slate-900">{d.getDate()}</p>
                </div>
                <div className="relative" style={{ height: GRID_PX }}>
                  <div
                    className="pointer-events-none absolute inset-0 opacity-30"
                    style={{
                      backgroundImage: `linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)`,
                      backgroundSize: `100% ${100 / 12}%`,
                    }}
                  />
                  {/* stacked appointments + blocks for all providers in this day */}
                  <WeekDayStack
                    appointments={dayAppts}
                    blocks={dayBlocks}
                    providers={providers}
                    selectedId={selectedId}
                    onSelect={onSelect}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type WeekStackEntry =
  | { key: string; kind: "appt"; appt: ScheduleAppointment; start: number; end: number }
  | { key: string; kind: "block"; block: ProviderBlock; start: number; end: number };

function buildWeekStackEntries(
  appointments: ScheduleAppointment[],
  blocks: ProviderBlock[],
  providerSet: Set<number>,
): WeekStackEntry[] {
  const out: WeekStackEntry[] = [];
  for (const a of appointments) {
    if (!providerSet.has(a.provider)) continue;
    out.push({
      key: `a-${a.id}`,
      kind: "appt",
      appt: a,
      start: parseTimeToMinutes(a.start_time),
      end: parseTimeToMinutes(a.end_time),
    });
  }
  for (const b of blocks) {
    if (!providerSet.has(b.provider)) continue;
    if (b.all_day) {
      out.push({
        key: `b-${b.id}`,
        kind: "block",
        block: b,
        start: SCHEDULE_DAY_START_MIN,
        end: SCHEDULE_DAY_END_MIN,
      });
    } else if (b.start_time && b.end_time) {
      out.push({
        key: `b-${b.id}`,
        kind: "block",
        block: b,
        start: parseTimeToMinutes(b.start_time),
        end: parseTimeToMinutes(b.end_time),
      });
    }
  }
  return out.sort((x, y) => x.start - y.start);
}

function computeLanes(entries: WeekStackEntry[]): { laneByKey: Map<string, number>; laneCount: number } {
  const laneEnds: number[] = [];
  const laneByKey = new Map<string, number>();
  for (const e of entries) {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] > e.start) lane++;
    if (lane === laneEnds.length) laneEnds.push(e.end);
    else laneEnds[lane] = e.end;
    laneByKey.set(e.key, lane);
  }
  return { laneByKey, laneCount: Math.max(1, laneEnds.length) };
}

function WeekDayStack({
  appointments,
  blocks,
  providers,
  selectedId,
  onSelect,
}: {
  appointments: ScheduleAppointment[];
  blocks: ProviderBlock[];
  providers: ProviderRow[];
  selectedId: number | null;
  onSelect: (a: ScheduleAppointment) => void;
}) {
  const { entries, laneByKey, laneCount } = useMemo(() => {
    const providerSet = new Set(providers.map((p) => p.id));
    const list = buildWeekStackEntries(appointments, blocks, providerSet);
    const lanes = computeLanes(list);
    return { entries: list, ...lanes };
  }, [appointments, blocks, providers]);

  const wPct = 100 / laneCount;

  return (
    <>
      {entries.map((entry) => {
        if (entry.kind === "block") {
          const b = entry.block;
          const { topPct, heightPct } = timePositionPercent(entry.start, entry.end - entry.start);
          const lane = laneByKey.get(entry.key) ?? 0;
          return (
            <div
              key={entry.key}
              className="pointer-events-none absolute z-[1] rounded border border-slate-300"
              style={{
                top: `${topPct}%`,
                height: `${heightPct}%`,
                minHeight: 4,
                left: `calc(${lane * wPct}% + 2px)`,
                width: `calc(${wPct}% - 4px)`,
                backgroundImage: STRIPE_BG,
                backgroundColor: "#e5e7eb",
              }}
              title="Blocked (online booking)"
            />
          );
        }
        const a = entry.appt;
        const dur = appointmentDurationMinutes(a.start_time, a.end_time);
        const { topPct, heightPct } = timePositionPercent(entry.start, dur);
        const lane = laneByKey.get(entry.key) ?? 0;
        const base = providerColorForId(a.provider);
        const bg = a.status === "cancelled" || a.status === "no_show" ? undefined : blockBackground(a.status, base);
        const styles = statusBlockStyles(a.status, base);
        const selected = selectedId === a.id;
        const tip = [a.patient_name, a.provider_name, a.service_name || "", `${dur} min`, a.status].join("\n");
        return (
          <button
            key={entry.key}
            type="button"
            title={tip}
            onClick={() => onSelect(a)}
            className={cn(
              "absolute z-[3] overflow-hidden rounded border text-left text-[12px] leading-snug shadow-sm transition",
              styles.wrap,
              selected && "ring-2 ring-[#16a349] ring-offset-1",
            )}
            style={{
              top: `${topPct}%`,
              height: `${heightPct}%`,
              minHeight: 24,
              left: `calc(${lane * wPct}% + 2px)`,
              width: `calc(${wPct}% - 4px)`,
              background: bg,
              borderColor: a.status === "cancelled" ? "#fecaca" : "rgba(255,255,255,0.35)",
            }}
          >
            <AppointmentBlockDecor status={a.status} />
            <span className={cn("block truncate px-1 font-semibold", styles.text)}>{a.patient_name}</span>
            <span className="block truncate px-1 text-[12px] leading-tight opacity-90">{formatTimeShort(a.start_time)}</span>
          </button>
        );
      })}
    </>
  );
}

function MonthGrid({
  focusDate,
  appointments,
  onPickDay,
}: {
  focusDate: Date;
  appointments: ScheduleAppointment[];
  onPickDay: (d: Date) => void;
}) {
  const byDate = useMemo(() => {
    const m: Record<string, ScheduleAppointment[]> = {};
    for (const a of appointments) {
      m[a.appointment_date] = m[a.appointment_date] || [];
      m[a.appointment_date].push(a);
    }
    return m;
  }, [appointments]);

  const monthStart = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1);
  const monthEnd = new Date(focusDate.getFullYear(), focusDate.getMonth() + 1, 0);
  const startPad = monthStart.getDay();
  const daysInMonth = monthEnd.getDate();

  const cells: { date: Date | null; inMonth: boolean }[] = [];
  for (let i = 0; i < startPad; i++) {
    const d = addDays(monthStart, i - startPad);
    cells.push({ date: d, inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      date: new Date(focusDate.getFullYear(), focusDate.getMonth(), day, 12, 0, 0),
      inMonth: true,
    });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date!;
    cells.push({ date: addDays(last, 1), inMonth: false });
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 gap-px bg-slate-200 text-center text-[10px] font-semibold uppercase text-slate-500">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((x) => (
          <div key={x} className="bg-slate-50 py-2">
            {x}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-slate-200">
        {cells.map(({ date, inMonth }, idx) => {
          if (!date) return <div key={idx} className="min-h-[88px] bg-white" />;
          const iso = toIsoDate(date);
          const list = byDate[iso] || [];
          const count = list.length;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onPickDay(date)}
              className={cn(
                "flex min-h-[88px] flex-col items-stretch bg-white p-1.5 text-left transition hover:bg-emerald-50/50",
                !inMonth && "bg-slate-50/80 text-slate-400",
                inMonth && isSameDay(date, new Date()) && "bg-emerald-50/60 ring-1 ring-inset ring-emerald-200",
              )}
            >
              <span className={cn("text-xs font-bold", inMonth ? "text-slate-900" : "text-slate-400")}>
                {date.getDate()}
              </span>
              {count === 0 ? (
                <span className="mt-1 text-[10px] text-slate-400">—</span>
              ) : (
                <>
                  <span className="mt-0.5 text-[10px] font-medium text-slate-600">{count} appt{count === 1 ? "" : "s"}</span>
                  <div className="mt-1 flex flex-wrap gap-0.5">
                    {list.slice(0, 6).map((a) => (
                      <span
                        key={a.id}
                        className="h-1.5 max-w-[40%] flex-1 rounded-full"
                        style={{
                          backgroundColor:
                            a.status === "cancelled" ? "#fecdd3" : a.status === "no_show" ? "#fde68a" : providerColorForId(a.provider),
                        }}
                        title={`${a.patient_name} · ${formatTimeShort(a.start_time)}`}
                      />
                    ))}
                  </div>
                  {list.length > 6 && (
                    <span className="mt-0.5 text-[9px] text-slate-500">+{list.length - 6} more</span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
