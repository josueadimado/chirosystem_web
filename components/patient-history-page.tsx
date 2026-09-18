"use client";

import Link from "next/link";
import { useAppFeedback } from "@/components/app-feedback";
import { Loader } from "@/components/loader";
import { PatientBillPortalModal } from "@/components/patient-bill-portal-modal";
import { useRecordCashPayment } from "@/components/record-cash-payment-modal";
import { usePatientBillEmail } from "@/hooks/use-patient-bill-email";
import {
  formatPatientBillEmailSentMessage,
  isPatientBillEmailSuccessMessage,
} from "@/lib/patient-bill-email";
import { PatientNameWithProfile, patientFullName } from "@/components/patient-payment-profile";
import { AppointmentStatusBadge } from "@/components/status-chip";
import { ApiError, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import { VisitDiagnosisDisplay } from "@/components/visit-diagnosis-display";
import { cn } from "@/lib/utils";
import { clinicTodayIso } from "@/lib/format-date";
import type { PatientBillPayload } from "@/lib/patient-bill-print";
import { parseMoneyAmount } from "@/lib/record-cash-prompt";
import { ChartNoteReaderPanel, ChartNoteWorkspace } from "@/components/chart-note-document";
import { formatMonthDayYear, formatWeekdayMonthDayYear } from "@/lib/format-date";
import {
  ArrowLeft,
  CreditCard,
  Download,
  FileText,
  Mail,
  Printer,
  Receipt,
  Search,
  Trash2,
  Zap,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

const AdminVisitBillingModal = dynamic(
  () =>
    import("@/components/admin-visit-billing-modal").then((m) => ({
      default: m.AdminVisitBillingModal,
    })),
  { ssr: false },
);

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm transition focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15";

type VisitHistoryLine = {
  service_name: string;
  billing_code: string;
  quantity: number;
  unit_price: string;
  line_total: string;
  charges_patient?: boolean;
};

type VisitHistory = {
  id: number;
  status: string;
  reason_for_visit: string;
  doctor_notes: string;
  diagnosis: string;
  diagnoses?: Array<{ id?: number | null; code: string; description: string }>;
  completed_at: string | null;
  rendered_services: VisitHistoryLine[];
};

type AppointmentHistoryRow = {
  id: number;
  appointment_date: string;
  start_time: string;
  end_time: string;
  service: string | null;
  booked_service_id?: number | null;
  provider: string | null;
  status: string;
  clinical_handoff_notes: string;
  can_edit_handoff_notes: boolean;
  visit: VisitHistory | null;
  invoice: {
    id: number;
    invoice_number: string;
    kind?: string;
    subtotal: string;
    discount: string;
    credit_applied_total: string;
    professional_discount_reason: string;
    total_amount: string;
    status: string;
    bill_charges_total?: string;
    patient_charge_total?: string;
    insurance_remaining_total?: string;
    payments_received_total?: string;
    remaining_client_responsibility_total?: string;
  } | null;
};

type PatientAccountSummary = {
  balance_total: string;
  balance_visit: string;
  balance_no_show_fee: string;
  balance_late_cancel_fee: string;
  has_overdue: boolean;
  visit_count: number;
  no_show_count: number;
  upcoming_count: number;
  cancelled_count: number;
  next_appointment_date: string | null;
  next_appointment_time: string | null;
};

type PatientDetail = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  clinical_access?: "full" | "read_only";
  clinical_access_message?: string;
  payment_profile?: string;
  iris_tag?: boolean;
  card_brand?: string;
  card_last4?: string;
  has_saved_card?: boolean;
  has_chargeable_saved_card?: boolean;
  card_display_only?: boolean;
  saved_cards?: Array<{
    id: number;
    card_brand: string;
    card_last4: string;
    is_default: boolean;
  }>;
  default_saved_card_id?: number;
  account_summary?: PatientAccountSummary;
  appointments: AppointmentHistoryRow[];
};

function formatMoney(amount: string): string {
  const n = parseFloat(amount);
  if (!Number.isFinite(n)) return amount;
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function invoiceKindLabel(kind: string | undefined): string {
  switch (kind) {
    case "no_show_fee":
      return "No-show fee";
    case "late_cancel_fee":
      return "Late cancel";
    case "visit":
      return "Visit";
    default:
      return "Bill";
  }
}

function PatientAccountSummaryCard({
  summary,
  billingHref,
}: {
  summary: PatientAccountSummary;
  billingHref?: string;
  patientName: string;
}) {
  const totalDue = parseFloat(summary.balance_total) || 0;
  const visitDue = parseFloat(summary.balance_visit) || 0;
  const nsDue = parseFloat(summary.balance_no_show_fee) || 0;
  const lcDue = parseFloat(summary.balance_late_cancel_fee) || 0;
  const hasBalance = totalDue > 0.009;

  return (
    <section
      className="grid grid-cols-1 gap-6 border-t border-[#e8e8e8] bg-[#ecfdf5] px-4 py-4 sm:grid-cols-3 sm:px-6"
      aria-label="Account summary"
    >
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-[#949494]">BALANCE DUE</p>
          {billingHref ? (
            <Link
              href={billingHref}
              className="text-xs font-semibold text-[#16a349] hover:underline"
            >
              All invoices →
            </Link>
          ) : null}
        </div>
        <p
          className={cn(
            "text-xl font-bold tabular-nums tracking-tight",
            hasBalance ? "text-[#ef4444]" : "text-[#16a349]",
          )}
        >
          {hasBalance ? formatMoney(summary.balance_total) : "No balance"}
        </p>
        {hasBalance ? (
          <div className="space-y-0.5 text-xs text-[#949494]">
            {visitDue > 0.009 ? <div>Visit bills: {formatMoney(summary.balance_visit)}</div> : null}
            {nsDue > 0.009 ? <div>No-show fees: {formatMoney(summary.balance_no_show_fee)}</div> : null}
            {lcDue > 0.009 ? <div>Late cancel fee: {formatMoney(summary.balance_late_cancel_fee)}</div> : null}
            {summary.has_overdue ? <div className="font-semibold text-amber-700">Overdue</div> : null}
          </div>
        ) : null}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-semibold text-[#949494]">VISITS</p>
        <p className="text-xl font-bold tabular-nums text-[#0d5c2e]">{summary.visit_count}</p>
        <p className="text-xs text-[#949494]">
          {summary.no_show_count} no-show · {summary.cancelled_count} cancelled
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-semibold text-[#949494]">UPCOMING</p>
        <p className="text-xl font-bold tabular-nums text-[#0d5c2e]">{summary.upcoming_count}</p>
        {summary.upcoming_count > 0 && summary.next_appointment_date ? (
          <p className="text-xs text-[#949494]">
            {formatWeekdayMonthDayYear(summary.next_appointment_date)}
            {summary.next_appointment_time ? ` at ${summary.next_appointment_time}` : ""}
          </p>
        ) : (
          <p className="text-xs text-[#949494]">No upcoming appointments</p>
        )}
      </div>
    </section>
  );
}

function isVisitToday(appointmentDate: string): boolean {
  return appointmentDate === clinicTodayIso();
}

function visitHasBill(a: AppointmentHistoryRow): boolean {
  return Boolean(a.invoice?.id);
}

function invoiceAmountDue(inv: NonNullable<AppointmentHistoryRow["invoice"]>): number {
  const raw = inv.remaining_client_responsibility_total ?? inv.total_amount;
  return parseMoneyAmount(raw);
}

function invoiceIsUnpaid(inv: AppointmentHistoryRow["invoice"]): inv is NonNullable<AppointmentHistoryRow["invoice"]> {
  return Boolean(inv && inv.status !== "paid" && invoiceAmountDue(inv) > 0.009);
}

/** Normal visit invoice on completed or awaiting-payment appointment. */
function canEditVisitInvoice(a: AppointmentHistoryRow): boolean {
  const inv = a.invoice;
  if (!inv || inv.status === "void") return false;
  if (inv.kind === "no_show_fee" || inv.kind === "late_cancel_fee") return false;
  if (inv.kind && inv.kind !== "visit") return false;
  if (!a.visit) return false;
  return a.status === "awaiting_payment" || a.status === "completed";
}

/** Admin may remove completed / no-show / cancelled rows without paid billing. */
function canRemoveFromPatientChart(a: AppointmentHistoryRow): boolean {
  if (!["completed", "no_show", "cancelled"].includes(a.status)) return false;
  const inv = a.invoice;
  if (!inv) return true;
  if (inv.status === "paid") return false;
  const paid = parseMoneyAmount(inv.payments_received_total ?? "0");
  return paid <= 0.009;
}

function removeFromChartBlockedReason(a: AppointmentHistoryRow): string | null {
  if (canRemoveFromPatientChart(a)) return null;
  if (!["completed", "no_show", "cancelled"].includes(a.status)) {
    return "Only completed, no-show, or cancelled visits can be removed.";
  }
  if (a.invoice?.status === "paid" || parseMoneyAmount(a.invoice?.payments_received_total ?? "0") > 0.009) {
    return "This visit has a paid invoice or recorded payments and cannot be removed.";
  }
  return "This visit cannot be removed from the chart.";
}

function VisitBillPanel({
  appointment,
  patientName,
  onPrint,
  onEmail,
  onSyncPayment,
  onConfirmPaid,
  onRecordCashPayment,
  onChargeSavedCard,
  onEditBilling,
  hasChargeableSavedCard,
  cardLast4,
  cardDisplayOnly,
  savedCards,
  chargeSavedCardId,
  onChargeSavedCardIdChange,
  printing,
  emailing,
  emailSentTo,
  syncing,
  confirming,
  recordingCash,
  chargingSavedCard,
}: {
  appointment: AppointmentHistoryRow;
  patientName: string;
  onPrint: (invoiceId: number, invoiceStatus: string) => void;
  onEmail?: (invoiceId: number) => void;
  onSyncPayment?: (invoiceId: number) => void;
  onConfirmPaid?: (invoiceId: number, invoiceNumber: string) => void;
  onRecordCashPayment?: () => void;
  onChargeSavedCard?: () => void;
  onEditBilling?: () => void;
  hasChargeableSavedCard?: boolean;
  cardLast4?: string;
  cardBrand?: string;
  cardDisplayOnly?: boolean;
  savedCards?: Array<{ id: number; card_brand: string; card_last4: string; is_default: boolean }>;
  chargeSavedCardId?: number | null;
  onChargeSavedCardIdChange?: (id: number) => void;
  printing: boolean;
  emailing?: boolean;
  emailSentTo?: string | null;
  syncing?: boolean;
  confirming?: boolean;
  recordingCash?: boolean;
  chargingSavedCard?: boolean;
}) {
  const inv = appointment.invoice;
  const lines = appointment.visit?.rendered_services ?? [];
  const unpaid = invoiceIsUnpaid(inv);
  const isPenaltyBill = inv?.kind === "no_show_fee" || inv?.kind === "late_cancel_fee";
  const awaiting =
    unpaid &&
    (appointment.status === "awaiting_payment" ||
      appointment.status === "no_show" ||
      isPenaltyBill);

  if (!inv) {
    return (
      <div className="rounded-lg border border-dashed border-[#e8e8e8] bg-[#f5f5f5]/60 p-5 text-center">
        <p className="text-sm font-semibold text-slate-700">No patient bill yet</p>
        <p className="mt-1 text-xs text-[#949494]">
          A printable bill appears here after the visit is completed and billing is saved.
        </p>
      </div>
    );
  }

  const remaining =
    inv.remaining_client_responsibility_total ??
    Math.max(
      0,
      parseFloat(inv.patient_charge_total ?? inv.total_amount) -
        parseFloat(inv.payments_received_total ?? "0"),
    ).toFixed(2);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#949494]">
            INVOICE {inv.invoice_number}
          </p>
          <p className="text-xs text-[#949494]">{invoiceKindLabel(inv.kind)}</p>
          {isPenaltyBill && unpaid ? (
            <p className="mt-1 text-xs text-red-800">
              {patientName} missed or cancelled this visit — collect the fee below when they pay.
            </p>
          ) : null}
        </div>
        {inv.status === "paid" ? (
          <span className="inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
            Paid
          </span>
        ) : (
          <span className="inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-[#ef4444]">
            Unpaid
          </span>
        )}
      </div>

      {lines.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[280px] text-xs">
            <thead>
              <tr className="border-b border-[#e8e8e8]">
                <th className="py-2 text-left font-semibold text-[#949494]">Service</th>
                <th className="py-2 text-left font-semibold text-[#949494]">Code</th>
                <th className="py-2 text-center font-semibold text-[#949494]">Qty</th>
                <th className="py-2 text-right font-semibold text-[#949494]">Price</th>
                <th className="py-2 text-right font-semibold text-[#949494]">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="border-b border-[#e8e8e8] last:border-b-0">
                  <td className="py-2 text-foreground">
                    {line.service_name}
                    {line.charges_patient === false ? (
                      <span className="ml-1 text-[10px] text-[#949494]">(insurance)</span>
                    ) : null}
                  </td>
                  <td className="py-2 text-[#949494]">{line.billing_code || "—"}</td>
                  <td className="py-2 text-center">{line.quantity}</td>
                  <td className="py-2 text-right">${line.unit_price}</td>
                  <td className="py-2 text-right font-medium">${line.line_total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-[#949494]">No line items on file for this visit.</p>
      )}

      <div className="space-y-2 rounded-lg border border-[#d1e8d8] bg-[#ecfdf5] p-4">
        {inv.bill_charges_total ? (
          <div className="flex justify-between gap-4 text-sm">
            <span>Total documented</span>
            <span>${inv.bill_charges_total}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 text-sm">
          <span>Subtotal</span>
          <span>${inv.subtotal}</span>
        </div>
        {inv.discount !== "0.00" ? (
          <div className="flex justify-between gap-4 text-sm">
            <span>Discount</span>
            <span>-${inv.discount}</span>
          </div>
        ) : null}
        {inv.credit_applied_total !== "0.00" ? (
          <div className="flex justify-between gap-4 text-sm">
            <span>Credit</span>
            <span>-${inv.credit_applied_total}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 border-t border-[#a7d4b8] pt-2 text-sm font-semibold text-[#0d5c2e]">
          <span>Total</span>
          <span>${inv.patient_charge_total ?? inv.total_amount}</span>
        </div>
        {inv.insurance_remaining_total && parseFloat(inv.insurance_remaining_total) > 0 ? (
          <div className="flex justify-between gap-4 text-xs text-[#949494]">
            <span>Insurance remaining</span>
            <span>${inv.insurance_remaining_total}</span>
          </div>
        ) : null}
        <div className="space-y-1 border-t border-[#a7d4b8] pt-2">
          <div className="flex justify-between gap-4 text-xs text-[#949494]">
            <span>Amount received</span>
            <span>${inv.payments_received_total ?? "0.00"}</span>
          </div>
          <div className="flex justify-between gap-4 text-sm font-semibold">
            <span className="text-[#0d5c2e]">Remaining due</span>
            <span className={unpaid ? "text-[#ef4444]" : "text-[#16a349]"}>${remaining}</span>
          </div>
        </div>
      </div>

      {onEditBilling && inv.status === "paid" && !isPenaltyBill ? (
        <p className="text-xs text-[#949494]">
          Paid already? Use <strong>Edit billing</strong> to fix lines or discounts — if the new total is higher than
          payments received, the visit reopens for collection.
        </p>
      ) : null}

      {unpaid && cardDisplayOnly ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          Card digits are on file but cannot be charged — open the patient chart, save the card again, then use{" "}
          <strong>Charge card</strong>.
        </p>
      ) : null}

      {unpaid && onChargeSavedCard && hasChargeableSavedCard && !cardDisplayOnly && savedCards && savedCards.length > 1 && onChargeSavedCardIdChange ? (
        <select
          className="w-full rounded-lg border border-[#e8e8e8] bg-[#f8f8f7] px-3 py-2 text-sm"
          value={chargeSavedCardId ?? savedCards.find((c) => c.is_default)?.id ?? savedCards[0]?.id ?? ""}
          onChange={(e) => onChargeSavedCardIdChange(Number(e.target.value))}
          aria-label="Card to charge"
        >
          {savedCards.map((c) => (
            <option key={c.id} value={c.id}>
              {(c.card_brand || "Card").toUpperCase()} •••• {c.card_last4}
              {c.is_default ? " (default)" : ""}
            </option>
          ))}
        </select>
      ) : null}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          disabled={printing}
          onClick={() => onPrint(inv.id, inv.status)}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#e8e8e8] bg-white px-3 py-2.5 text-xs font-medium text-slate-800 hover:bg-[#f5f5f5] disabled:opacity-60"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          {printing ? "Opening…" : "View / Print"}
        </button>
        {onEmail ? (
          <button
            type="button"
            disabled={emailing}
            onClick={() => onEmail(inv.id)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#e8e8e8] bg-white px-3 py-2.5 text-xs font-medium text-slate-800 hover:bg-[#f5f5f5] disabled:opacity-60"
          >
            <Mail className="h-3.5 w-3.5" aria-hidden />
            {emailing ? "Sending…" : emailSentTo ? `Sent to ${emailSentTo}` : "Email bill"}
          </button>
        ) : (
          <span className="hidden sm:block" />
        )}
        {unpaid && onRecordCashPayment ? (
          <button
            type="button"
            disabled={recordingCash}
            onClick={onRecordCashPayment}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#e8e8e8] bg-white px-3 py-2.5 text-xs font-medium text-slate-800 hover:bg-[#f5f5f5] disabled:opacity-60"
          >
            <CreditCard className="h-3.5 w-3.5" aria-hidden />
            {recordingCash ? "Recording…" : "Record cash"}
          </button>
        ) : null}
        {unpaid && onChargeSavedCard && hasChargeableSavedCard && !cardDisplayOnly ? (
          <button
            type="button"
            disabled={chargingSavedCard}
            onClick={onChargeSavedCard}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#e9982f] px-3 py-2.5 text-xs font-medium text-white hover:bg-[#d48928] disabled:opacity-60"
          >
            <Zap className="h-3.5 w-3.5" aria-hidden />
            {chargingSavedCard
              ? "Charging…"
              : `Charge card${cardLast4 ? ` ···· ${cardLast4}` : ""}`}
          </button>
        ) : null}
        {awaiting && onSyncPayment ? (
          <button
            type="button"
            disabled={syncing}
            onClick={() => onSyncPayment(inv.id)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#e8e8e8] bg-white px-3 py-2.5 text-xs font-medium text-slate-800 hover:bg-[#f5f5f5] disabled:opacity-60"
          >
            {syncing ? "Checking Square…" : "Check Square"}
          </button>
        ) : null}
        {awaiting && onConfirmPaid ? (
          <button
            type="button"
            disabled={confirming}
            onClick={() => {
              if (
                window.confirm(
                  `Mark ${inv.invoice_number} as paid?\n\nOnly use this if you already see the payment in the Square app.`,
                )
              ) {
                onConfirmPaid(inv.id, inv.invoice_number);
              }
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-60"
          >
            {confirming ? "Updating…" : "Mark paid"}
          </button>
        ) : null}
        {onEditBilling ? (
          <button
            type="button"
            onClick={onEditBilling}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#16a349]/40 bg-[#ecfdf5] px-3 py-2.5 text-xs font-medium text-[#0d5c2e] hover:bg-[#d1fae5]"
          >
            Edit billing
          </button>
        ) : null}
      </div>
    </div>
  );
}

function VisitListRow({
  appointment: a,
  selected,
  onSelect,
}: {
  appointment: AppointmentHistoryRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const inv = a.invoice;
  const unpaid = invoiceIsUnpaid(inv);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-lg border px-3 py-2.5 text-left transition",
        selected
          ? "border-[#16a349] bg-[#ecfdf5]"
          : "border-[#e8e8e8] bg-white hover:border-[#949494]/50",
      )}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-[#949494]">{formatMonthDayYear(a.appointment_date)}</div>
          <div className="text-xs tabular-nums text-[#949494]">
            {a.start_time}
            {a.end_time ? `–${a.end_time}` : ""}
          </div>
        </div>
        {unpaid ? (
          <span
            className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[#ef4444]"
            title="Unpaid"
            aria-label="Unpaid bill"
          />
        ) : null}
      </div>
      <div className="mb-1.5 truncate text-xs text-slate-900">{a.service || "Visit"}</div>
      <div className="flex items-center justify-between gap-2">
        <AppointmentStatusBadge status={a.status} size="xs" />
        {inv ? (
          <span className="shrink-0 text-xs tabular-nums text-[#949494]">${inv.total_amount}</span>
        ) : null}
      </div>
    </button>
  );
}

function VisitRecordCard({
  appointment,
  patientName,
  handoffValue,
  onHandoffChange,
  savingHandoff,
  onSaveHandoff,
  scheduleHrefPrefix,
  onPrintBill,
  onEmailBill,
  onSyncPayment,
  onConfirmPaid,
  onRecordCashPayment,
  onChargeSavedCard,
  onEditBilling,
  onRemoveFromChart,
  removingFromChart,
  hasChargeableSavedCard,
  cardLast4,
  cardBrand,
  cardDisplayOnly,
  savedCards,
  chargeSavedCardId,
  onChargeSavedCardIdChange,
  printingBill,
  emailingBill,
  emailSentTo,
  syncingBill,
  confirmingBill,
  recordingCash,
  chargingSavedCard,
}: {
  appointment: AppointmentHistoryRow;
  patientName: string;
  handoffValue: string;
  onHandoffChange: (v: string) => void;
  savingHandoff: boolean;
  onSaveHandoff: () => void;
  scheduleHrefPrefix: string;
  onPrintBill: (invoiceId: number, invoiceStatus: string) => void;
  onEmailBill?: (invoiceId: number) => void;
  onSyncPayment?: (invoiceId: number) => void;
  onConfirmPaid?: (invoiceId: number, invoiceNumber: string) => void;
  onRecordCashPayment?: () => void;
  onChargeSavedCard?: () => void;
  onEditBilling?: () => void;
  onRemoveFromChart?: () => void;
  removingFromChart?: boolean;
  hasChargeableSavedCard?: boolean;
  cardLast4?: string;
  cardBrand?: string;
  cardDisplayOnly?: boolean;
  savedCards?: Array<{ id: number; card_brand: string; card_last4: string; is_default: boolean }>;
  chargeSavedCardId?: number | null;
  onChargeSavedCardIdChange?: (id: number) => void;
  printingBill: boolean;
  emailingBill?: boolean;
  emailSentTo?: string | null;
  syncingBill?: boolean;
  confirmingBill?: boolean;
  recordingCash?: boolean;
  chargingSavedCard?: boolean;
}) {
  const a = appointment;
  const dateLabel = formatWeekdayMonthDayYear(a.appointment_date);
  const shortDate = formatMonthDayYear(a.appointment_date);
  const [panel, setPanel] = useState<"chart" | "bill">(visitHasBill(a) ? "bill" : "chart");

  return (
    <article className="bg-white">
      <header className="sticky top-0 z-10 mb-2 border-b border-[#e8e8e8] bg-white pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-[#0d5c2e]">{shortDate}</h2>
            <span className="text-sm text-[#949494]">·</span>
            <span className="text-sm tabular-nums text-[#949494]">
              {a.start_time}
              {a.end_time ? `–${a.end_time}` : ""}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isVisitToday(a.appointment_date) ? (
              <Link
                href={`${scheduleHrefPrefix}?appointment=${a.id}`}
                className="rounded-lg border border-[#e8e8e8] bg-white px-2.5 py-1.5 text-xs font-medium text-[#0d5c2e] hover:bg-[#f5f5f5]"
              >
                Today&apos;s schedule
              </Link>
            ) : null}
            {onRemoveFromChart ? (
              <button
                type="button"
                disabled={removingFromChart}
                onClick={onRemoveFromChart}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                {removingFromChart ? "Removing…" : "Remove"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={printingBill || !a.invoice}
              onClick={() => {
                if (a.invoice) onPrintBill(a.invoice.id, a.invoice.status);
              }}
              className="rounded-lg border border-[#e8e8e8] bg-white p-1.5 hover:bg-[#f5f5f5] disabled:opacity-40"
              title="Print bill"
              aria-label="Print bill"
            >
              <Printer className="h-3.5 w-3.5 text-[#949494]" aria-hidden />
            </button>
          </div>
        </div>
        <div className="mt-3 flex gap-1 rounded-lg border border-[#e8e8e8] bg-[#f5f5f5] p-1 lg:hidden">
          <button
            type="button"
            onClick={() => setPanel("chart")}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition",
              panel === "chart" ? "bg-[#16a349] text-white" : "text-[#949494] hover:bg-white",
            )}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            Chart
          </button>
          <button
            type="button"
            onClick={() => setPanel("bill")}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition",
              panel === "bill" ? "bg-[#16a349] text-white" : "text-[#949494] hover:bg-white",
            )}
          >
            <Receipt className="h-3.5 w-3.5" aria-hidden />
            Bill
          </button>
        </div>
      </header>

      <div className="max-w-4xl space-y-6 p-1 sm:p-2">
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-[#d1e8d8] bg-[#ecfdf5] p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold text-[#949494]">PROVIDER</p>
            <p className="mt-1 text-sm font-medium text-[#0d5c2e]">{a.provider || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-[#949494]">SERVICE</p>
            <p className="mt-1 text-sm font-medium text-[#0d5c2e]">{a.service || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-[#949494]">STATUS</p>
            <div className="mt-1">
              <AppointmentStatusBadge status={a.status} size="sm" />
            </div>
          </div>
        </div>

        <section className={cn("space-y-6", panel === "bill" ? "hidden lg:block" : "")}>
          {a.visit?.reason_for_visit?.trim() ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#949494]">REASON FOR VISIT</p>
              <p className="rounded-lg border border-[#e8e8e8] bg-white p-3 text-sm text-slate-800">
                {a.visit.reason_for_visit}
              </p>
            </div>
          ) : null}

          <div className="space-y-3 border-t border-[#e8e8e8] pt-6">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#949494]">HANDOFF &amp; REMINDERS</p>
            </div>
            <p className="text-xs text-[#949494]">
              Saved on this appointment for the next visit — not the same as consultation SOAP notes below.
            </p>
            <ChartNoteWorkspace
              value={handoffValue}
              onChange={onHandoffChange}
              editable={a.can_edit_handoff_notes}
              saving={savingHandoff}
              onSave={onSaveHandoff}
              meta={{
                dateLabel: `${dateLabel} at ${a.start_time}`,
                provider: a.provider ?? undefined,
                service: a.service ?? undefined,
              }}
              lineItems={a.visit?.rendered_services}
              inputClassName={inputClass}
            />
          </div>

          {a.visit ? (
            <>
              {a.visit.diagnosis?.trim() || (a.visit.diagnoses?.length ?? 0) > 0 ? (
                <div className="space-y-3 border-t border-[#e8e8e8] pt-6">
                  <p className="text-xs font-semibold text-[#949494]">DIAGNOSIS</p>
                  <VisitDiagnosisDisplay diagnosis={a.visit.diagnosis} diagnoses={a.visit.diagnoses} />
                </div>
              ) : null}

              {a.visit.doctor_notes?.trim() ? (
                <div className="space-y-3 border-t border-[#e8e8e8] pt-6">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-[#949494]">CHART NOTES</p>
                  </div>
                  <div className="min-h-28 rounded-lg border border-[#e8e8e8] bg-white p-4">
                    {/* Includes “Open wide view” for a larger readable popup */}
                    <ChartNoteReaderPanel
                      text={a.visit.doctor_notes}
                      title="Chart notes"
                      meta={{
                        dateLabel: `${dateLabel} at ${a.start_time}`,
                        provider: a.provider ?? undefined,
                        service: a.service ?? undefined,
                      }}
                    />
                  </div>
                  {a.visit.completed_at ? (
                    <p className="text-xs text-[#949494]">
                      Visit completed {formatMonthDayYear(a.visit.completed_at.slice(0, 10))}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-[#e8e8e8] bg-[#f5f5f5] px-4 py-3 text-sm text-[#949494]">
              This appointment has not been completed as a clinical visit yet.
            </p>
          )}
        </section>

        <section className={cn("space-y-3 border-t border-[#e8e8e8] pt-6", panel === "chart" ? "hidden lg:block" : "")}>
          <p className="text-xs font-semibold text-[#949494]">SERVICES &amp; BILLING</p>
          <VisitBillPanel
            appointment={a}
            patientName={patientName}
            onPrint={onPrintBill}
            onEmail={onEmailBill}
            onSyncPayment={onSyncPayment}
            onConfirmPaid={onConfirmPaid}
            onRecordCashPayment={onRecordCashPayment}
            onChargeSavedCard={onChargeSavedCard}
            onEditBilling={onEditBilling}
            hasChargeableSavedCard={hasChargeableSavedCard}
            cardLast4={cardLast4}
            cardBrand={cardBrand}
            cardDisplayOnly={cardDisplayOnly}
            savedCards={savedCards}
            chargeSavedCardId={chargeSavedCardId}
            onChargeSavedCardIdChange={onChargeSavedCardIdChange}
            printing={printingBill}
            emailing={emailingBill}
            emailSentTo={emailSentTo}
            syncing={syncingBill}
            confirming={confirmingBill}
            recordingCash={recordingCash}
            chargingSavedCard={chargingSavedCard}
          />
        </section>
      </div>
    </article>
  );
}

export function PatientHistoryPage({
  patientId,
  detailPath,
  handoffSavePath,
  backHref,
  chartHref,
  scheduleHrefPrefix,
  invoiceBillPath,
  invoiceEmailPath,
  invoiceSyncPath,
  invoiceConfirmPaidPath,
  invoiceChargeSavedCardPath,
  billingHref,
  allowEditVisitBilling,
  allowRemoveFromChart,
  billingEditApiMode,
}: {
  patientId: number;
  detailPath: string;
  handoffSavePath: string;
  backHref: string;
  /** When set, shows a shortcut to the full chart (doctor record page). */
  chartHref?: string;
  /** Admin only — link to Invoices & Billing (search patient name there). */
  billingHref?: string;
  /** Open billing editor for completed or awaiting-payment visit invoices. */
  allowEditVisitBilling?: boolean;
  /** Admin/staff — remove completed, no-show, or cancelled rows from this chart. */
  allowRemoveFromChart?: boolean;
  /** Which API endpoints the billing editor uses (default admin desk). */
  billingEditApiMode?: "admin" | "doctor";
  scheduleHrefPrefix: string;
  /** e.g. `/admin/invoice_bill` or `/doctor/invoice_bill` */
  invoiceBillPath: string;
  /** e.g. `/admin/email-patient-bill` or `/doctor/email-patient-bill` */
  invoiceEmailPath: string;
  /** e.g. `/admin/sync-invoice-payment` — checks Square and updates paid status */
  invoiceSyncPath?: string;
  /** Admin/staff only — mark paid when Square app shows paid but auto-sync failed */
  invoiceConfirmPaidPath?: string;
  /** Charge patient's saved card on file for this invoice */
  invoiceChargeSavedCardPath?: string;
}) {
  const [detail, setDetail] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [handoffEdits, setHandoffEdits] = useState<Record<number, string>>({});
  const [savingHandoffId, setSavingHandoffId] = useState<number | null>(null);
  const [handoffMsg, setHandoffMsg] = useState("");
  const [patientBillModal, setPatientBillModal] = useState<PatientBillPayload | null>(null);
  const [printingInvoiceId, setPrintingInvoiceId] = useState<number | null>(null);
  const [syncingInvoiceId, setSyncingInvoiceId] = useState<number | null>(null);
  const [confirmingInvoiceId, setConfirmingInvoiceId] = useState<number | null>(null);
  const [recordingCashInvoiceId, setRecordingCashInvoiceId] = useState<number | null>(null);
  const [chargingSavedCardInvoiceId, setChargingSavedCardInvoiceId] = useState<number | null>(null);
  const [chargeSavedCardId, setChargeSavedCardId] = useState<number | null>(null);
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);
  const [billingEditAppointment, setBillingEditAppointment] = useState<AppointmentHistoryRow | null>(null);
  const [removingAppointmentId, setRemovingAppointmentId] = useState<number | null>(null);
  const [visitSearch, setVisitSearch] = useState("");
  const { runWithFeedback, toast } = useAppFeedback();
  const { requestCashAmount, RecordCashPaymentModal } = useRecordCashPayment();

  const loadDetail = async () => {
    setLoading(true);
    setError("");
    try {
      const d = await apiGetAuth<PatientDetail>(`${detailPath}/?patient_id=${patientId}`);
      setDetail(d);
      const cards = d.saved_cards || [];
      const defaultCard = cards.find((c) => c.is_default) || cards[0];
      setChargeSavedCardId(defaultCard?.id ?? null);
      const m: Record<number, string> = {};
      for (const a of d.appointments) m[a.id] = a.clinical_handoff_notes ?? "";
      setHandoffEdits(m);
      setSelectedVisitId((prev) => {
        if (prev != null && d.appointments.some((a) => a.id === prev)) return prev;
        return d.appointments[0]?.id ?? null;
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load patient history.");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when patientId / detailPath change only
  }, [patientId, detailPath]);

  const billEmail = usePatientBillEmail(
    useCallback(
      (invoiceId: number) =>
        apiPost<{ detail: string; recipient: string }>(`${invoiceEmailPath}/`, {
          invoice_id: invoiceId,
        }),
      [invoiceEmailPath],
    ),
  );

  const emailBill = useCallback(
    async (invoiceId: number) => {
      setHandoffMsg("");
      const out = await billEmail.send(invoiceId, { quietToast: true });
      if (out) setHandoffMsg(formatPatientBillEmailSentMessage(out.recipient));
    },
    [billEmail],
  );

  const syncPayment = useCallback(
    async (invoiceId: number) => {
      if (!invoiceSyncPath) return;
      setSyncingInvoiceId(invoiceId);
      setHandoffMsg("");
      try {
        const out = await apiPost<{ paid: boolean; detail: string }>(`${invoiceSyncPath}/`, {
          invoice_id: invoiceId,
        });
        setHandoffMsg(out.detail);
        if (out.paid) await loadDetail();
      } catch (e) {
        setHandoffMsg(e instanceof ApiError ? e.message : "Could not check Square for payment.");
      } finally {
        setSyncingInvoiceId(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: loadDetail omitted to avoid re-creating on every detail refresh
    [invoiceSyncPath],
  );

  const confirmPaid = useCallback(
    async (invoiceId: number, invoiceNumber: string) => {
      if (!invoiceConfirmPaidPath) return;
      setConfirmingInvoiceId(invoiceId);
      setHandoffMsg("");
      try {
        const out = await apiPost<{ paid: boolean; detail: string }>(`${invoiceConfirmPaidPath}/`, {
          invoice_id: invoiceId,
          invoice_number: invoiceNumber,
        });
        setHandoffMsg(out.detail);
        await loadDetail();
      } catch (e) {
        setHandoffMsg(e instanceof ApiError ? e.message : "Could not mark invoice paid.");
      } finally {
        setConfirmingInvoiceId(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: loadDetail omitted to avoid re-creating on every detail refresh
    [invoiceConfirmPaidPath],
  );

  const chargeSavedCard = useCallback(
    async (
      invoiceId: number,
      invoiceNumber: string,
      patientName: string,
      savedCardId?: number | null,
    ) => {
      if (!invoiceChargeSavedCardPath) return;
      const ok = window.confirm(
        `Charge the saved card on file for ${patientName}?\n\nInvoice: ${invoiceNumber}\n\nOnly continue if the patient agreed to this charge.`,
      );
      if (!ok) return;
      setChargingSavedCardInvoiceId(invoiceId);
      setHandoffMsg("");
      await runWithFeedback(
        async () => {
          const body: { invoice_id: number; saved_card_id?: number } = { invoice_id: invoiceId };
          if (savedCardId) body.saved_card_id = savedCardId;
          const out = await apiPost<{ charged?: boolean; paid?: boolean; detail: string }>(
            `${invoiceChargeSavedCardPath}/`,
            body,
          );
          await loadDetail();
          setHandoffMsg(out.detail ?? "Card charged — invoice paid.");
          return out;
        },
        {
          loadingMessage: "Charging saved card…",
          successMessage: (out) => out?.detail ?? "Card charged — invoice paid.",
          errorFallback: "Could not charge the saved card.",
        },
      );
      setChargingSavedCardInvoiceId(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: loadDetail omitted to avoid re-creating on every detail refresh
    [invoiceChargeSavedCardPath, runWithFeedback],
  );

  const recordCashPayment = useCallback(
    async (appointment: AppointmentHistoryRow, patientName: string) => {
      const inv = appointment.invoice;
      if (!inv || !invoiceIsUnpaid(inv)) {
        setHandoffMsg("This invoice is already paid in full.");
        return;
      }
      const amountDue = inv.remaining_client_responsibility_total ?? inv.total_amount;
      const subtitle =
        inv.kind === "no_show_fee" || appointment.status === "no_show"
          ? `No-show fee — ${patientName}`
          : inv.kind === "late_cancel_fee"
            ? `Late cancel fee — ${patientName}`
            : patientName;
      const cashAmount = await requestCashAmount({
        invoiceTotal: inv.total_amount,
        amountPaid: inv.payments_received_total ?? "0",
        amountDue,
        subtitle,
      });
      if (!cashAmount) return;
      setRecordingCashInvoiceId(inv.id);
      setHandoffMsg("");
      await runWithFeedback(
        async () => {
          const out = await apiPost<{
            fully_paid?: boolean;
            amount_due?: string;
          }>(`/invoices/${inv.id}/pay/`, {
            amount: cashAmount,
            payment_method: "cash",
            payment_reference: "",
          });
          await loadDetail();
          return out;
        },
        {
          loadingMessage: "Recording cash payment…",
          successMessage: (out) =>
            out?.fully_paid
              ? "Cash recorded — invoice paid in full."
              : `Cash recorded — $${out?.amount_due ?? amountDue} still due on this invoice.`,
          errorFallback: "Could not record cash payment. Try again.",
        },
      );
      setRecordingCashInvoiceId(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: loadDetail omitted to avoid re-creating on every detail refresh
    [requestCashAmount, runWithFeedback],
  );

  const openBill = useCallback(
    async (invoiceId: number, invoiceStatus: string) => {
      setPrintingInvoiceId(invoiceId);
      try {
        const preview = invoiceStatus !== "paid";
        const q = `invoice_id=${invoiceId}${preview ? "&preview=1" : ""}`;
        const bill = await apiGetAuth<PatientBillPayload>(`${invoiceBillPath}/?${q}`, {
          cache: "no-store",
        });
        setPatientBillModal(bill);
      } catch (e) {
        setHandoffMsg(e instanceof ApiError ? e.message : "Could not load bill for printing.");
      } finally {
        setPrintingInvoiceId(null);
      }
    },
    [invoiceBillPath],
  );

  const saveAppointmentHandoff = async (appointmentId: number) => {
    setSavingHandoffId(appointmentId);
    setHandoffMsg("");
    try {
      await apiPatch(handoffSavePath, {
        appointment_id: appointmentId,
        clinical_handoff_notes: handoffEdits[appointmentId] ?? "",
      });
      setHandoffMsg("Reminders & handoff saved.");
      await loadDetail();
    } catch (e) {
      setHandoffMsg(e instanceof ApiError ? e.message : "Could not save chart note.");
    } finally {
      setSavingHandoffId(null);
    }
  };

  const billCount = detail?.appointments.filter(visitHasBill).length ?? 0;

  const filteredAppointments = useMemo(() => {
    if (!detail) return [];
    const q = visitSearch.trim().toLowerCase();
    if (!q) return detail.appointments;
    return detail.appointments.filter((a) => {
      const hay = [
        a.appointment_date,
        a.start_time,
        a.end_time,
        a.service,
        a.provider,
        a.status,
        a.invoice?.invoice_number,
        a.visit?.reason_for_visit,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [detail, visitSearch]);

  const selectedVisit = useMemo(() => {
    if (!detail || selectedVisitId == null) return null;
    return detail.appointments.find((a) => a.id === selectedVisitId) ?? null;
  }, [detail, selectedVisitId]);

  useEffect(() => {
    if (!detail) return;
    if (selectedVisitId != null && filteredAppointments.some((a) => a.id === selectedVisitId)) return;
    // Keep selection inside the visible (possibly filtered) visit list.
    setSelectedVisitId(filteredAppointments[0]?.id ?? detail.appointments[0]?.id ?? null);
  }, [detail, filteredAppointments, selectedVisitId]);

  const removeFromChart = async (appointment: AppointmentHistoryRow) => {
    if (!allowRemoveFromChart) return;
    const blocked = removeFromChartBlockedReason(appointment);
    if (blocked) {
      toast.error(blocked);
      return;
    }
    const dateLabel = formatWeekdayMonthDayYear(appointment.appointment_date);
    const statusLabel = appointment.status.replace(/_/g, " ");
    const billNote = appointment.invoice
      ? `\n\nAny unpaid bill (${appointment.invoice.invoice_number}) will also be removed.`
      : "";
    const ok = window.confirm(
      `Remove this ${statusLabel} visit from ${patientFullName(detail?.first_name ?? "", detail?.last_name ?? "")}'s chart?\n\n${dateLabel} at ${appointment.start_time}${billNote}\n\nThis cannot be undone.`,
    );
    if (!ok) return;
    setRemovingAppointmentId(appointment.id);
    setHandoffMsg("");
    await runWithFeedback(
      async () => {
        await apiPost("/admin/remove_patient_history_appointment/", {
          patient_id: patientId,
          appointment_id: appointment.id,
        });
        await loadDetail();
      },
      {
        loadingMessage: "Removing visit…",
        successMessage: "Visit removed from patient chart.",
        errorFallback: "Could not remove this visit.",
      },
    );
    setRemovingAppointmentId(null);
  };

  if (loading) {
    return (
      <div className="p-6">
        <Loader variant="page" label="Loading patient history" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error || "Patient history could not be loaded."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f5f5f5]">
      <header className="sticky top-0 z-20 border-b border-[#e8e8e8] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight text-[#0d5c2e]">
                <PatientNameWithProfile
                  name={patientFullName(detail.first_name, detail.last_name)}
                  profile={detail.payment_profile}
                  irisTag={detail.iris_tag}
                  nameClassName="text-[#0d5c2e]"
                />
              </h1>
            </div>
            <p className="text-sm text-[#949494]">
              {detail.phone}
              <span className="text-[#e8e8e8]"> · </span>
              ID: {detail.id}
              <span className="text-[#e8e8e8]"> · </span>
              {detail.appointments.length} visit{detail.appointments.length === 1 ? "" : "s"}
              {billCount > 0 ? ` · ${billCount} bill${billCount === 1 ? "" : "s"}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {chartHref ? (
              <Link
                href={chartHref}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#16a349] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13823d]"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden />
                Chart
              </Link>
            ) : null}
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#e8e8e8] bg-white px-4 py-2 text-sm font-medium text-[#949494] hover:bg-[#f5f5f5]"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Patients
            </Link>
          </div>
        </div>
        {detail.clinical_access === "read_only" && detail.clinical_access_message ? (
          <p className="mx-4 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 sm:mx-6">
            {detail.clinical_access_message}
          </p>
        ) : null}
        {handoffMsg ? (
          <p
            className={cn(
              "mx-4 mb-3 rounded-lg px-3 py-2 text-xs font-medium sm:mx-6",
              handoffMsg === "Reminders & handoff saved." ||
              handoffMsg === "Invoice updated." ||
              /marked paid|already marked paid|payment found|cash recorded/i.test(handoffMsg) ||
              isPatientBillEmailSuccessMessage(handoffMsg)
                ? "bg-emerald-50 text-emerald-900"
                : "bg-amber-50 text-amber-950",
            )}
          >
            {handoffMsg}
          </p>
        ) : null}
        {detail.account_summary ? (
          <PatientAccountSummaryCard
            summary={detail.account_summary}
            billingHref={billingHref}
            patientName={`${detail.first_name} ${detail.last_name}`}
          />
        ) : null}
      </header>

      {detail.appointments.length === 0 ? (
        <div className="m-6 rounded-lg border border-dashed border-[#e8e8e8] bg-white px-6 py-12 text-center">
          <p className="text-base font-semibold text-slate-800">No appointments on file</p>
          <p className="mt-2 text-sm text-[#949494]">
            When visits are completed, they will appear here with chart notes and printable bills.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <aside className="flex flex-col border-[#e8e8e8] bg-white lg:w-72 lg:shrink-0 lg:border-r">
            <div className="sticky top-0 border-b border-[#e8e8e8] bg-white px-4 py-4">
              <p className="mb-3 text-xs font-semibold text-[#949494]">VISIT HISTORY</p>
              <div className="flex items-center gap-2">
                <input
                  type="search"
                  value={visitSearch}
                  onChange={(e) => setVisitSearch(e.target.value)}
                  placeholder="Search visits…"
                  className="min-w-0 flex-1 rounded-md border border-[#e8e8e8] bg-[#f8f8f7] px-2 py-1.5 text-xs text-slate-800 placeholder:text-[#949494] focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15"
                  aria-label="Search visits"
                />
                <span className="rounded-md border border-[#e8e8e8] bg-white p-1.5" aria-hidden>
                  <Search className="h-3.5 w-3.5 text-[#949494]" />
                </span>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto p-2 lg:hidden">
              {filteredAppointments.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedVisitId(a.id)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    selectedVisitId === a.id
                      ? "border-[#16a349] bg-[#16a349] text-white"
                      : "border-[#e8e8e8] bg-white text-slate-700",
                  )}
                >
                  {formatMonthDayYear(a.appointment_date)}
                </button>
              ))}
            </div>

            <nav
              className="hidden space-y-1 overflow-y-auto p-2 lg:block lg:max-h-[calc(100dvh-16rem)]"
              aria-label="Visit list"
            >
              {filteredAppointments.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-[#949494]">No visits match your search.</p>
              ) : (
                filteredAppointments.map((a) => (
                  <VisitListRow
                    key={a.id}
                    appointment={a}
                    selected={selectedVisitId === a.id}
                    onSelect={() => setSelectedVisitId(a.id)}
                  />
                ))
              )}
            </nav>
          </aside>

          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-white p-4 sm:p-6 lg:max-h-[calc(100dvh-12rem)]">
            {selectedVisit ? (
              <VisitRecordCard
                key={selectedVisit.id}
                appointment={selectedVisit}
                patientName={patientFullName(detail.first_name, detail.last_name)}
                handoffValue={handoffEdits[selectedVisit.id] ?? ""}
                onHandoffChange={(v) => setHandoffEdits((prev) => ({ ...prev, [selectedVisit.id]: v }))}
                savingHandoff={savingHandoffId === selectedVisit.id}
                onSaveHandoff={() => void saveAppointmentHandoff(selectedVisit.id)}
                scheduleHrefPrefix={scheduleHrefPrefix}
                onPrintBill={(id, status) => void openBill(id, status)}
                onEmailBill={(id) => void emailBill(id)}
                onSyncPayment={invoiceSyncPath ? (id) => void syncPayment(id) : undefined}
                onConfirmPaid={
                  invoiceConfirmPaidPath
                    ? (id, no) => void confirmPaid(id, no)
                    : undefined
                }
                onRecordCashPayment={
                  invoiceIsUnpaid(selectedVisit.invoice)
                    ? () =>
                        void recordCashPayment(
                          selectedVisit,
                          patientFullName(detail.first_name, detail.last_name),
                        )
                    : undefined
                }
                onChargeSavedCard={
                  invoiceChargeSavedCardPath && invoiceIsUnpaid(selectedVisit.invoice) && selectedVisit.invoice
                    ? () =>
                        void chargeSavedCard(
                          selectedVisit.invoice!.id,
                          selectedVisit.invoice!.invoice_number,
                          patientFullName(detail.first_name, detail.last_name),
                          chargeSavedCardId,
                        )
                    : undefined
                }
                hasChargeableSavedCard={Boolean(
                  detail.has_chargeable_saved_card ??
                    (detail.has_saved_card && !detail.card_display_only),
                )}
                cardLast4={
                  (detail.saved_cards || []).find((c) => c.id === chargeSavedCardId)?.card_last4 ||
                  detail.card_last4
                }
                cardBrand={detail.card_brand}
                cardDisplayOnly={detail.card_display_only}
                savedCards={detail.saved_cards}
                chargeSavedCardId={chargeSavedCardId}
                onChargeSavedCardIdChange={setChargeSavedCardId}
                printingBill={printingInvoiceId === selectedVisit.invoice?.id}
                emailingBill={
                  selectedVisit.invoice?.id != null && billEmail.isSending(selectedVisit.invoice.id)
                }
                emailSentTo={
                  selectedVisit.invoice?.id != null
                    ? billEmail.sentFor(selectedVisit.invoice.id)
                    : null
                }
                syncingBill={syncingInvoiceId === selectedVisit.invoice?.id}
                confirmingBill={confirmingInvoiceId === selectedVisit.invoice?.id}
                recordingCash={recordingCashInvoiceId === selectedVisit.invoice?.id}
                chargingSavedCard={chargingSavedCardInvoiceId === selectedVisit.invoice?.id}
                onEditBilling={
                  allowEditVisitBilling && canEditVisitInvoice(selectedVisit)
                    ? () => setBillingEditAppointment(selectedVisit)
                    : undefined
                }
                onRemoveFromChart={
                  allowRemoveFromChart && canRemoveFromPatientChart(selectedVisit)
                    ? () => void removeFromChart(selectedVisit)
                    : undefined
                }
                removingFromChart={removingAppointmentId === selectedVisit.id}
              />
            ) : (
              <div className="flex h-full min-h-48 items-center justify-center">
                <p className="text-sm text-[#949494]">Select a visit to view details</p>
              </div>
            )}
          </main>
        </div>
      )}

      {RecordCashPaymentModal}

      {allowEditVisitBilling && billingEditAppointment ? (
        <AdminVisitBillingModal
          open
          apiMode={billingEditApiMode ?? "admin"}
          appointmentId={billingEditAppointment.id}
          appointmentDate={billingEditAppointment.appointment_date}
          bookedServiceId={billingEditAppointment.booked_service_id ?? null}
          patientLabel={patientFullName(detail?.first_name ?? "", detail?.last_name ?? "")}
          onClose={() => setBillingEditAppointment(null)}
          onSaved={() => {
            void loadDetail();
            setBillingEditAppointment(null);
            setHandoffMsg("Invoice updated.");
          }}
        />
      ) : null}

      <PatientBillPortalModal
        bill={patientBillModal}
        onClose={() => {
          setPatientBillModal(null);
          billEmail.clearSent();
        }}
        emailingBill={
          patientBillModal?.invoice_id != null && billEmail.isSending(patientBillModal.invoice_id)
        }
        emailSentTo={
          patientBillModal?.invoice_id != null
            ? billEmail.sentFor(patientBillModal.invoice_id)
            : null
        }
        onEmailBill={
          patientBillModal?.invoice_id
            ? () => void emailBill(patientBillModal.invoice_id!)
            : undefined
        }
      />
    </div>
  );
}
