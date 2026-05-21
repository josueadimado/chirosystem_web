"use client";

/** Doctor schedule side panel: check-in, reschedule, and book-next actions. */
export function VisitDoctorScheduleActions({
  status,
  checkingIn,
  onCheckIn,
  onReschedule,
  onBookNext,
}: {
  status: string;
  checkingIn?: boolean;
  onCheckIn: () => void;
  onReschedule: () => void;
  onBookNext: () => void;
}) {
  const canPreVisit = status === "booked" || status === "checked_in" || status === "scheduled";

  if (status === "cancelled" || status === "no_show") {
    return <p className="text-center text-sm text-slate-500">No actions available</p>;
  }

  if (status === "completed") {
    return (
      <button
        type="button"
        onClick={onBookNext}
        className="w-full rounded-xl bg-[#16a349] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d]"
      >
        Book next visit
      </button>
    );
  }

  if (!canPreVisit) {
    return null;
  }

  return (
    <div className="space-y-2">
      {(status === "booked" || status === "scheduled") && (
        <button
          type="button"
          onClick={onCheckIn}
          disabled={checkingIn}
          className="w-full rounded-xl bg-[#16a349] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
        >
          {checkingIn ? "Completing check-in…" : "Check in"}
        </button>
      )}
      <button
        type="button"
        onClick={onReschedule}
        className="w-full rounded-xl border border-[#16a349]/30 bg-white px-4 py-3 text-sm font-semibold text-[#0d5c2e] hover:bg-emerald-50"
      >
        Reschedule
      </button>
    </div>
  );
}
