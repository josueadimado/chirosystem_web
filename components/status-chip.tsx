import { StatusChip } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Appointment workflow statuses shown in admin/doctor UI, plus "scheduled" (booked visits displayed as scheduled). */
const APPOINTMENT_STATUS_KEYS = new Set([
  "booked",
  "scheduled",
  "checked_in",
  "in_consultation",
  "awaiting_payment",
  "completed",
  "cancelled",
  "no_show",
]);

/** Human-readable label for status pills (no-show is hyphenated for clarity). */
export function appointmentStatusDisplayLabel(status: string): string {
  const key = status === "booked" ? "scheduled" : status;
  if (key === "no_show") return "No-show";
  return key.replaceAll("_", " ");
}

/**
 * Background + text color for appointment status pills.
 * Checked in = light blue, in consultation = yellow, awaiting payment = violet,
 * completed = green, no-show = red, cancelled = stone, booked = neutral slate.
 */
export function appointmentStatusPillClass(status: string): string {
  switch (status) {
    case "checked_in":
      return "bg-sky-100 text-sky-900";
    case "in_consultation":
      return "bg-yellow-100 text-yellow-950";
    case "awaiting_payment":
      return "bg-violet-100 text-violet-900";
    case "completed":
      return "bg-emerald-100 text-emerald-900";
    case "no_show":
      return "bg-red-100 text-red-900 ring-1 ring-red-300/80";
    case "cancelled":
      return "bg-stone-200 text-stone-800";
    case "booked":
    case "scheduled":
    default:
      return "bg-slate-100 text-slate-700";
  }
}

/** Strong left accent for compact schedule cells (calendar list items). */
export function appointmentStatusStripeClass(status: string): string {
  switch (status) {
    case "checked_in":
      return "border-l-[3px] border-l-sky-500";
    case "in_consultation":
      return "border-l-[3px] border-l-yellow-500";
    case "awaiting_payment":
      return "border-l-[3px] border-l-violet-500";
    case "completed":
      return "border-l-[3px] border-l-emerald-500";
    case "no_show":
      return "border-l-[3px] border-l-red-600";
    case "cancelled":
      return "border-l-[3px] border-l-stone-500";
    case "booked":
    case "scheduled":
    default:
      return "border-l-[3px] border-l-slate-400";
  }
}

/** Highlight entire visit/history rows when the appointment was a no-show. */
export function appointmentHistoryRowClass(status: string): string {
  if (status === "no_show") {
    return "border-red-300 bg-red-50/50 shadow-sm ring-1 ring-red-200/60";
  }
  if (status === "cancelled") {
    return "border-stone-300 bg-stone-50/80";
  }
  return "border-slate-200 bg-white shadow-sm";
}

type BadgeSize = "xs" | "sm" | "md";

const badgeSizeClass: Record<BadgeSize, string> = {
  xs: "px-2 py-0.5 text-[10px]",
  sm: "px-2.5 py-1 text-[11px]",
  md: "px-3 py-1 text-xs",
};

/** Status pill with a clear no-show mark (used on charts, history, schedule lists). */
export function AppointmentStatusBadge({
  status,
  size = "sm",
  className,
}: {
  status: string;
  size?: BadgeSize;
  className?: string;
}) {
  const isNoShow = status === "no_show";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wide",
        appointmentStatusPillClass(status),
        badgeSizeClass[size],
        className,
      )}
    >
      {isNoShow ? (
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-600 text-[9px] font-black leading-none text-white">
          !
        </span>
      ) : null}
      {appointmentStatusDisplayLabel(status)}
    </span>
  );
}

/** Directory badge when a patient has one or more no-shows on file. */
export function PatientNoShowBadge({ count, className }: { count: number; className?: string }) {
  if (!count || count < 1) return null;
  const label = count === 1 ? "1 no-show" : `${count} no-shows`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-900 ring-1 ring-red-300/70",
        className,
      )}
      title={`This patient has ${label} on record`}
    >
      <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-600 text-[8px] font-black text-white">
        !
      </span>
      {label}
    </span>
  );
}

const invoiceStyles: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  unpaid: "bg-rose-100 text-rose-700",
  issued: "bg-amber-100 text-amber-800",
  draft: "bg-slate-100 text-slate-600",
  overdue: "bg-rose-100 text-rose-800",
  void: "bg-slate-200 text-slate-500",
};

export function StatusChipView({ status }: { status: StatusChip | string }) {
  const key = String(status);
  if (APPOINTMENT_STATUS_KEYS.has(key)) {
    return <AppointmentStatusBadge status={key} size="md" className="capitalize" />;
  }
  const style = invoiceStyles[key] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${style}`}>
      {key.replaceAll("_", " ")}
    </span>
  );
}
