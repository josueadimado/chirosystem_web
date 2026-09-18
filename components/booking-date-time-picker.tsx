"use client";

import { IconCheck, IconChevronLeft, IconChevronRight, IconClock } from "@/components/icons";
import { cn } from "@/lib/utils";

type BookingMonthCalendarProps = {
  monthLabel: string;
  yearLabel: string;
  cells: (Date | null)[];
  selectedIso: string;
  todayIso: string;
  maxBookDateIso: string;
  canPrevMonth: boolean;
  canNextMonth: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDate: (iso: string) => void;
  toLocalISODate: (d: Date) => string;
  /** Jump to today when that day is bookable */
  onToday?: () => void;
  className?: string;
};

/**
 * Banani CalendarDatePicker look — month grid with green selected day.
 * Callers keep all date rules (weekends, max book date, loading slots).
 */
export function BookingMonthCalendar({
  monthLabel,
  yearLabel,
  cells,
  selectedIso,
  todayIso,
  maxBookDateIso,
  canPrevMonth,
  canNextMonth,
  onPrevMonth,
  onNextMonth,
  onSelectDate,
  toLocalISODate,
  onToday,
  className,
}: BookingMonthCalendarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-[#e8e8e8] bg-white p-5 sm:p-6",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-lg font-semibold text-[#0d1f14]">{monthLabel}</div>
          <div className="text-sm text-[#949494]">{yearLabel}</div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Previous month"
            disabled={!canPrevMonth}
            onClick={onPrevMonth}
            className={cn(
              "rounded-lg border border-[#e8e8e8] p-2 text-[#0d1f14] transition hover:bg-[#f5f5f5]",
              !canPrevMonth && "cursor-not-allowed opacity-40",
            )}
          >
            <IconChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            disabled={!canNextMonth}
            onClick={onNextMonth}
            className={cn(
              "rounded-lg border border-[#e8e8e8] p-2 text-[#0d1f14] transition hover:bg-[#f5f5f5]",
              !canNextMonth && "cursor-not-allowed opacity-40",
            )}
          >
            <IconChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="py-2 text-center text-xs font-semibold text-[#949494]"
          >
            {d}
          </div>
        ))}
        {cells.map((d, idx) => {
          if (!d) {
            return <div key={`pad-${idx}`} className="aspect-square opacity-0" aria-hidden />;
          }
          const iso = toLocalISODate(d);
          const isPast = iso < todayIso;
          const isAfterMax = iso > maxBookDateIso;
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          const isDisabled = isPast || isWeekend || isAfterMax;
          const isSelected = iso === selectedIso;
          return (
            <button
              key={iso}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelectDate(iso)}
              className={cn(
                "flex aspect-square w-full items-center justify-center rounded-lg text-sm font-medium transition-colors",
                !d && "opacity-0",
                isDisabled && "cursor-not-allowed bg-[#f5f5f5] text-[#949494] opacity-50",
                !isDisabled &&
                  isSelected &&
                  "bg-[#16a349] font-semibold text-white",
                !isDisabled &&
                  !isSelected &&
                  "border border-[#e8e8e8] bg-[#f5f5f5] text-[#0d1f14] hover:bg-[#dbe7fb]",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>

      {onToday ? (
        <button
          type="button"
          onClick={onToday}
          className="rounded-lg border border-[#e8e8e8] py-2 text-sm text-[#949494] transition hover:bg-[#f5f5f5] hover:text-[#0d5c2e]"
        >
          Today
        </button>
      ) : null}
    </div>
  );
}

export type BookingTimeSlotEntry = {
  label: string;
  bookable: boolean;
};

type BookingTimeSlotListProps = {
  dateLabel: string;
  slots: BookingTimeSlotEntry[] | null;
  selectedTime: string;
  loading?: boolean;
  emptyContent?: React.ReactNode;
  loadingContent?: React.ReactNode;
  onSelectTime: (label: string) => void;
  /** Optional note under a slot (e.g. massage past closing) */
  slotFootnote?: (label: string, bookable: boolean) => React.ReactNode;
  infoNote?: string;
  className?: string;
};

/**
 * Banani TimeSlotList look — vertical scrollable list with check on selected.
 */
export function BookingTimeSlotList({
  dateLabel,
  slots,
  selectedTime,
  loading,
  emptyContent,
  loadingContent,
  onSelectTime,
  slotFootnote,
  infoNote,
  className,
}: BookingTimeSlotListProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-[#e8e8e8] bg-white p-5 sm:p-6",
        className,
      )}
    >
      <div>
        <h3 className="text-lg font-semibold text-[#0d1f14]">Available Times</h3>
        <p className="mt-1 text-sm text-[#949494]">{dateLabel}</p>
      </div>

      {loading ? (
        loadingContent ?? (
          <p className="text-sm text-[#949494]">Checking availability…</p>
        )
      ) : slots === null ? (
        <p className="text-sm text-[#949494]">Select a date to see open times.</p>
      ) : slots.length === 0 ? (
        emptyContent ?? (
          <p className="text-sm text-[#949494]">No open times on this day — try another date.</p>
        )
      ) : (
        <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
          {slots.map((entry) => {
            const selected = entry.bookable && entry.label === selectedTime;
            return (
              <button
                key={entry.label}
                type="button"
                disabled={!entry.bookable}
                title={
                  !entry.bookable
                    ? "This time is not available — pick another time or day."
                    : undefined
                }
                onClick={() => {
                  if (!entry.bookable) return;
                  onSelectTime(entry.label);
                }}
                className={cn(
                  "flex items-center justify-between rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors",
                  !entry.bookable &&
                    "cursor-not-allowed border-[#e8e8e8] bg-[#f5f5f5] text-[#949494] opacity-50",
                  entry.bookable &&
                    selected &&
                    "border-[#16a349] bg-[#dbe7fb] font-semibold text-[#16a349]",
                  entry.bookable &&
                    !selected &&
                    "border-[#e8e8e8] bg-white text-[#0d1f14] hover:border-[#16a349]",
                )}
              >
                <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                  <span className="flex items-center gap-2">
                    <IconClock className="h-3.5 w-3.5 shrink-0" />
                    {entry.label}
                  </span>
                  {slotFootnote?.(entry.label, entry.bookable)}
                </span>
                {selected ? <IconCheck className="h-4 w-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      )}

      {infoNote ? (
        <div className="rounded-lg border border-[#e8e8e8] bg-[#dbe7fb] px-4 py-3">
          <p className="text-xs text-[#277eff]">{infoNote}</p>
        </div>
      ) : null}
    </div>
  );
}
