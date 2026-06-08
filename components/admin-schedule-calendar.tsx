"use client";

import { useAppFeedback } from "@/components/app-feedback";
import {
  PatientNameWithProfile,
  PatientPaymentProfileBadge,
  paymentProfileShortLabel,
} from "@/components/patient-payment-profile";
import { cn } from "@/lib/utils";
import { effectiveAppointmentStatus } from "@/lib/visit-status-utils";
import {
  SCHEDULE_DAY_END_MIN,
  SCHEDULE_DAY_START_MIN,
  addDays,
  appointmentBlocksScheduleGrid,
  appointmentDurationMinutes,
  canDragAppointmentOnSchedule,
  computeOpenGaps,
  formatIntervalLabel,
  isSameDay,
  minutesToLabel,
  mondayOfWeekContaining,
  parseTimeToMinutes,
  providerColorForId,
  providerDayOpenGaps,
  scheduleDayEndMinute,
  scheduleTotalMinutes,
  slotStartIsInPastForClinic,
  snapScheduleGridStartMinute,
  timePositionPercent,
  toIsoDate,
  unionProviderBookableGaps,
  type TimeInterval,
} from "@/lib/admin-schedule-utils";
import { clinicTodayIso, formatWeekdayMonthDayYear } from "@/lib/format-date";
import {
  useCallback,
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
  /** UI/calendar status (e.g. no_show when legacy row was awaiting_payment + no_show_fee). */
  display_status?: string;
  invoice_kind?: string | null;
  reason_for_visit?: string;
  /** insurance | cash — badge next to name on calendar */
  patient_payment_profile?: string;
};

/** Status used for colors, labels, and desk rules on the schedule grid. */
export function scheduleAppointmentUiStatus(a: ScheduleAppointment): string {
  return a.display_status ?? effectiveAppointmentStatus(a.status, a.invoice_kind);
}

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
      wrap: "border-2 border-red-600 bg-red-200 text-red-950 shadow-md ring-1 ring-red-400/60",
      text: "font-semibold",
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
  if (status === "cancelled") return "linear-gradient(to bottom, #ffe4e6, #fecdd3)";
  if (status === "no_show") return "linear-gradient(to bottom, #fecaca, #f87171)";
  if (status === "completed") return `linear-gradient(to bottom, ${baseColor}aa, ${baseColor}77)`;
  return baseColor;
}

function AppointmentStatusBanner({ status }: { status: string }) {
  if (status === "no_show") {
    return (
      <div className="shrink-0 border-b border-red-800/30 bg-red-700 px-1.5 py-0.5 text-center text-[10px] font-black uppercase tracking-wide text-white">
        No-show
      </div>
    );
  }
  if (status === "cancelled") {
    return (
      <div className="shrink-0 border-b border-rose-800/25 bg-rose-600 px-1.5 py-0.5 text-center text-[10px] font-black uppercase tracking-wide text-white">
        Cancelled
      </div>
    );
  }
  return null;
}

function AppointmentBlockDecor({ status }: { status: string }) {
  if (status === "cancelled") return null;
  if (status === "no_show") {
    return (
      <span
        className="pointer-events-none absolute right-1 top-1 flex h-4 min-w-[1.1rem] items-center justify-center rounded bg-red-900 px-0.5 text-[8px] font-black leading-none text-white shadow-sm ring-1 ring-white/40"
        title="No-show"
        aria-hidden
      >
        !
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

/** Pixel height per hour on the day grid (scales total height with open–close range). */
const GRID_PX_PER_HOUR = 2688 / 12;

/** Header row above the time grid — must match provider/day column headers so times line up with blocks. */
const SCHEDULE_GRID_HEADER_MIN_PX = 52;

/** Minimum width per lane when multiple appointments overlap in time. */
const MIN_LANE_WIDTH_PX = 104;
const LANE_GAP_PX = 3;

function scheduleGridHours(dayEndMin: number): number {
  return (dayEndMin - SCHEDULE_DAY_START_MIN) / 60;
}

function scheduleGridPx(dayEndMin: number): number {
  return Math.round(GRID_PX_PER_HOUR * scheduleGridHours(dayEndMin));
}

/** Snap Y position inside grid to nearest 15 min for hover readout. */
function scheduleHoverFromClientY(
  clientY: number,
  rectTop: number,
  rectHeight: number,
  dayEndMin: number,
): { topPct: number; label: string } | null {
  if (rectHeight <= 0) return null;
  const totalMin = scheduleTotalMinutes(dayEndMin);
  const y = clientY - rectTop;
  const pctRaw = (y / rectHeight) * 100;
  const pctClamped = Math.max(0, Math.min(100, pctRaw));
  const minsFloat = SCHEDULE_DAY_START_MIN + (pctClamped / 100) * totalMin;
  const snapped = Math.round(minsFloat / 15) * 15;
  const clampedM = Math.max(SCHEDULE_DAY_START_MIN, Math.min(dayEndMin - 1, snapped));
  const topPct = ((clampedM - SCHEDULE_DAY_START_MIN) / totalMin) * 100;
  return { topPct, label: minutesToLabel(clampedM) };
}

/** Snap a click inside an open-gap rectangle to a 15-minute start minute within [gapStart, gapEnd). */
/** Snap a preferred start (e.g. from a cancelled visit) into a 15-minute step inside a free gap. */
function snapMinuteInsideGap(preferredMin: number, gapStartMin: number, gapEndMin: number): number {
  const snapped = Math.round(preferredMin / 15) * 15;
  const maxStart = Math.max(gapStartMin, gapEndMin - 15);
  return Math.max(gapStartMin, Math.min(maxStart, snapped));
}

function snapOpenSlotStartMinute(clientY: number, gapRect: DOMRect, gapStartMin: number, gapEndMin: number): number {
  const step = 15;
  const h = Math.max(gapRect.height, 1);
  const frac = Math.max(0, Math.min(1, (clientY - gapRect.top) / h));
  const continuous = gapStartMin + frac * (gapEndMin - gapStartMin);
  let snapped = Math.round(continuous / step) * step;
  const maxStart = Math.max(gapStartMin, gapEndMin - step);
  return Math.max(gapStartMin, Math.min(snapped, maxStart));
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
  if (key === "no_show") return "No-show";
  return key.replace(/_/g, " ");
}

/** Time row on calendar blocks — badge stays visible even on short appointments. */
function ScheduleAppointmentTimeRow({
  startShown,
  endShown,
  paymentProfile,
  uiStatus,
  textClassName,
}: {
  startShown: string;
  endShown: string;
  paymentProfile?: string;
  uiStatus: string;
  textClassName?: string;
}) {
  return (
    <div
      className={cn(
        "shrink-0 border-b px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-tight",
        uiStatus === "cancelled" && "border-rose-800/20 text-rose-950",
        uiStatus === "no_show" && "border-red-700/40 bg-red-300/50 text-red-950",
        uiStatus === "completed" && "border-slate-400/40 text-slate-900",
        !["cancelled", "no_show", "completed"].includes(uiStatus) && "border-white/25 text-inherit",
        uiStatus !== "cancelled" && textClassName,
      )}
    >
      <span className="flex min-w-0 items-center gap-1">
        <span className="min-w-0 truncate">
          {startShown} – {endShown}
        </span>
        <PatientPaymentProfileBadge profile={paymentProfile} compact />
      </span>
    </div>
  );
}

function PatientNameLine({
  fullName,
  paymentProfile,
  textClassName,
  wrapperClassName,
}: {
  fullName: string;
  paymentProfile?: string;
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
      <span className={cn("flex min-w-0 items-center gap-1 font-semibold leading-snug text-[13px]", textClassName)}>
        <span className="min-w-0 truncate">{display}</span>
        <PatientPaymentProfileBadge profile={paymentProfile} compact />
      </span>
    </div>
  );
}

function AppointmentBlockTooltip({
  patientName,
  patientPaymentProfile,
  serviceName,
  startLabel,
  endLabel,
  providerName,
  status,
  reasonForVisit,
  children,
}: {
  patientName: string;
  patientPaymentProfile?: string;
  serviceName: string;
  startLabel: string;
  endLabel: string;
  providerName: string;
  status: string;
  reasonForVisit?: string;
  children: ReactNode;
}) {
  const reason = (reasonForVisit || "").trim();
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
          <p className="font-semibold text-slate-900">
            <PatientNameWithProfile name={patientName} profile={patientPaymentProfile} compactBadge />
          </p>
          <p className="mt-1 text-slate-700">{serviceName?.trim() ? serviceName : "—"}</p>
          <p className="mt-1 tabular-nums text-slate-600">
            {startLabel} – {endLabel}
          </p>
          <p className="mt-1 text-slate-600">{providerName}</p>
          <p className="mt-1 capitalize text-slate-500">{appointmentTooltipStatus(status)}</p>
          {reason ? (
            <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-sky-900">
              <span className="font-semibold text-sky-800">Reason: </span>
              <span className="line-clamp-3">{reason}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Horizontal “now” line position (% from top of day grid), or null if outside range or not today. */
function nowLinePercent(focusDate: Date, dayEndMin: number): number | null {
  const now = new Date();
  if (!isSameDay(focusDate, now)) return null;
  const mins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  if (mins < SCHEDULE_DAY_START_MIN || mins >= dayEndMin) return null;
  const rel = mins - SCHEDULE_DAY_START_MIN;
  return (rel / scheduleTotalMinutes(dayEndMin)) * 100;
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
  /**
   * Day or week view: click an open (unbooked) strip to book — start time snaps to the nearest 15 minutes
   * under the cursor within that open range.
   */
  onPickOpenSlot?: (pick: {
    providerId: number;
    providerName: string;
    dateIso: string;
    startMinute: number;
    /** Open-window bounds (minutes from midnight) for the strip that was clicked — used to block overlaps in desk booking. */
    gapStartMin: number;
    gapEndMin: number;
  }) => void;
  /** Day or week view: drag a visit block to another time, day, or provider (15-minute snap, working hours). */
  onRescheduleAppointment?: (pick: {
    appointment: ScheduleAppointment;
    providerId: number;
    providerName: string;
    dateIso: string;
    startMinute: number;
  }) => void | Promise<void>;
};

const DRAG_THRESHOLD_PX = 6;

type ScheduleDragState = {
  appointment: ScheduleAppointment;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  durationMin: number;
  preview: {
    providerId: number;
    providerName: string;
    startMinute: number;
    /** Set when dropping on the week grid (day column). */
    dateIso?: string;
  } | null;
};

function resolveScheduleDropTarget(
  clientX: number,
  clientY: number,
  durationMin: number,
  dayEndMin: number,
): { providerId: number; providerName: string; startMinute: number } | null {
  const el = document.elementFromPoint(clientX, clientY);
  const col = el?.closest("[data-schedule-provider-column]") as HTMLElement | null;
  if (!col) return null;
  const providerId = Number.parseInt(col.getAttribute("data-schedule-provider-id") ?? "", 10);
  const providerName = col.getAttribute("data-schedule-provider-name") ?? "";
  if (Number.isNaN(providerId)) return null;
  const grid = col.querySelector("[data-schedule-grid-body]") as HTMLElement | null;
  if (!grid) return null;
  const rect = grid.getBoundingClientRect();
  return {
    providerId,
    providerName,
    startMinute: snapScheduleGridStartMinute(clientY, rect, durationMin, dayEndMin),
  };
}

/** Which open strip contains this clock time (minutes from midnight). */
function openGapAtMinute(gaps: TimeInterval[], minute: number): TimeInterval | undefined {
  return gaps.find((g) => minute >= g.startMin && minute < g.endMin);
}

/** First provider (in list order) with a free gap at this clock time — used for week-view desk booking. */
function resolveWeekDeskBookingAtMinute(
  providers: ProviderRow[],
  iso: string,
  minute: number,
  appointments: ScheduleAppointment[],
  blocks: ProviderBlock[],
  dayEndMin: number,
): { providerId: number; providerName: string; gap: TimeInterval } | null {
  for (const p of providers) {
    const gaps = providerDayOpenGaps(p.id, iso, appointments, blocks, dayEndMin, true);
    const gap = openGapAtMinute(gaps, minute);
    if (gap) {
      return { providerId: p.id, providerName: p.provider_name, gap };
    }
  }
  return null;
}

function weekDropFitsInGap(gap: TimeInterval, startMinute: number, durationMin: number): boolean {
  const snapped = snapMinuteInsideGap(startMinute, gap.startMin, gap.endMin);
  return snapped + durationMin <= gap.endMin;
}

/** Week grid drop: day column + time snap, then first provider with room (keeps dragged provider when possible). */
function resolveWeekScheduleDropTarget(
  clientX: number,
  clientY: number,
  durationMin: number,
  dayEndMin: number,
  providers: ProviderRow[],
  appointments: ScheduleAppointment[],
  blocks: ProviderBlock[],
  preferredProviderId?: number,
): { providerId: number; providerName: string; dateIso: string; startMinute: number } | null {
  const el = document.elementFromPoint(clientX, clientY);
  const col = el?.closest("[data-schedule-day-column]") as HTMLElement | null;
  if (!col) return null;
  const dateIso = col.getAttribute("data-schedule-date-iso") ?? "";
  if (!dateIso) return null;
  const grid = col.querySelector("[data-schedule-grid-body]") as HTMLElement | null;
  if (!grid) return null;
  const rect = grid.getBoundingClientRect();
  const startMinute = snapScheduleGridStartMinute(clientY, rect, durationMin, dayEndMin);

  const tryProvider = (p: ProviderRow) => {
    const gaps = providerDayOpenGaps(p.id, dateIso, appointments, blocks, dayEndMin, true);
    const gap = openGapAtMinute(gaps, startMinute);
    if (!gap || !weekDropFitsInGap(gap, startMinute, durationMin)) return null;
    const snapped = snapMinuteInsideGap(startMinute, gap.startMin, gap.endMin);
    if (snapped + durationMin > gap.endMin) return null;
    return {
      providerId: p.id,
      providerName: p.provider_name,
      dateIso,
      startMinute: snapped,
    };
  };

  if (preferredProviderId != null) {
    const preferred = providers.find((p) => p.id === preferredProviderId);
    if (preferred) {
      const hit = tryProvider(preferred);
      if (hit) return hit;
    }
  }
  for (const p of providers) {
    const hit = tryProvider(p);
    if (hit) return hit;
  }
  return null;
}

function minuteAtGridY(clientY: number, gridRect: DOMRect, dayEndMin: number): number {
  const h = Math.max(gridRect.height, 1);
  const frac = Math.max(0, Math.min(1, (clientY - gridRect.top) / h));
  return SCHEDULE_DAY_START_MIN + frac * scheduleTotalMinutes(dayEndMin);
}

type DeskOpenSlotPick = NonNullable<CalendarProps["onPickOpenSlot"]> extends (
  pick: infer P,
) => void
  ? P
  : never;

/** Block desk click-to-book when the snapped start is already past (clinic clock). */
function useGuardPastDeskSlotPick(
  onPickOpenSlot: CalendarProps["onPickOpenSlot"],
): CalendarProps["onPickOpenSlot"] {
  const { runWithFeedback } = useAppFeedback();
  const todayIso = clinicTodayIso();
  const guarded = useCallback(
    (pick: DeskOpenSlotPick) => {
      if (!onPickOpenSlot) return;
      if (slotStartIsInPastForClinic(pick.dateIso, pick.startMinute, todayIso)) {
        void runWithFeedback(() => Promise.reject(new Error("past_slot")), {
          errorFallback:
            "That time has already passed. Pick a later time today or another date.",
        });
        return;
      }
      onPickOpenSlot(pick);
    },
    [onPickOpenSlot, runWithFeedback, todayIso],
  );
  return onPickOpenSlot ? guarded : undefined;
}

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
  onPickOpenSlot,
  onRescheduleAppointment,
}: CalendarProps) {
  const [nowTick, setNowTick] = useState(0);
  const guardedPickOpenSlot = useGuardPastDeskSlotPick(onPickOpenSlot);
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

  const dayEndMin = scheduleDayEndMinute(!!onPickOpenSlot);
  const nowPct = useMemo(() => {
    void nowTick;
    return view === "day" ? nowLinePercent(focusDate, dayEndMin) : null;
  }, [view, focusDate, nowTick, dayEndMin]);

  if (visibleProviders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center text-sm text-slate-600">
        No providers loaded. Add providers or refresh the page.
      </div>
    );
  }

  const showDeskHint = (view === "day" || view === "week") && !!onPickOpenSlot;

  return (
    <div className="space-y-2">
      {showDeskHint ? (
        <p className="text-sm text-slate-600">
          <span className="font-medium text-[#0d5c2e]">Desk booking:</span> in{" "}
          <strong>Day</strong> or <strong>Week</strong> view, click open white space on the grid, or open a visit and use{" "}
          <strong>Book another patient in this slot</strong> to double-book a time that already has someone. Schedule runs
          through <strong>9:00 PM</strong> for staff.
        </p>
      ) : null}

      <ScheduleCalendarGuide providers={visibleProviders} showDeskDetails={showDeskHint} />

      {view === "day" && (
        <DayGrid
          focusDate={focusDate}
          providers={visibleProviders}
          appointments={appointments}
          blocks={blocks}
          selectedId={selectedId}
          onSelect={onSelect}
          nowPct={nowPct}
          onPickOpenSlot={guardedPickOpenSlot}
          onRescheduleAppointment={onRescheduleAppointment}
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
          dayEndMin={dayEndMin}
          onPickOpenSlot={guardedPickOpenSlot}
          onRescheduleAppointment={onRescheduleAppointment}
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
  onOpenSlotClick,
  dragActive,
  dayEndMin,
  gridPx,
}: {
  children: ReactNode;
  className?: string;
  outerRef?: Ref<HTMLDivElement>;
  onOpenSlotClick?: (clientY: number, gridRect: DOMRect) => void;
  dragActive?: boolean;
  dayEndMin: number;
  gridPx: number;
}) {
  const [hover, setHover] = useState<{ label: string; topPct: number } | null>(null);
  const hours = scheduleGridHours(dayEndMin);
  return (
    <div
      ref={outerRef}
      data-schedule-grid-body
      className={cn("relative bg-white", className)}
      style={{ height: gridPx }}
      onMouseMoveCapture={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const h = scheduleHoverFromClientY(e.clientY, r.top, r.height, dayEndMin);
        if (h) setHover(h);
      }}
      onMouseLeave={() => setHover(null)}
      onClickCapture={(e) => {
        if (!onOpenSlotClick || dragActive) return;
        const t = e.target as HTMLElement;
        if (t.closest("[data-schedule-appointment]")) return;
        if (t.closest("[data-schedule-open-gap]")) return;
        onOpenSlotClick(e.clientY, e.currentTarget.getBoundingClientRect());
      }}
      onPointerDownCapture={(e) => {
        if (dragActive) return;
        const t = e.target as HTMLElement;
        if (t.closest("[data-schedule-open-gap]")) e.stopPropagation();
      }}
    >
      <ScheduleGridBackground hours={hours} />
      {hover ? <HoverTimeChip label={hover.label} topPct={hover.topPct} /> : null}
      {children}
    </div>
  );
}

function ScheduleCalendarGuide({
  providers,
  showDeskDetails,
}: {
  providers: ProviderRow[];
  showDeskDetails: boolean;
}) {
  return (
    <details className="group rounded-xl border border-slate-200/90 bg-slate-50/50 text-sm ring-1 ring-slate-100/80 open:bg-white">
      <summary className="cursor-pointer list-none px-3 py-2 font-medium text-slate-600 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-white text-xs text-slate-500 shadow-sm ring-1 ring-slate-200 transition group-open:rotate-180"
            aria-hidden
          >
            ▾
          </span>
          Color key &amp; tips
          <span className="font-normal text-slate-400">(providers, cancelled, blocked)</span>
        </span>
      </summary>
      <div className="space-y-2 border-t border-slate-100 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {providers.map((p) => {
            const c = providerColorForId(p.id);
            return (
              <span key={p.id} className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 shrink-0 rounded-sm shadow-sm" style={{ backgroundColor: c }} />
                <span className="font-medium text-slate-800">{p.provider_name}</span>
              </span>
            );
          })}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-rose-200 ring-1 ring-rose-300" />
            <span className="text-slate-600">Cancelled</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-8 shrink-0 rounded-sm ring-1 ring-slate-300"
              style={{ backgroundImage: STRIPE_BG, backgroundColor: "#e5e7eb" }}
            />
            <span className="text-slate-600">Blocked (online only)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <PatientPaymentProfileBadge profile="insurance" compact />
            <span className="text-slate-600">Insurance</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <PatientPaymentProfileBadge profile="cash" compact />
            <span className="text-slate-600">Cash / self-pay</span>
          </span>
        </div>
        {showDeskDetails ? (
          <p className="text-xs leading-relaxed text-slate-500">
            Gray stripes block online booking only — staff can still book in open white areas in <strong>Day</strong> or{" "}
            <strong>Week</strong> view. Cancelled and no-show visits appear in red; that time stays open for a new booking unless another
            active visit is there. Drag to reschedule works in <strong>Day</strong> and <strong>Week</strong> view.
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-slate-500">
            Month view summarizes visits. Use <strong>Day</strong> or <strong>Week</strong> to book open slots or drag appointments to a new time.
          </p>
        )}
      </div>
    </details>
  );
}

function TimeLabelsColumn({ dayEndMin, gridPx }: { dayEndMin: number; gridPx: number }) {
  const rows: number[] = [];
  const totalMin = scheduleTotalMinutes(dayEndMin);
  for (let m = SCHEDULE_DAY_START_MIN; m < dayEndMin; m += 30) {
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
  onPickOpenSlot,
  onRescheduleAppointment,
}: {
  focusDate: Date;
  providers: ProviderRow[];
  appointments: ScheduleAppointment[];
  blocks: ProviderBlock[];
  selectedId: number | null;
  onSelect: (a: ScheduleAppointment) => void;
  nowPct: number | null;
  onPickOpenSlot?: CalendarProps["onPickOpenSlot"];
  onRescheduleAppointment?: CalendarProps["onRescheduleAppointment"];
}) {
  const iso = toIsoDate(focusDate);
  const dayEndMin = scheduleDayEndMinute(!!onPickOpenSlot);
  const gridPx = scheduleGridPx(dayEndMin);
  const [drag, setDrag] = useState<ScheduleDragState | null>(null);

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const dist2 = dx * dx + dy * dy;
      const moved = drag.moved || dist2 >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX;
      const preview = moved
        ? resolveScheduleDropTarget(e.clientX, e.clientY, drag.durationMin, dayEndMin)
        : drag.preview;
      setDrag((prev) =>
        prev && prev.pointerId === e.pointerId ? { ...prev, moved, preview } : prev,
      );
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      const appt = drag.appointment;
      if (drag.moved && drag.preview && onRescheduleAppointment) {
        const { providerId, providerName, startMinute } = drag.preview;
        const same =
          appt.provider === providerId &&
          appt.appointment_date === iso &&
          parseTimeToMinutes(appt.start_time) === startMinute;
        if (!same) {
          void onRescheduleAppointment({
            appointment: appt,
            providerId,
            providerName,
            dateIso: iso,
            startMinute,
          });
        }
      } else if (!drag.moved) {
        onSelect(appt);
      }
      setDrag(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, iso, onRescheduleAppointment, onSelect, dayEndMin]);

  const dragActive = drag?.moved ?? false;

  useEffect(() => {
    if (!dragActive) return;
    const prev = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    document.body.classList.add("cursor-grabbing");
    return () => {
      document.body.style.userSelect = prev;
      document.body.classList.remove("cursor-grabbing");
    };
  }, [dragActive]);

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/50 ring-1 ring-slate-100/80">
      <div className="flex min-w-[840px]">
        <TimeLabelsColumn dayEndMin={dayEndMin} gridPx={gridPx} />
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
              dayEndMin={dayEndMin}
              gridPx={gridPx}
              onPickOpenSlot={onPickOpenSlot}
              onRescheduleAppointment={onRescheduleAppointment}
              drag={drag}
              dragActive={dragActive}
              onAppointmentPointerDown={
                onRescheduleAppointment
                  ? (appt, e) => {
                      if (e.button !== 0 || !canDragAppointmentOnSchedule(appt.status)) return;
                      const durationMin = appointmentDurationMinutes(appt.start_time, appt.end_time);
                      setDrag({
                        appointment: appt,
                        pointerId: e.pointerId,
                        startX: e.clientX,
                        startY: e.clientY,
                        moved: false,
                        durationMin,
                        preview: null,
                      });
                    }
                  : undefined
              }
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
  dayEndMin,
  gridPx,
  onPickOpenSlot,
  onRescheduleAppointment: _onRescheduleAppointment,
  drag,
  dragActive,
  onAppointmentPointerDown,
}: {
  provider: ProviderRow;
  isoDate: string;
  appointments: ScheduleAppointment[];
  blocks: ProviderBlock[];
  selectedId: number | null;
  onSelect: (a: ScheduleAppointment) => void;
  nowPct: number | null;
  dayEndMin: number;
  gridPx: number;
  onPickOpenSlot?: CalendarProps["onPickOpenSlot"];
  onRescheduleAppointment?: CalendarProps["onRescheduleAppointment"];
  drag: ScheduleDragState | null;
  dragActive: boolean;
  onAppointmentPointerDown?: (appt: ScheduleAppointment, e: React.PointerEvent) => void;
}) {
  const base = providerColorForId(provider.id);

  const blockingAppointments = useMemo(
    () => appointments.filter((a) => appointmentBlocksScheduleGrid(a.status)),
    [appointments],
  );

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
    const apptSource = onPickOpenSlot ? appointments : blockingAppointments;
    const visibleAppts =
      dragActive && drag?.appointment.provider === provider.id
        ? apptSource.filter((a) => a.id !== drag.appointment.id)
        : apptSource;
    const ap = visibleAppts.map((a) => ({
      startMin: parseTimeToMinutes(a.start_time),
      endMin: parseTimeToMinutes(a.end_time),
    }));
    // Desk booking: gray stripes are online-only blocks — still shown, but staff can click to book.
    const bl = onPickOpenSlot
      ? []
      : blocks.flatMap((b) => {
          if (b.all_day) {
            return [{ startMin: SCHEDULE_DAY_START_MIN, endMin: dayEndMin }];
          }
          if (b.start_time && b.end_time) {
            return [{ startMin: parseTimeToMinutes(b.start_time), endMin: parseTimeToMinutes(b.end_time) }];
          }
          return [];
        });
    return [...ap, ...bl].filter((x) => x.endMin > x.startMin);
  }, [appointments, blockingAppointments, blocks, drag, dragActive, dayEndMin, onPickOpenSlot, provider.id]);

  const openGaps = useMemo(
    () => computeOpenGaps(busyIntervals, SCHEDULE_DAY_START_MIN, dayEndMin),
    [busyIntervals, dayEndMin],
  );

  const dropPreview =
    dragActive && drag?.preview?.providerId === provider.id ? drag.preview : null;
  const dropDurationMin = drag?.durationMin ?? 15;

  return (
    <div
      className="relative border-l border-slate-100"
      data-schedule-provider-column
      data-schedule-provider-id={provider.id}
      data-schedule-provider-name={provider.provider_name}
    >
      <div
        className="flex min-h-0 shrink-0 items-center justify-center border-b border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100/80 px-2 py-2.5 text-center"
        style={{ minHeight: SCHEDULE_GRID_HEADER_MIN_PX }}
      >
        <p className="text-[15px] font-semibold leading-snug text-slate-800">{provider.provider_name}</p>
      </div>
      <ScheduleGridColumnBody
        outerRef={stackRef}
        dragActive={dragActive}
        dayEndMin={dayEndMin}
        gridPx={gridPx}
        onOpenSlotClick={
          onPickOpenSlot
            ? (clientY, rect) => {
                const minute = minuteAtGridY(clientY, rect, dayEndMin);
                const gap = openGapAtMinute(openGaps, minute);
                if (!gap) return;
                const startMinute = snapOpenSlotStartMinute(clientY, rect, gap.startMin, gap.endMin);
                onPickOpenSlot({
                  providerId: provider.id,
                  providerName: provider.provider_name,
                  dateIso: isoDate,
                  startMinute,
                  gapStartMin: gap.startMin,
                  gapEndMin: gap.endMin,
                });
              }
            : undefined
        }
      >
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
                title={
                  onPickOpenSlot
                    ? "Online booking block — patients cannot book here; click to book from the desk schedule"
                    : "Blocked (online booking)"
                }
              />
            );
          }
          if (!b.start_time || !b.end_time) return null;
          const st = parseTimeToMinutes(b.start_time);
          const en = parseTimeToMinutes(b.end_time);
          const { topPct, heightPct } = timePositionPercent(st, en - st, dayEndMin);
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
              title={
                onPickOpenSlot
                  ? "Online booking block — patients cannot book here; click to book from the desk schedule"
                  : "Blocked (online booking)"
              }
            />
          );
        })}

        {openGaps.map((g, i) => {
          const dur = g.endMin - g.startMin;
          const { topPct, heightPct } = timePositionPercent(g.startMin, dur, dayEndMin);
          const labelRange = formatIntervalLabel(g.startMin, g.endMin);
          if (onPickOpenSlot) {
            return (
              <button
                key={`gap-${i}`}
                type="button"
                data-schedule-open-gap
                className="group absolute left-1 right-1 z-[2] cursor-pointer rounded-md border border-transparent text-left transition hover:border-emerald-300/60 hover:bg-emerald-500/[0.09] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#16a349]"
                style={{ top: `${topPct}%`, height: `${heightPct}%`, minHeight: 8 }}
                title={`Book here · ${labelRange} · ${dur} min free`}
                aria-label={`Book appointment in open time ${labelRange}`}
                onClick={(e) => {
                  e.stopPropagation();
                  const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                  const startMinute = snapOpenSlotStartMinute(e.clientY, r, g.startMin, g.endMin);
                  onPickOpenSlot({
                    providerId: provider.id,
                    providerName: provider.provider_name,
                    dateIso: isoDate,
                    startMinute,
                    gapStartMin: g.startMin,
                    gapEndMin: g.endMin,
                  });
                }}
              >
                <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 hidden w-max max-w-[220px] -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-800 shadow-lg group-hover:block group-focus-visible:block">
                  Click to book · {labelRange}
                </span>
              </button>
            );
          }
          return (
            <div
              key={`gap-${i}`}
              className="group pointer-events-none absolute left-1 right-1 z-[2]"
              style={{ top: `${topPct}%`, height: `${heightPct}%`, minHeight: 8 }}
              title={`Open · ${labelRange} · ${dur} min available`}
            >
              <div className="h-full w-full rounded-md bg-emerald-500/0 transition group-hover:bg-emerald-500/[0.07]" />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 hidden w-max max-w-[220px] -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-800 shadow-lg group-hover:block">
                Open · {labelRange} · {dur} min available
              </div>
            </div>
          );
        })}

        <div className="pointer-events-none absolute inset-0 z-[5] overflow-x-auto overflow-y-hidden">
          <div className="relative h-full min-w-full" style={{ width: innerMinW }}>
            {appointments.map((a) => {
              const key = `a-${a.id}`;
              const st = parseTimeToMinutes(a.start_time);
              const dur = appointmentDurationMinutes(a.start_time, a.end_time);
              const { topPct, heightPct } = timePositionPercent(st, dur, dayEndMin);
              const uiStatus = scheduleAppointmentUiStatus(a);
              const styles = statusBlockStyles(uiStatus, base);
              const bg = blockBackground(uiStatus, base);
              const selected = selectedId === a.id;
              const startShown = a.start_time_display || formatTimeShort(a.start_time);
              const endShown = a.end_time_display || formatTimeShort(a.end_time);
              const lane = laneByKey.get(key) ?? 0;
              const leftPx = lane * (laneW + LANE_GAP_PX);
              const draggable = !!onAppointmentPointerDown && canDragAppointmentOnSchedule(a.status);
              const isDragging = drag?.appointment.id === a.id;
              const freedSlot =
                !!onPickOpenSlot && (uiStatus === "cancelled" || uiStatus === "no_show");
              return (
                <button
                  key={a.id}
                  type="button"
                  data-schedule-appointment
                  onPointerDown={(e) => {
                    if (draggable) onAppointmentPointerDown(a, e);
                  }}
                  onClick={(e) => {
                    if (draggable) {
                      e.preventDefault();
                      return;
                    }
                    onSelect(a);
                  }}
                  title={
                    freedSlot
                      ? "Open visit details (no-show fee, billing). Use the side panel to book another visit in this time."
                      : draggable
                        ? "Drag to reschedule · release without moving to open details"
                        : undefined
                  }
                  className={cn(
                    "pointer-events-auto absolute flex flex-col overflow-hidden rounded-lg border px-1 text-left shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#16a349]",
                    styles.wrap,
                    selected && "z-[4] ring-2 ring-[#16a349] ring-offset-1",
                    draggable && "cursor-grab touch-none active:cursor-grabbing",
                    freedSlot && "cursor-pointer hover:ring-2 hover:ring-emerald-400/80",
                    isDragging && dragActive && "opacity-40",
                  )}
                  style={{
                    top: `${topPct}%`,
                    height: `${heightPct}%`,
                    left: leftPx,
                    width: laneW,
                    background: bg,
                    borderColor:
                      uiStatus === "cancelled"
                        ? "#fda4af"
                        : uiStatus === "no_show"
                          ? "#dc2626"
                          : selected
                            ? "#16a349"
                            : "rgb(148 163 184 / 0.9)",
                  }}
                >
                  <AppointmentBlockDecor status={uiStatus} />
                  <AppointmentBlockTooltip
                    patientName={a.patient_name}
                    patientPaymentProfile={a.patient_payment_profile}
                    serviceName={a.service_name || ""}
                    startLabel={startShown}
                    endLabel={endShown}
                    providerName={a.provider_name}
                    status={uiStatus}
                    reasonForVisit={a.reason_for_visit}
                  >
                    <div className="flex min-h-0 flex-1 flex-col">
                      <AppointmentStatusBanner status={uiStatus} />
                      <ScheduleAppointmentTimeRow
                        startShown={startShown}
                        endShown={endShown}
                        paymentProfile={a.patient_payment_profile}
                        uiStatus={uiStatus}
                        textClassName={styles.text}
                      />
                      <PatientNameLine
                        fullName={a.patient_name}
                        paymentProfile={a.patient_payment_profile}
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

        {dropPreview &&
          (() => {
            const { topPct, heightPct } = timePositionPercent(dropPreview.startMinute, dropDurationMin, dayEndMin);
            return (
              <div
                className="pointer-events-none absolute left-1 right-1 z-[7] flex items-start justify-center rounded-lg border-2 border-dashed border-[#16a349] bg-[#16a349]/15 px-1 pt-1"
                style={{ top: `${topPct}%`, height: `${heightPct}%`, minHeight: 12 }}
                aria-hidden
              >
                <span className="rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold text-[#13823d] shadow-sm">
                  {minutesToLabel(dropPreview.startMinute)}
                </span>
              </div>
            );
          })()}

        {nowPct != null && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-[12]"
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
  dayEndMin,
  onPickOpenSlot,
  onRescheduleAppointment,
}: {
  weekDays: Date[];
  providers: ProviderRow[];
  appointments: ScheduleAppointment[];
  blocks: ProviderBlock[];
  selectedId: number | null;
  onSelect: (a: ScheduleAppointment) => void;
  dayEndMin: number;
  onPickOpenSlot?: CalendarProps["onPickOpenSlot"];
  onRescheduleAppointment?: CalendarProps["onRescheduleAppointment"];
}) {
  const gridPx = scheduleGridPx(dayEndMin);
  const providerIds = useMemo(() => providers.map((p) => p.id), [providers]);
  const [drag, setDrag] = useState<ScheduleDragState | null>(null);

  const appointmentsForDrag = useMemo(() => {
    if (!drag) return appointments;
    return appointments.filter((a) => a.id !== drag.appointment.id);
  }, [appointments, drag]);

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const dist2 = dx * dx + dy * dy;
      const moved = drag.moved || dist2 >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX;
      const preview = moved
        ? resolveWeekScheduleDropTarget(
            e.clientX,
            e.clientY,
            drag.durationMin,
            dayEndMin,
            providers,
            appointmentsForDrag,
            blocks,
            drag.appointment.provider,
          )
        : drag.preview;
      setDrag((prev) =>
        prev && prev.pointerId === e.pointerId ? { ...prev, moved, preview } : prev,
      );
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      const appt = drag.appointment;
      if (drag.moved && drag.preview?.dateIso && onRescheduleAppointment) {
        const { providerId, providerName, startMinute, dateIso } = drag.preview;
        const same =
          appt.provider === providerId &&
          appt.appointment_date === dateIso &&
          parseTimeToMinutes(appt.start_time) === startMinute;
        if (!same) {
          void onRescheduleAppointment({
            appointment: appt,
            providerId,
            providerName,
            dateIso,
            startMinute,
          });
        }
      } else if (!drag.moved) {
        onSelect(appt);
      }
      setDrag(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, appointmentsForDrag, blocks, dayEndMin, onRescheduleAppointment, onSelect, providers]);

  const dragActive = drag?.moved ?? false;

  useEffect(() => {
    if (!dragActive) return;
    const prev = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    document.body.classList.add("cursor-grabbing");
    return () => {
      document.body.style.userSelect = prev;
      document.body.classList.remove("cursor-grabbing");
    };
  }, [dragActive]);

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/50 ring-1 ring-slate-100/80">
      <div className="flex min-w-[980px]">
        <TimeLabelsColumn dayEndMin={dayEndMin} gridPx={gridPx} />
        <div
          className="grid flex-1"
          style={{ gridTemplateColumns: `repeat(${weekDays.length}, minmax(140px, 1fr))` }}
        >
          {weekDays.map((d) => {
            const iso = toIsoDate(d);
            const dayAppts = appointments.filter((a) => a.appointment_date === iso);
            const dayBlocks = blocks.filter((b) => b.block_date === iso);
            const isToday = isSameDay(d, new Date());
            const nowPct = isToday ? nowLinePercent(d, dayEndMin) : null;
            return (
              <WeekDayColumn
                key={iso}
                iso={iso}
                isToday={isToday}
                dayAppts={dayAppts}
                dayBlocks={dayBlocks}
                providers={providers}
                providerIds={providerIds}
                appointments={drag ? appointmentsForDrag : appointments}
                blocks={blocks}
                selectedId={selectedId}
                onSelect={onSelect}
                dayEndMin={dayEndMin}
                gridPx={gridPx}
                nowPct={nowPct}
                onPickOpenSlot={onPickOpenSlot}
                drag={drag}
                dragActive={dragActive}
                onAppointmentPointerDown={
                  onRescheduleAppointment
                    ? (appt, e) => {
                        if (e.button !== 0 || !canDragAppointmentOnSchedule(appt.status)) return;
                        const durationMin = appointmentDurationMinutes(appt.start_time, appt.end_time);
                        setDrag({
                          appointment: appt,
                          pointerId: e.pointerId,
                          startX: e.clientX,
                          startY: e.clientY,
                          moved: false,
                          durationMin,
                          preview: null,
                        });
                      }
                    : undefined
                }
                dayLabel={
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {d.toLocaleDateString(undefined, { weekday: "short" })}
                    </p>
                    <p className="text-[15px] font-bold leading-none text-slate-900">{d.getDate()}</p>
                  </>
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeekDayColumn({
  iso,
  isToday,
  dayAppts,
  dayBlocks,
  providers,
  providerIds,
  appointments,
  blocks,
  selectedId,
  onSelect,
  dayEndMin,
  gridPx,
  nowPct,
  onPickOpenSlot,
  drag,
  dragActive,
  onAppointmentPointerDown,
  dayLabel,
}: {
  iso: string;
  isToday: boolean;
  dayAppts: ScheduleAppointment[];
  dayBlocks: ProviderBlock[];
  providers: ProviderRow[];
  providerIds: number[];
  appointments: ScheduleAppointment[];
  blocks: ProviderBlock[];
  selectedId: number | null;
  onSelect: (a: ScheduleAppointment) => void;
  dayEndMin: number;
  gridPx: number;
  nowPct: number | null;
  onPickOpenSlot?: CalendarProps["onPickOpenSlot"];
  drag: ScheduleDragState | null;
  dragActive: boolean;
  onAppointmentPointerDown?: (appt: ScheduleAppointment, e: React.PointerEvent) => void;
  dayLabel: ReactNode;
}) {
  const bookableGaps = useMemo(() => {
    if (!onPickOpenSlot || providerIds.length === 0) return [];
    return unionProviderBookableGaps(providerIds, iso, appointments, blocks, dayEndMin, true);
  }, [onPickOpenSlot, providerIds, iso, appointments, blocks, dayEndMin]);

  const pickAtMinute = (minute: number, preferredStartMin?: number) => {
    if (!onPickOpenSlot) return;
    const target = resolveWeekDeskBookingAtMinute(providers, iso, minute, appointments, blocks, dayEndMin);
    if (!target) return;
    const startMinute =
      preferredStartMin != null
        ? snapMinuteInsideGap(preferredStartMin, target.gap.startMin, target.gap.endMin)
        : snapMinuteInsideGap(minute, target.gap.startMin, target.gap.endMin);
    onPickOpenSlot({
      providerId: target.providerId,
      providerName: target.providerName,
      dateIso: iso,
      startMinute,
      gapStartMin: target.gap.startMin,
      gapEndMin: target.gap.endMin,
    });
  };

  const dropPreview =
    dragActive && drag?.preview?.dateIso === iso ? drag.preview : null;
  const dropDurationMin = drag?.durationMin ?? 15;

  return (
    <div
      className={cn("relative border-l border-slate-100", isToday && "bg-emerald-50/40")}
      data-schedule-day-column
      data-schedule-date-iso={iso}
    >
      <div
        className="flex shrink-0 flex-col items-center justify-center border-b border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100/80 px-2 py-2.5 text-center"
        style={{ minHeight: SCHEDULE_GRID_HEADER_MIN_PX }}
      >
        {dayLabel}
      </div>
      <ScheduleGridColumnBody
        dragActive={dragActive}
        dayEndMin={dayEndMin}
        gridPx={gridPx}
        onOpenSlotClick={
          onPickOpenSlot
            ? (clientY, rect) => {
                const minute = minuteAtGridY(clientY, rect, dayEndMin);
                const gap = openGapAtMinute(bookableGaps, minute);
                if (!gap) return;
                const startMinute = snapOpenSlotStartMinute(clientY, rect, gap.startMin, gap.endMin);
                pickAtMinute(startMinute, startMinute);
              }
            : undefined
        }
      >
        {bookableGaps.map((g, i) => {
          const dur = g.endMin - g.startMin;
          const { topPct, heightPct } = timePositionPercent(g.startMin, dur, dayEndMin);
          const labelRange = formatIntervalLabel(g.startMin, g.endMin);
          if (!onPickOpenSlot) {
            return (
              <div
                key={`gap-${i}`}
                className="pointer-events-none absolute left-1 right-1 z-[2]"
                style={{ top: `${topPct}%`, height: `${heightPct}%`, minHeight: 8 }}
                title={`Open · ${labelRange}`}
              />
            );
          }
          return (
            <button
              key={`gap-${i}`}
              type="button"
              data-schedule-open-gap
              className="group absolute left-1 right-1 z-[2] cursor-pointer rounded-md border border-transparent text-left transition hover:border-emerald-300/60 hover:bg-emerald-500/[0.09] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#16a349]"
              style={{ top: `${topPct}%`, height: `${heightPct}%`, minHeight: 8 }}
              title={`Book here · ${labelRange} · ${dur} min free`}
              aria-label={`Book appointment in open time ${labelRange}`}
              onClick={(e) => {
                e.stopPropagation();
                const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                const startMinute = snapOpenSlotStartMinute(e.clientY, r, g.startMin, g.endMin);
                pickAtMinute(startMinute, startMinute);
              }}
            >
              <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 hidden w-max max-w-[220px] -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-800 shadow-lg group-hover:block group-focus-visible:block">
                Click to book · {labelRange}
              </span>
            </button>
          );
        })}
        <WeekDayStack
          appointments={dayAppts}
          blocks={dayBlocks}
          providers={providers}
          selectedId={selectedId}
          onSelect={onSelect}
          dayEndMin={dayEndMin}
          deskBooking={!!onPickOpenSlot}
          drag={drag}
          dragActive={dragActive}
          onAppointmentPointerDown={onAppointmentPointerDown}
        />
        {dropPreview &&
          (() => {
            const { topPct, heightPct } = timePositionPercent(
              dropPreview.startMinute,
              dropDurationMin,
              dayEndMin,
            );
            return (
              <div
                className="pointer-events-none absolute left-1 right-1 z-[7] flex items-start justify-center rounded-lg border-2 border-dashed border-[#16a349] bg-[#16a349]/15 px-1 pt-1"
                style={{ top: `${topPct}%`, height: `${heightPct}%`, minHeight: 12 }}
                aria-hidden
              >
                <span className="rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold text-[#13823d] shadow-sm">
                  {minutesToLabel(dropPreview.startMinute)}
                </span>
              </div>
            );
          })()}
        {nowPct != null && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-[12]"
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
  dayEndMin,
  deskBooking,
  drag,
  dragActive,
  onAppointmentPointerDown,
}: {
  appointments: ScheduleAppointment[];
  blocks: ProviderBlock[];
  providers: ProviderRow[];
  selectedId: number | null;
  onSelect: (a: ScheduleAppointment) => void;
  dayEndMin: number;
  deskBooking?: boolean;
  drag: ScheduleDragState | null;
  dragActive: boolean;
  onAppointmentPointerDown?: (appt: ScheduleAppointment, e: React.PointerEvent) => void;
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
    <div ref={containerRef} className="absolute inset-0 z-[5] overflow-x-auto overflow-y-hidden">
      <div className="relative h-full min-w-full" style={{ width: innerMinW }}>
        {entries.map((entry) => {
          if (entry.kind === "block") {
            const b = entry.block;
            const { topPct, heightPct } = timePositionPercent(entry.start, entry.end - entry.start, dayEndMin);
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
                title={
                  deskBooking
                    ? "Online booking block — patients cannot book here; click to book from the desk schedule"
                    : "Blocked (online booking)"
                }
              />
            );
          }
          const a = entry.appt;
          const uiStatus = scheduleAppointmentUiStatus(a);
          const dur = appointmentDurationMinutes(a.start_time, a.end_time);
          const { topPct, heightPct } = timePositionPercent(entry.start, dur, dayEndMin);
          const lane = laneByKey.get(entry.key) ?? 0;
          const base = providerColorForId(a.provider);
          const bg = blockBackground(uiStatus, base);
          const styles = statusBlockStyles(uiStatus, base);
          const selected = selectedId === a.id;
          const leftPx = lane * (laneW + LANE_GAP_PX);
          const startShown = a.start_time_display || formatTimeShort(a.start_time);
          const endShown = a.end_time_display || formatTimeShort(a.end_time);
          const freedSlot = !!deskBooking && (uiStatus === "cancelled" || uiStatus === "no_show");
          const draggable = !!onAppointmentPointerDown && canDragAppointmentOnSchedule(a.status);
          const isDragging = drag?.appointment.id === a.id;
          return (
            <button
              key={entry.key}
              type="button"
              data-schedule-appointment
              onPointerDown={(e) => {
                if (draggable) onAppointmentPointerDown(a, e);
              }}
              onClick={(e) => {
                if (draggable) {
                  e.preventDefault();
                  return;
                }
                onSelect(a);
              }}
              title={
                freedSlot
                  ? "Open visit details. Use the side panel to book another visit in this time."
                  : draggable
                    ? "Drag to reschedule · release without moving to open details"
                    : undefined
              }
              className={cn(
                "absolute z-[3] flex flex-col overflow-hidden rounded-lg border px-0.5 text-left shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#16a349]",
                styles.wrap,
                selected && "z-[4] ring-2 ring-[#16a349] ring-offset-1",
                freedSlot && "cursor-pointer hover:ring-2 hover:ring-emerald-400/80",
                draggable && "cursor-grab touch-none active:cursor-grabbing",
                isDragging && dragActive && "opacity-40",
              )}
              style={{
                top: `${topPct}%`,
                height: `${heightPct}%`,
                left: leftPx,
                width: laneW,
                background: bg,
                borderColor:
                  uiStatus === "cancelled"
                    ? "#fecaca"
                    : uiStatus === "no_show"
                      ? "#f87171"
                      : selected
                        ? "#16a349"
                        : "rgb(148 163 184 / 0.9)",
              }}
            >
              <AppointmentBlockDecor status={uiStatus} />
              <AppointmentBlockTooltip
                patientName={a.patient_name}
                patientPaymentProfile={a.patient_payment_profile}
                serviceName={a.service_name || ""}
                startLabel={startShown}
                endLabel={endShown}
                providerName={a.provider_name}
                status={uiStatus}
                reasonForVisit={a.reason_for_visit}
              >
                <div className="flex min-h-0 flex-1 flex-col">
                  <AppointmentStatusBanner status={uiStatus} />
                  <ScheduleAppointmentTimeRow
                    startShown={startShown}
                    endShown={endShown}
                    paymentProfile={a.patient_payment_profile}
                    uiStatus={uiStatus}
                    textClassName={styles.text}
                  />
                  <PatientNameLine
                    fullName={a.patient_name}
                    paymentProfile={a.patient_payment_profile}
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
                  <ul className="mt-1 min-w-0 space-y-0.5">
                    {list.slice(0, 3).map((a) => {
                      const ui = scheduleAppointmentUiStatus(a);
                      const shortName = formatPatientNameShort(a.patient_name);
                      return (
                        <li
                          key={a.id}
                          className="truncate text-[9px] font-semibold leading-tight text-slate-800"
                          title={`${a.patient_name}${paymentProfileShortLabel(a.patient_payment_profile) ? ` · ${paymentProfileShortLabel(a.patient_payment_profile)}` : ""} · ${formatTimeShort(a.start_time)} · ${appointmentTooltipStatus(ui)}`}
                        >
                          <PatientNameWithProfile name={shortName} profile={a.patient_payment_profile} compactBadge />
                        </li>
                      );
                    })}
                  </ul>
                  {list.length > 3 ? (
                    <span className="mt-0.5 text-[9px] text-slate-500">+{list.length - 3} more</span>
                  ) : null}
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
