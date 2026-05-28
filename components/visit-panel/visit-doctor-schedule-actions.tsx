"use client";

import { appointmentBlocksDeskActions, effectiveAppointmentStatus } from "@/lib/visit-status-utils";

/** Doctor schedule side panel: check-in, reschedule, cancel, no-show, and book-next. */
export function VisitDoctorScheduleActions({
  status,
  displayStatus,
  invoiceKind,
  checkingIn,
  saving,
  serviceType,
  appointmentDate,
  startTime,
  onCheckIn,
  onReschedule,
  onBookNext,
  onNoShow,
  onCancel,
}: {
  status: string;
  displayStatus?: string;
  invoiceKind?: string | null;
  checkingIn?: boolean;
  saving?: boolean;
  serviceType?: string;
  appointmentDate?: string;
  startTime?: string;
  onCheckIn: () => void;
  onReschedule: () => void;
  onBookNext: () => void;
  onNoShow?: () => void;
  onCancel?: () => void;
}) {
  const uiStatus = displayStatus ?? effectiveAppointmentStatus(status, invoiceKind);
  const canPreVisit = uiStatus === "booked" || uiStatus === "checked_in" || uiStatus === "scheduled";
  const busy = checkingIn || saving;

  if (appointmentBlocksDeskActions(status, invoiceKind)) {
    const isNoShow = uiStatus === "no_show";
    return (
      <div className="space-y-3">
        <div
          className={
            isNoShow
              ? "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-950"
              : "rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm text-rose-950"
          }
        >
          {isNoShow ? (
            <>
              <p className="font-semibold">No-show</p>
              <p className="mt-1 text-xs leading-relaxed text-red-900/90">
                The patient did not attend. Check-in and reschedule are not available for this visit.
              </p>
            </>
          ) : (
            <p className="font-semibold">This visit was cancelled.</p>
          )}
        </div>
        <button
          type="button"
          onClick={onBookNext}
          className="w-full rounded-xl bg-[#16a349] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d]"
        >
          Book next visit
        </button>
      </div>
    );
  }

  if (uiStatus === "completed") {
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
      {(uiStatus === "booked" || uiStatus === "scheduled") && (
        <button
          type="button"
          onClick={onCheckIn}
          disabled={busy}
          className="w-full rounded-xl bg-[#16a349] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
        >
          {checkingIn ? "Completing check-in…" : "Check in"}
        </button>
      )}
      <button
        type="button"
        onClick={onReschedule}
        disabled={busy}
        className="w-full rounded-xl border border-[#16a349]/30 bg-white px-4 py-3 text-sm font-semibold text-[#0d5c2e] hover:bg-emerald-50 disabled:opacity-50"
      >
        Reschedule
      </button>
      {onNoShow ? (
        <button
          type="button"
          disabled={busy}
          onClick={onNoShow}
          className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
        >
          No-show
        </button>
      ) : null}
      {onCancel ? (
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="w-full rounded-xl border-2 border-rose-300 bg-white px-4 py-3 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50"
        >
          Cancel visit
        </button>
      ) : null}
      {serviceType === "massage" && appointmentDate && startTime ? (
        <p className="text-[11px] leading-snug text-slate-500">
          Massages cancelled under 24 hours before start may bill the full service fee unless the front desk waives it.
        </p>
      ) : null}
    </div>
  );
}
