import { StatusChip } from "@/lib/types";

const styles: Record<string, string> = {
  booked: "bg-slate-100 text-slate-700",
  scheduled: "bg-slate-100 text-slate-700",
  checked_in: "bg-amber-100 text-amber-700",
  in_consultation: "bg-cyan-100 text-cyan-700",
  completed: "bg-emerald-100 text-emerald-700",
  awaiting_payment: "bg-orange-100 text-orange-700",
  paid: "bg-emerald-100 text-emerald-700",
  unpaid: "bg-rose-100 text-rose-700",
  // Invoice / billing statuses from API
  issued: "bg-amber-100 text-amber-800",
  draft: "bg-slate-100 text-slate-600",
  overdue: "bg-rose-100 text-rose-800",
  void: "bg-slate-200 text-slate-500",
};

export function StatusChipView({ status }: { status: StatusChip | string }) {
  const key = String(status);
  const style = styles[key] ?? "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${style}`}>{key.replaceAll("_", " ")}</span>;
}
