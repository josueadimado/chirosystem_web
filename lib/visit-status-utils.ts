/** Status badge styling for visit side panels (schedule drawer, doctor schedule). */

export function visitStatusBadgeClass(status: string): string {
  switch (status) {
    case "booked":
    case "scheduled":
      return "bg-emerald-100 text-emerald-900";
    case "checked_in":
    case "in_consultation":
      return "bg-sky-100 text-sky-900";
    case "awaiting_payment":
      return "bg-violet-100 text-violet-900";
    case "completed":
      return "bg-slate-200 text-slate-800";
    case "cancelled":
      return "bg-pink-100 text-pink-900";
    case "no_show":
      return "bg-orange-100 text-orange-900";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function visitStatusLabel(status: string): string {
  const key = status === "booked" ? "scheduled" : status;
  return key.replaceAll("_", " ");
}
