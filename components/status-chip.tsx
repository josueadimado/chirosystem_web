import { StatusChip } from "@/lib/types";

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
      return "bg-red-100 text-red-900";
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
      return "border-l-[3px] border-l-red-500";
    case "cancelled":
      return "border-l-[3px] border-l-stone-500";
    case "booked":
    case "scheduled":
    default:
      return "border-l-[3px] border-l-slate-400";
  }
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
  const style = APPOINTMENT_STATUS_KEYS.has(key)
    ? appointmentStatusPillClass(key)
    : invoiceStyles[key] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${style}`}>
      {key.replaceAll("_", " ")}
    </span>
  );
}
