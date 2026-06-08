"use client";

import { HelpTip } from "@/components/help-tip";
import { formatAutoNoShowCountdown, type AutoNoShowCountdown } from "@/lib/auto-no-show";
import { appointmentBlocksDeskActions, effectiveAppointmentStatus } from "@/lib/visit-status-utils";

export type DeskAppointmentActions = {
  id: number;
  status: string;
  display_status?: string;
  invoice_kind?: string | null;
  /** Set when the system auto-marked no-show after the grace period (e.g. 60 min). */
  auto_no_show_processed_at?: string | null;
  auto_no_show_exempt?: boolean;
  auto_no_show_countdown?: AutoNoShowCountdown | null;
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
  invoiceTotalAmount?: string | null;
  amountPaid?: string | null;
  amountDue?: string | null;
  hintLoading: boolean;
  snapshotLoading: boolean;
  previewing: boolean;
  recordingCash?: boolean;
  terminalBusy?: boolean;
  terminalCheckoutId?: string | null;
  onPreview: () => void;
  onEditBilling?: () => void;
  onRecordCashPayment?: () => void;
  onTerminalCheckout?: () => void;
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
  onAutoNoShowExemptChange,
  onNoShow,
  onCancel,
  onMarkCompleted,
  onBookNext,
  onBookInOpenSlot,
  onBookAnotherInSlot,
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
  onAutoNoShowExemptChange?: (exempt: boolean) => void;
  onNoShow: () => void;
  onCancel: () => void;
  onMarkCompleted: () => void;
  onBookNext: () => void;
  /** Opens desk booking for this time block (no-show / cancelled slots on day or week schedule). */
  onBookInOpenSlot?: () => void;
  /** Admin: book a second patient in the same time slot as this visit. */
  onBookAnotherInSlot?: () => void;
}) {
  const uiStatus =
    appointment.display_status ??
    effectiveAppointmentStatus(appointment.status, appointment.invoice_kind);

  if (appointmentBlocksDeskActions(appointment.status, appointment.invoice_kind)) {
    const isNoShow = uiStatus === "no_show";
    const autoNoShow = Boolean(appointment.auto_no_show_processed_at);
    const hasNoShowFee = appointment.invoice_kind === "no_show_fee";
    const showNoShowBilling = isNoShow && hasNoShowFee && billing?.invoiceId != null;
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
              <p className="font-semibold">{autoNoShow ? "No-show (automatic)" : "Marked as no-show"}</p>
              <p className="mt-1 text-xs leading-relaxed text-red-900/90">
                {autoNoShow
                  ? "This visit was marked no-show automatically after the scheduled start time plus the clinic grace period (usually 60 minutes). "
                  : "The patient did not attend this visit. "}
                Check-in, extend period, reschedule, and the No-show button are not available.
                {hasNoShowFee ? " A no-show fee was applied — use billing below or Admin → Billing." : ""}
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">Visit cancelled</p>
              <p className="mt-1 text-xs leading-relaxed text-rose-900/90">
                This slot is cleared. Check-in and schedule changes are not available for this visit.
              </p>
            </>
          )}
        </div>
        {showNoShowBilling ? (
          <div className="rounded-xl border border-red-200/80 bg-red-50/50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-red-900">No-show fee</p>
            <p className="mt-1 text-xs text-red-950/90">
              {billing.invoiceTotalAmount
                ? billing.amountPaid && parseFloat(billing.amountPaid) > 0
                  ? `Invoice $${billing.invoiceTotalAmount} · Paid $${billing.amountPaid} · Still due $${billing.amountDue ?? billing.invoiceTotalAmount}. Tap Record cash for each cash payment.`
                  : `Amount due: $${billing.amountDue ?? billing.invoiceTotalAmount}. Tap Record cash when they pay with bills/coins, or Pay on Terminal for a card.`
                : "Collect or preview the no-show fee bill below."}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                disabled={billing.previewing || billing.invoiceId == null}
                onClick={billing.onPreview}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 sm:flex-1"
              >
                {billing.previewing ? "Opening…" : "Preview bill"}
              </button>
              {billing.onRecordCashPayment ? (
                <button
                  type="button"
                  disabled={billing.recordingCash || billing.invoiceId == null}
                  onClick={billing.onRecordCashPayment}
                  className="w-full rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 shadow-sm hover:bg-emerald-100 disabled:opacity-50 sm:flex-1"
                >
                  {billing.recordingCash ? "Recording…" : "Record cash payment"}
                </button>
              ) : null}
              {billing.onTerminalCheckout ? (
                <button
                  type="button"
                  disabled={billing.terminalBusy || billing.invoiceId == null}
                  onClick={billing.onTerminalCheckout}
                  className="w-full rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900 shadow-sm hover:bg-violet-100 disabled:opacity-50 sm:flex-1"
                >
                  {billing.terminalBusy ? "Sending to reader…" : "Pay on Terminal"}
                </button>
              ) : null}
              {billing.onEditBilling ? (
                <button
                  type="button"
                  onClick={billing.onEditBilling}
                  className="w-full rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-950 shadow-sm hover:bg-red-50 sm:flex-1"
                >
                  Edit billing
                </button>
              ) : null}
            </div>
            {billing.terminalCheckoutId ? (
              <p className="mt-2 text-[10px] leading-snug text-violet-900/90">
                Follow the prompts on the Square reader. This page will update when payment completes.
              </p>
            ) : null}
          </div>
        ) : null}
        {onBookInOpenSlot ? (
          <button
            type="button"
            onClick={onBookInOpenSlot}
            className="w-full rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-100"
          >
            Book visit in this open slot
          </button>
        ) : null}
        <button
          type="button"
          onClick={onBookNext}
          className="w-full rounded-xl bg-[#16a349] px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-900/15 transition hover:bg-[#13823d]"
        >
          Book next visit
        </button>
      </div>
    );
  }

  if (appointment.status === "completed") {
    return (
      <div className="space-y-3">
        {billing?.onEditBilling ? (
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Visit invoice</p>
            <p className="mt-1 text-xs text-slate-600">
              Correct services, diagnosis, or discounts on this completed visit.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {billing.onPreview ? (
                <button
                  type="button"
                  disabled={billing.previewing}
                  onClick={billing.onPreview}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 sm:flex-1"
                >
                  {billing.previewing ? "Opening…" : "View bill"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={billing.onEditBilling}
                className="w-full rounded-xl border border-[#16a349]/50 bg-[#16a349] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#13823d] sm:flex-1"
              >
                Edit billing
              </button>
            </div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onBookNext}
          className="w-full rounded-xl bg-[#16a349] px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-900/15 transition hover:bg-[#13823d]"
        >
          Book next visit
        </button>
      </div>
    );
  }

  const showCheckIn =
    uiStatus !== "checked_in" &&
    uiStatus !== "in_consultation" &&
    uiStatus !== "completed" &&
    uiStatus !== "no_show" &&
    uiStatus !== "cancelled";

  const autoNoShowNote = formatAutoNoShowCountdown(appointment.auto_no_show_countdown);
  const showAutoNoShowPanel =
    showCheckIn && Boolean(autoNoShowNote) && onAutoNoShowExemptChange;

  return (
    <>
      {showAutoNoShowPanel ? (
        <div className="space-y-2 rounded-xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Automatic no-show timer</p>
          <p className="text-xs leading-relaxed text-amber-900/95">{autoNoShowNote}</p>
          <label className="flex cursor-pointer items-start gap-2.5 pt-1">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-amber-300"
              checked={Boolean(appointment.auto_no_show_exempt)}
              disabled={savingDesk}
              onChange={(e) => onAutoNoShowExemptChange(e.target.checked)}
            />
            <span className="text-xs font-medium text-amber-950">
              Pause auto no-show for this visit only
            </span>
          </label>
          <p className="text-[10px] leading-snug text-amber-800/90">
            You can still check in, reschedule, cancel, or mark no-show manually below.
          </p>
        </div>
      ) : null}
      {appointment.status === "awaiting_payment" &&
      uiStatus !== "no_show" &&
      billing ? (
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
          {billing.invoiceId != null && billing.onRecordCashPayment ? (
            <div className="mt-3 border-t border-[#16a349]/15 pt-3">
              <button
                type="button"
                disabled={billing.recordingCash}
                onClick={billing.onRecordCashPayment}
                className="w-full rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-100 disabled:opacity-50"
              >
                {billing.recordingCash ? "Recording…" : "Record cash payment"}
              </button>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
                Use when the patient hands you cash — marks this invoice paid in the system.
              </p>
            </div>
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

      {canReschedule(uiStatus) && adjustDuration ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={adjustDuration.onToggle}
            disabled={savingDesk}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            {adjustDuration.open ? "Hide extend period" : "Extend period"}
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
                {savingDesk ? "Saving…" : "Save extension"}
              </button>
              <p className="text-[11px] text-slate-500">
                Add time to this visit when it runs longer than booked. The server checks that the extended time is not
                already taken before saving.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {canReschedule(uiStatus) ? (
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

      {canNoShowOrCancel(uiStatus) ? (
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

      {canMarkCompleted(uiStatus) ? (
        <button
          type="button"
          disabled={savingDesk}
          onClick={onMarkCompleted}
          className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950 hover:bg-emerald-100 disabled:opacity-50"
        >
          Mark completed
        </button>
      ) : null}

      {onBookAnotherInSlot ? (
        <button
          type="button"
          onClick={onBookAnotherInSlot}
          className="w-full rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-100"
        >
          Book another patient in this slot
        </button>
      ) : null}
    </>
  );
}
