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
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type Ref,
} from "react";
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

/** Total height for 7am–7pm grid (taller = more readable; ~107px per hour at 1280). */
const GRID_PX = 1280;

/** Header row above the time grid — must match provider/day column headers so times line up with blocks. */
const SCHEDULE_GRID_HEADER_MIN_PX = 52;

/** Minimum width per lane when multiple appointments overlap in time. */
const MIN_LANE_WIDTH_PX = 104;
const LANE_GAP_PX = 3;

function scheduleGridHours(): number {
  return (SCHEDULE_DAY_END_MIN - SCHEDULE_DAY_START_MIN) / 60;
}

/** Snap Y position inside grid to nearest 15 min for hover readout. */
function scheduleHoverFromClientY(
  clientY: number,
  rectTop: number,
  rectHeight: number,
): { topPct: number; label: string } | null {
  if (rectHeight <= 0) return null;
  const y = clientY - rectTop;
  const pctRaw = (y / rectHeight) * 100;
  const pctClamped = Math.max(0, Math.min(100, pctRaw));
  const minsFloat = SCHEDULE_DAY_START_MIN + (pctClamped / 100) * SCHEDULE_TOTAL_MIN;
  const snapped = Math.round(minsFloat / 15) * 15;
  const clampedM = Math.max(SCHEDULE_DAY_START_MIN, Math.min(SCHEDULE_DAY_END_MIN - 1, snapped));
  const topPct = ((clampedM - SCHEDULE_DAY_START_MIN) / SCHEDULE_TOTAL_MIN) * 100;
  return { topPct, label: minutesToLabel(clampedM) };
}

/** Hour (strong), half-hour, quarter-hour lines + alternating hour wash. */
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

function formatPatientNameShort(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return fullName.trim();
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}

function appointmentTooltipStatus(status: string): string {
  const key = status === "booked" ? "scheduled" : status;
  return key.replace(/_/g, " ");
}

function PatientNameLine({
  fullName,
  textClassName,
  wrapperClassName,
}: {
  fullName: string;
  textClassName?: string;
  /** Outer row padding (e.g. tighter when a time line sits above the name). */
  wrapperClassName?: string;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;
    const check = () => {
      setCompact(measure.scrollWidth > row.clientWidth);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(row);
    return () => ro.disconnect();
  }, [fullName]);

  const display = compact ? formatPatientNameShort(fullName) : fullName;

  return (
    <div ref={rowRef} className={cn("min-w-0 px-1.5 pt-1", wrapperClassName)}>
      <span
        ref={measureRef}
        className={cn("pointer-events-none invisible absolute whitespace-nowrap font-semibold text-[13px]", textClassName)}
        aria-hidden
      >
        {fullName}
      </span>
      <span className={cn("block font-semibold leading-snug text-[13px]", textClassName)}>{display}</span>
    </div>
  );
}

function AppointmentBlockTooltip({
  patientName,
  serviceName,
  startLabel,
  endLabel,
  providerName,
  status,
  children,
}: {
  patientName: string;
  serviceName: string;
  startLabel: string;
  endLabel: string;
  providerName: string;
  status: string;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [place, setPlace] = useState<"top" | "bottom">("top");
  const wrapRef = useRef<HTMLDivElement>(null);

  const updatePlacement = () => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const tipEstimate = 132;
    const margin = 8;
    const spaceAbove = r.top;
    const spaceBelow = window.innerHeight - r.bottom;
    if (spaceAbove >= tipEstimate + margin && spaceAbove >= spaceBelow) setPlace("top");
    else if (spaceBelow >= tipEstimate + margin) setPlace("bottom");
    else setPlace(spaceAbove >= spaceBelow ? "top" : "bottom");
  };

  return (
    <div
      ref={wrapRef}
      className="relative flex h-full min-h-0 w-full min-w-0 flex-col"
      onMouseEnter={() => {
        updatePlacement();
        setVisible(true);
      }}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible ? (
        <div
          role="tooltip"
          className={cn(
            "pointer-events-none absolute left-1/2 z-[60] w-max max-w-[min(288px,calc(100vw-24px))] -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[11px] leading-snug text-slate-800 shadow-xl",
            place === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          <p className="font-semibold text-slate-900">{patientName}</p>
          <p className="mt-1 text-slate-700">{serviceName?.trim() ? serviceName : "—"}</p>
          <p className="mt-1 tabular-nums text-slate-600">
            {startLabel} – {endLabel}
          </p>
          <p className="mt-1 text-slate-600">{providerName}</p>
          <p className="mt-1 capitalize text-slate-500">{appointmentTooltipStatus(status)}</p>
        </div>
      ) : null}
    </div>
  );
}

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

function HoverTimeChip({ label, topPct }: { label: string; topPct: number }) {
  const top = Math.max(2, Math.min(98, topPct));
  return (
    <div
      className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 rounded-md border border-slate-300 bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-slate-800 shadow-md"
      style={{ top: `${top}%`, transform: "translate(-50%, -50%)" }}
      role="status"
      aria-live="polite"
    >
      {label}
    </div>
  );
}

/** Day/week time grid: background lines, optional ref for width measure, hover time (capture phase). */
function ScheduleGridColumnBody({
  children,
  className,
  outerRef,
}: {
  children: ReactNode;
  className?: string;
  outerRef?: Ref<HTMLDivElement>;
}) {
  const [hover, setHover] = useState<{ label: string; topPct: number } | null>(null);
  const hours = scheduleGridHours();
  return (
    <div
      ref={outerRef}
      className={cn("relative bg-white", className)}
      style={{ height: GRID_PX }}
      onMouseMoveCapture={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const h = scheduleHoverFromClientY(e.clientY, r.top, r.height);
        if (h) setHover(h);
      }}
      onMouseLeave={() => setHover(null)}
    >
      <ScheduleGridBackground hours={hours} />
      {hover ? <HoverTimeChip label={hover.label} topPct={hover.topPct} /> : null}
      {children}
    </div>
  );
}

function ProviderLegend({ providers }: { providers: ProviderRow[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 rounded-2xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm shadow-sm ring-1 ring-slate-100/80">
      <span className="w-full text-xs text-slate-500 sm:w-auto sm:flex-none">
        Colors = provider; chip on each block = status.
      </span>
      <span className="font-semibold text-slate-500">Providers</span>
      {providers.map((p) => {
        const c = providerColorForId(p.id);
        return (
          <span key={p.id} className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 shrink-0 rounded-sm shadow-sm" style={{ backgroundColor: c }} />
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
  for (let m = SCHEDULE_DAY_START_MIN; m < SCHEDULE_DAY_END_MIN; m += 30) {
    rows.push(m);
  }
  return (
    <div className="flex w-[5.25rem] shrink-0 flex-col border-r border-slate-200 bg-slate-50/50">
      <div
        className="flex shrink-0 items-center justify-center border-b border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100/80 px-2 py-2.5"
        style={{ minHeight: SCHEDULE_GRID_HEADER_MIN_PX }}
        aria-hidden
      >
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Time</span>
      </div>
      <div
        className="relative text-[13px] font-medium leading-none text-slate-600"
        style={{ height: GRID_PX, minHeight: GRID_PX }}
      >
        {rows.map((m) => {
          const pct = ((m - SCHEDULE_DAY_START_MIN) / SCHEDULE_TOTAL_MIN) * 100;
          const onHour = m % 60 === 0;
          return (
            <span
              key={m}
              className={cn(
                "absolute left-0 right-1 -translate-y-1/2 text-right tabular-nums tracking-tight",
                onHour ? "text-[13px] font-medium text-slate-600" : "text-[10px] font-normal text-slate-400",
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
    <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/50 ring-1 ring-slate-100/80">
      <div className="flex min-w-[840px]">
        <TimeLabelsColumn />
        <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${providers.length}, minmax(140px, 1fr))` }}>
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
  isoDate: _isoDate,
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

  const apptLaneItems = useMemo(() => {
    return appointments
      .map((a) => ({
        key: `a-${a.id}`,
        start: parseTimeToMinutes(a.start_time),
        end: parseTimeToMinutes(a.end_time),
      }))
      .filter((x) => x.end > x.start)
      .sort((a, b) => a.start - b.start);
  }, [appointments]);

  const { laneByKey, laneCount } = useMemo(
    () => computeLanesForTimedItems(apptLaneItems),
    [apptLaneItems],
  );

  const stackRef = useRef<HTMLDivElement>(null);
  const [colWidth, setColWidth] = useState(0);

  useLayoutEffect(() => {
    const el = stackRef.current;
    if (!el) return;
    const apply = () => setColWidth(el.clientWidth);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const innerMinW = Math.max(
    colWidth,
    laneCount * MIN_LANE_WIDTH_PX + Math.max(0, laneCount - 1) * LANE_GAP_PX,
  );
  const laneW =
    laneCount > 0
      ? (innerMinW - Math.max(0, laneCount - 1) * LANE_GAP_PX) / laneCount
      : MIN_LANE_WIDTH_PX;

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
      <div
        className="flex min-h-0 shrink-0 items-center justify-center border-b border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100/80 px-2 py-2.5 text-center"
        style={{ minHeight: SCHEDULE_GRID_HEADER_MIN_PX }}
      >
        <p className="text-[15px] font-semibold leading-snug text-slate-800">{provider.provider_name}</p>
      </div>
      <ScheduleGridColumnBody outerRef={stackRef}>
        {blocks.map((b) => {
          if (b.all_day) {
            return (
              <div
                key={b.id}
                className="pointer-events-none absolute left-0 right-0 z-[1] rounded-md border border-slate-300"
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
              className="pointer-events-none absolute left-1 right-1 z-[1] rounded-md border border-slate-300"
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
              className="group absolute left-1 right-1 z-[2] cursor-default"
              style={{ top: `${topPct}%`, height: `${heightPct}%`, minHeight: 8 }}
              title={`Open · ${formatIntervalLabel(g.startMin, g.endMin)} · ${dur} min available`}
            >
              <div className="h-full w-full rounded-md bg-emerald-500/0 transition group-hover:bg-emerald-500/[0.07]" />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 hidden w-max max-w-[220px] -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-800 shadow-lg group-hover:block">
                Open · {formatIntervalLabel(g.startMin, g.endMin)} · {dur} min available
              </div>
            </div>
          );
        })}

        <div className="absolute inset-0 z-[3] overflow-x-auto overflow-y-hidden">
          <div className="relative h-full min-w-full" style={{ width: innerMinW }}>
            {appointments.map((a) => {
              const key = `a-${a.id}`;
              const st = parseTimeToMinutes(a.start_time);
              const dur = appointmentDurationMinutes(a.start_time, a.end_time);
              const { topPct, heightPct } = timePositionPercent(st, dur);
              const styles = statusBlockStyles(a.status, base);
              const bg = a.status === "cancelled" || a.status === "no_show" ? undefined : blockBackground(a.status, base);
              const selected = selectedId === a.id;
              const startShown = a.start_time_display || formatTimeShort(a.start_time);
              const endShown = a.end_time_display || formatTimeShort(a.end_time);
              const lane = laneByKey.get(key) ?? 0;
              const leftPx = lane * (laneW + LANE_GAP_PX);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onSelect(a)}
                  className={cn(
                    "absolute flex flex-col overflow-hidden rounded-lg border px-1 text-left shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#16a349]",
                    styles.wrap,
                    selected && "z-[4] ring-2 ring-[#16a349] ring-offset-1",
                  )}
                  style={{
                    top: `${topPct}%`,
                    height: `${heightPct}%`,
                    left: leftPx,
                    width: laneW,
                    background: bg,
                    borderColor:
                      a.status === "cancelled"
                        ? "#fecaca"
                        : selected
                          ? "#16a349"
                          : "rgb(148 163 184 / 0.9)",
                  }}
                >
                  <AppointmentBlockDecor status={a.status} />
                  <AppointmentBlockTooltip
                    patientName={a.patient_name}
                    serviceName={a.service_name || ""}
                    startLabel={startShown}
                    endLabel={endShown}
                    providerName={a.provider_name}
                    status={a.status}
                  >
                    <div className="flex min-h-0 flex-1 flex-col">
                      <div
                        className={cn(
                          "shrink-0 border-b px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-tight",
                          a.status === "cancelled" && "border-rose-800/20 text-rose-950",
                          a.status === "no_show" && "border-amber-900/20 text-amber-950",
                          a.status === "completed" && "border-slate-400/40 text-slate-900",
                          !["cancelled", "no_show", "completed"].includes(a.status) && "border-white/25 text-inherit",
                          a.status !== "cancelled" && styles.text,
                        )}
                      >
                        {startShown} – {endShown}
                      </div>
                      <PatientNameLine
                        fullName={a.patient_name}
                        textClassName={styles.text}
                        wrapperClassName="min-w-0 px-1.5 pb-1.5 pt-0.5"
                      />
                    </div>
                  </AppointmentBlockTooltip>
                </button>
              );
            })}
          </div>
        </div>

        {nowPct != null && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-[5]"
            style={{ top: `${nowPct}%` }}
            aria-hidden
          >
            <div className="h-0.5 bg-red-500 shadow-sm" />
          </div>
        )}
      </ScheduleGridColumnBody>
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
    <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/50 ring-1 ring-slate-100/80">
      <div className="flex min-w-[980px]">
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
                <div
                  className="flex shrink-0 flex-col items-center justify-center border-b border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100/80 px-2 py-2.5 text-center"
                  style={{ minHeight: SCHEDULE_GRID_HEADER_MIN_PX }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {d.toLocaleDateString(undefined, { weekday: "short" })}
                  </p>
                  <p className="text-[15px] font-bold leading-none text-slate-900">{d.getDate()}</p>
                </div>
                <ScheduleGridColumnBody>
                  <WeekDayStack
                    appointments={dayAppts}
                    blocks={dayBlocks}
                    providers={providers}
                    selectedId={selectedId}
                    onSelect={onSelect}
                  />
                </ScheduleGridColumnBody>
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

function computeLanesForTimedItems(
  items: Array<{ key: string; start: number; end: number }>,
): { laneByKey: Map<string, number>; laneCount: number } {
  const laneEnds: number[] = [];
  const laneByKey = new Map<string, number>();
  for (const e of items) {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] > e.start) lane++;
    if (lane === laneEnds.length) laneEnds.push(e.end);
    else laneEnds[lane] = e.end;
    laneByKey.set(e.key, lane);
  }
  return { laneByKey, laneCount: Math.max(1, laneEnds.length) };
}

function computeLanes(entries: WeekStackEntry[]): { laneByKey: Map<string, number>; laneCount: number } {
  return computeLanesForTimedItems(entries.map((e) => ({ key: e.key, start: e.start, end: e.end })));
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

  const containerRef = useRef<HTMLDivElement>(null);
  const [colWidth, setColWidth] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => setColWidth(el.clientWidth);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const innerMinW = Math.max(
    colWidth,
    laneCount * MIN_LANE_WIDTH_PX + Math.max(0, laneCount - 1) * LANE_GAP_PX,
  );
  const laneW =
    laneCount > 0
      ? (innerMinW - Math.max(0, laneCount - 1) * LANE_GAP_PX) / laneCount
      : MIN_LANE_WIDTH_PX;

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-x-auto overflow-y-hidden">
      <div className="relative h-full min-w-full" style={{ width: innerMinW }}>
        {entries.map((entry) => {
          if (entry.kind === "block") {
            const b = entry.block;
            const { topPct, heightPct } = timePositionPercent(entry.start, entry.end - entry.start);
            const lane = laneByKey.get(entry.key) ?? 0;
            const leftPx = lane * (laneW + LANE_GAP_PX);
            return (
              <div
                key={entry.key}
                className="pointer-events-none absolute z-[1] rounded border border-slate-300"
                style={{
                  top: `${topPct}%`,
                  height: `${heightPct}%`,
                  minHeight: 4,
                  left: leftPx,
                  width: laneW,
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
          const leftPx = lane * (laneW + LANE_GAP_PX);
          const startShown = a.start_time_display || formatTimeShort(a.start_time);
          const endShown = a.end_time_display || formatTimeShort(a.end_time);
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => onSelect(a)}
              className={cn(
                "absolute z-[3] flex flex-col overflow-hidden rounded-lg border px-0.5 text-left shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#16a349]",
                styles.wrap,
                selected && "z-[4] ring-2 ring-[#16a349] ring-offset-1",
              )}
              style={{
                top: `${topPct}%`,
                height: `${heightPct}%`,
                left: leftPx,
                width: laneW,
                background: bg,
                borderColor:
                  a.status === "cancelled"
                    ? "#fecaca"
                    : selected
                      ? "#16a349"
                      : "rgb(148 163 184 / 0.9)",
              }}
            >
              <AppointmentBlockDecor status={a.status} />
              <AppointmentBlockTooltip
                patientName={a.patient_name}
                serviceName={a.service_name || ""}
                startLabel={startShown}
                endLabel={endShown}
                providerName={a.provider_name}
                status={a.status}
              >
                <div className="flex min-h-0 flex-1 flex-col">
                  <div
                    className={cn(
                      "shrink-0 border-b px-1 py-0.5 text-[11px] font-semibold tabular-nums leading-tight",
                      a.status === "cancelled" && "border-rose-800/20 text-rose-950",
                      a.status === "no_show" && "border-amber-900/20 text-amber-950",
                      a.status === "completed" && "border-slate-400/40 text-slate-900",
                      !["cancelled", "no_show", "completed"].includes(a.status) && "border-white/25 text-inherit",
                      a.status !== "cancelled" && styles.text,
                    )}
                  >
                    {startShown} – {endShown}
                  </div>
                  <PatientNameLine
                    fullName={a.patient_name}
                    textClassName={styles.text}
                    wrapperClassName="min-w-0 px-1 pb-1 pt-0.5"
                  />
                </div>
              </AppointmentBlockTooltip>
            </button>
          );
        })}
      </div>
    </div>
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
