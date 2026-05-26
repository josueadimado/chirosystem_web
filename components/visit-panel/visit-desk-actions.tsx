"use client";

import { HelpTip } from "@/components/help-tip";

export type DeskAppointmentActions = {
  id: number;
  status: string;
  service_type?: string;
  appointment_date: string;
  start_time: string;
};

export type DeskProviderOption = { id: number; provider_name: string };

type RescheduleState = {
  open: boolean;
  date: string;
  time: string;
  providerId: string;
  onToggle: () => void;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
  onProviderChange: (v: string) => void;
  onSave: () => void;
};

type AdjustDurationState = {
  open: boolean;
  startTimeDisplay: string;
  currentDurationMin: number;
  endTime: string;
  onToggle: () => void;
  onEndTimeChange: (v: string) => void;
  onAddMinutes: (delta: number) => void;
  onSave: () => void;
};

type BillingActionsState = {
  invoiceId: number | null;
  hintLoading: boolean;
  snapshotLoading: boolean;
  previewing: boolean;
  onPreview: () => void;
  onEditBilling: () => void;
};

/** Front-desk actions for an appointment side panel (admin schedule). */
export function VisitDeskActions({
  appointment,
  providers,
  checkingIn,
  savingDesk,
  waiveLateCancelFee,
  onWaiveLateCancelFeeChange,
  within24HoursBeforeStart,
  canReschedule,
  canNoShowOrCancel,
  canMarkCompleted,
  reschedule,
  adjustDuration,
  billing,
  onCheckIn,
  onNoShow,
  onCancel,
  onMarkCompleted,
  onBookNext,
}: {
  appointment: DeskAppointmentActions;
  providers: DeskProviderOption[];
  checkingIn: boolean;
  savingDesk: boolean;
  waiveLateCancelFee: boolean;
  onWaiveLateCancelFeeChange: (v: boolean) => void;
  within24HoursBeforeStart: (date: string, startTime: string) => boolean;
  canReschedule: (status: string) => boolean;
  canNoShowOrCancel: (status: string) => boolean;
  canMarkCompleted: (status: string) => boolean;
  reschedule: RescheduleState;
  adjustDuration?: AdjustDurationState;
  billing?: BillingActionsState;
  onCheckIn: () => void;
  onNoShow: () => void;
  onCancel: () => void;
  onMarkCompleted: () => void;
  onBookNext: () => void;
}) {
  if (appointment.status === "cancelled" || appointment.status === "no_show") {
    return <p className="text-center text-sm text-slate-500">No actions available</p>;
  }

  if (appointment.status === "completed") {
    return (
      <button
        type="button"
        onClick={onBookNext}
        className="w-full rounded-xl bg-[#16a349] px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-900/15 transition hover:bg-[#13823d]"
      >
        Book next visit
      </button>
    );
  }

  const showCheckIn =
    appointment.status !== "checked_in" &&
    appointment.status !== "in_consultation" &&
    appointment.status !== "completed" &&
    appointment.status !== "no_show" &&
    appointment.status !== "cancelled";

  return (
    <>
      {appointment.status === "awaiting_payment" && billing ? (
        <div className="rounded-xl border border-[#16a349]/30 bg-gradient-to-br from-[#ecfdf5] to-white p-4 shadow-sm ring-1 ring-[#16a349]/10">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#0d5c2e]">Billing</p>
          <p className="mt-1 text-xs text-slate-600">
            Preview the patient bill or adjust line items while this visit is awaiting payment.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {billing.invoiceId != null ? (
              <button
                type="button"
                disabled={billing.previewing}
                onClick={billing.onPreview}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 sm:w-auto sm:flex-1"
              >
                {billing.previewing ? "Opening…" : "Preview bill"}
              </button>
            ) : (
              <button
                type="button"
                disabled={billing.hintLoading || billing.snapshotLoading}
                className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-500 shadow-sm disabled:cursor-not-allowed sm:w-auto sm:flex-1"
              >
                {billing.hintLoading || billing.snapshotLoading ? "Loading…" : "Preview bill"}
              </button>
            )}
            <button
              type="button"
              onClick={billing.onEditBilling}
              className="w-full rounded-xl border border-[#16a349]/50 bg-[#16a349] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#13823d] sm:w-auto sm:flex-1"
            >
              Edit billing
            </button>
          </div>
          {billing.invoiceId == null && !billing.hintLoading && !billing.snapshotLoading ? (
            <p className="mt-2 text-[11px] text-slate-500">
              Preview needs an invoice. If the doctor hasn&apos;t finished the visit yet, complete it first or use{" "}
              <span className="font-medium text-slate-700">Invoices &amp; Billing</span> in the sidebar.
            </p>
          ) : null}
        </div>
      ) : null}

      {showCheckIn ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={onCheckIn}
            disabled={checkingIn}
            className="w-full rounded-xl bg-[#16a349] px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-900/15 transition hover:bg-[#13823d] disabled:opacity-50"
          >
            {checkingIn ? "Completing check-in…" : "Check in"}
          </button>
          <HelpTip label="Check-in" align="center">
            Records arrival for this appointment (same API as the kiosk). The assigned doctor may get an SMS if their alert number is
            set under Providers.
          </HelpTip>
        </div>
      ) : null}

      {canReschedule(appointment.status) && adjustDuration ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={adjustDuration.onToggle}
            disabled={savingDesk}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            {adjustDuration.open ? "Hide duration" : "Adjust duration"}
          </button>
          {adjustDuration.open ? (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
              <p className="text-xs text-slate-600">
                Start stays at <span className="font-semibold text-slate-800">{adjustDuration.startTimeDisplay}</span>.
                Current block:{" "}
                <span className="font-semibold text-slate-800">{adjustDuration.currentDurationMin} min</span>.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={savingDesk || adjustDuration.currentDurationMin <= 15}
                  onClick={() => adjustDuration.onAddMinutes(-15)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  −15 min
                </button>
                <button
                  type="button"
                  disabled={savingDesk}
                  onClick={() => adjustDuration.onAddMinutes(15)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  +15 min
                </button>
                <button
                  type="button"
                  disabled={savingDesk}
                  onClick={() => adjustDuration.onAddMinutes(30)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  +30 min
                </button>
              </div>
              <label className="block text-xs font-semibold text-slate-600">
                End time
                <input
                  type="time"
                  value={adjustDuration.endTime}
                  onChange={(e) => adjustDuration.onEndTimeChange(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={savingDesk || !adjustDuration.endTime}
                onClick={adjustDuration.onSave}
                className="w-full rounded-xl bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
              >
                {savingDesk ? "Saving…" : "Save duration"}
              </button>
              <p className="text-[11px] text-slate-500">
                Use this when a visit needs more or less time than the booked service length. The calendar block updates;
                the server blocks double-booking and provider time-off.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {canReschedule(appointment.status) ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={reschedule.onToggle}
            disabled={savingDesk}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            {reschedule.open ? "Hide reschedule" : "Reschedule"}
          </button>
          {reschedule.open ? (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
              <label className="block text-xs font-semibold text-slate-600">
                Date
                <input
                  type="date"
                  value={reschedule.date}
                  onChange={(e) => reschedule.onDateChange(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Start time
                <input
                  type="time"
                  value={reschedule.time}
                  onChange={(e) => reschedule.onTimeChange(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Provider
                <select
                  value={reschedule.providerId}
                  onChange={(e) => reschedule.onProviderChange(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.provider_name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={savingDesk || !reschedule.date}
                onClick={reschedule.onSave}
                className="w-full rounded-xl bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
              >
                {savingDesk ? "Saving…" : "Save new time"}
              </button>
              <p className="text-[11px] text-slate-500">
                End time is recalculated from the booked service length. The server blocks double-booking for that doctor.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {canNoShowOrCancel(appointment.status) ? (
        <div className="space-y-2">
          {appointment.service_type === "massage" &&
            within24HoursBeforeStart(appointment.appointment_date, appointment.start_time) && (
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
                <input
                  type="checkbox"
                  checked={waiveLateCancelFee}
                  onChange={(e) => onWaiveLateCancelFeeChange(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <strong>Waive late-cancellation fee</strong> — check only if the patient called and you moved them to another same-day
                  slot (under 24h policy).
                </span>
              </label>
            )}
          <button
            type="button"
            disabled={savingDesk}
            onClick={onNoShow}
            className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
          >
            No-show
          </button>
          <button
            type="button"
            disabled={savingDesk}
            onClick={onCancel}
            className="w-full rounded-xl border-2 border-rose-300 bg-white px-4 py-3 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50"
          >
            Cancel visit
          </button>
        </div>
      ) : null}

      {canMarkCompleted(appointment.status) ? (
        <button
          type="button"
          disabled={savingDesk}
          onClick={onMarkCompleted}
          className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950 hover:bg-emerald-100 disabled:opacity-50"
        >
          Mark completed
        </button>
      ) : null}
    </>
  );
}
