"use client";

import Link from "next/link";
import { useAppFeedback } from "@/components/app-feedback";
import { Loader } from "@/components/loader";
import { EmailBillButton } from "@/components/email-bill-button";
import { PatientBillPortalModal } from "@/components/patient-bill-portal-modal";
import { useRecordCashPayment } from "@/components/record-cash-payment-modal";
import { usePatientBillEmail } from "@/hooks/use-patient-bill-email";
import {
  formatPatientBillEmailSentMessage,
  isPatientBillEmailSuccessMessage,
} from "@/lib/patient-bill-email";
import { PatientNameWithProfile, patientFullName } from "@/components/patient-payment-profile";
import { AppointmentStatusBadge, appointmentHistoryRowClass } from "@/components/status-chip";
import { ApiError, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import { VisitDiagnosisDisplay } from "@/components/visit-diagnosis-display";
import { cn } from "@/lib/utils";
import { clinicTodayIso } from "@/lib/format-date";
import type { PatientBillPayload } from "@/lib/patient-bill-print";
import { parseMoneyAmount } from "@/lib/record-cash-prompt";
import { ChartNoteReader, ChartNoteWorkspace } from "@/components/chart-note-document";
import { formatMonthDayYear, formatWeekdayMonthDayYear } from "@/lib/format-date";
import { CalendarClock, FileText, Printer, Receipt } from "lucide-react";
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
  patientName,
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
      className="mt-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-100/80"
      aria-label="Account summary"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Balance &amp; visits</p>
          {hasBalance ? (
            <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-amber-950">
              {formatMoney(summary.balance_total)}
              <span className="ml-2 text-sm font-semibold uppercase text-amber-700">
                {summary.has_overdue ? "Overdue" : "Due"}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-lg font-semibold text-[#0d5c2e]">No balance due</p>
          )}
        </div>
        {billingHref ? (
          <Link
            href={billingHref}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
          >
            All invoices →
          </Link>
        ) : null}
      </div>

      {hasBalance ? (
        <ul className="mt-3 flex flex-wrap gap-2 text-xs">
          {visitDue > 0.009 ? (
            <li className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-800">
              Visit bills {formatMoney(summary.balance_visit)}
            </li>
          ) : null}
          {nsDue > 0.009 ? (
            <li className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 font-medium text-red-950">
              No-show fees {formatMoney(summary.balance_no_show_fee)}
            </li>
          ) : null}
          {lcDue > 0.009 ? (
            <li className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 font-medium text-rose-950">
              Cancel fees {formatMoney(summary.balance_late_cancel_fee)}
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Completed visits</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{summary.visit_count}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Upcoming</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-[#047857]">{summary.upcoming_count}</p>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50/50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-red-800/80">No-shows on record</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-red-950">{summary.no_show_count}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Cancelled</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-700">{summary.cancelled_count}</p>
        </div>
      </div>

      {summary.upcoming_count > 0 && summary.next_appointment_date ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-[#0d5c2e]">
          <CalendarClock className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
          <span>
            <span className="font-semibold">Next:</span>{" "}
            {formatWeekdayMonthDayYear(summary.next_appointment_date)}
            {summary.next_appointment_time ? ` at ${summary.next_appointment_time}` : ""}
          </span>
        </p>
      ) : (
        <p className="mt-3 text-sm text-slate-500">No upcoming appointments on the schedule.</p>
      )}

      <p className="mt-2 text-[11px] text-slate-500">
        Unpaid totals match{" "}
        {billingHref ? (
          <Link href={billingHref} className="font-medium text-[#0d5c2e] hover:underline">
            Invoices &amp; Billing
          </Link>
        ) : (
          "billing"
        )}
        . Search for <span className="font-medium text-slate-700">{patientName}</span> to see every bill.
      </p>
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

function VisitBillPanel({
  appointment,
  patientName,
  onPrint,
  onEmail,
  onSyncPayment,
  onConfirmPaid,
  onRecordCashPayment,
  onEditBilling,
  printing,
  emailing,
  emailSentTo,
  syncing,
  confirming,
  recordingCash,
}: {
  appointment: AppointmentHistoryRow;
  patientName: string;
  onPrint: (invoiceId: number, invoiceStatus: string) => void;
  onEmail?: (invoiceId: number) => void;
  onSyncPayment?: (invoiceId: number) => void;
  onConfirmPaid?: (invoiceId: number, invoiceNumber: string) => void;
  onRecordCashPayment?: () => void;
  onEditBilling?: () => void;
  printing: boolean;
  emailing?: boolean;
  emailSentTo?: string | null;
  syncing?: boolean;
  confirming?: boolean;
  recordingCash?: boolean;
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
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-5 text-center">
        <p className="text-sm font-semibold text-slate-700">No patient bill yet</p>
        <p className="mt-1 text-xs text-slate-500">
          A printable bill appears here after the visit is completed and billing is saved.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border-2 p-4 shadow-sm",
        isPenaltyBill
          ? "border-red-200/90 bg-gradient-to-b from-red-50/80 to-white"
          : "border-[#0f766e]/25 bg-gradient-to-b from-[#f0fdfa] to-white",
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-start justify-between gap-3 border-b pb-3",
          isPenaltyBill ? "border-red-200/80" : "border-[#0f766e]/15",
        )}
      >
        <div>
          <p
            className={cn(
              "text-[10px] font-bold uppercase tracking-[0.16em]",
              isPenaltyBill ? "text-red-900" : "text-[#0f766e]",
            )}
          >
            {isPenaltyBill ? invoiceKindLabel(inv.kind) : "Patient bill"}
          </p>
          <p className="mt-1 font-mono text-sm font-bold text-slate-900">{inv.invoice_number}</p>
          <p className="mt-0.5 text-xs capitalize text-slate-600">{inv.status.replace(/_/g, " ")}</p>
          {isPenaltyBill && unpaid ? (
            <p className="mt-1 text-xs text-red-950/90">
              {patientName} missed or cancelled this visit — collect the fee below when they pay.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {unpaid && onRecordCashPayment ? (
            <button
              type="button"
              disabled={recordingCash}
              onClick={onRecordCashPayment}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-950 shadow-sm hover:bg-emerald-100 disabled:opacity-60"
            >
              {recordingCash ? "Recording…" : "Record cash payment"}
            </button>
          ) : null}
          {awaiting && onSyncPayment ? (
            <button
              type="button"
              disabled={syncing}
              onClick={() => onSyncPayment(inv.id)}
              className="inline-flex items-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-900 shadow-sm hover:bg-violet-100 disabled:opacity-60"
            >
              {syncing ? "Checking Square…" : "Check Square (any device)"}
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
              className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-950 shadow-sm hover:bg-amber-100 disabled:opacity-60"
            >
              {confirming ? "Updating…" : "Mark paid (verified in Square)"}
            </button>
          ) : null}
          {inv.status === "paid" && onEmail ? (
            <EmailBillButton
              onClick={() => onEmail(inv.id)}
              sending={emailing}
              sentTo={emailSentTo}
            />
          ) : null}
          {onEditBilling ? (
            <button
              type="button"
              onClick={onEditBilling}
              className="inline-flex items-center gap-2 rounded-xl border border-[#16a349]/50 bg-[#ecfdf5] px-4 py-2.5 text-sm font-semibold text-[#0d5c2e] shadow-sm hover:bg-[#d1fae5]"
            >
              Edit billing
            </button>
          ) : null}
          <button
            type="button"
            disabled={printing}
            onClick={() => onPrint(inv.id, inv.status)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-60"
          >
            <Printer className="h-4 w-4" aria-hidden />
            {printing ? "Opening…" : inv.status === "paid" ? "Reprint bill" : "View & print bill"}
          </button>
        </div>
      </div>
      {onEditBilling && inv.status === "paid" && !isPenaltyBill ? (
        <p className="mt-3 text-xs text-slate-600">
          Paid already? Use <strong>Edit billing</strong> to fix lines or discounts — if the new total is higher than
          payments received, the visit reopens for collection.
        </p>
      ) : null}

      {lines.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[280px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/80 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                <th className="px-2 py-2">Service</th>
                <th className="px-2 py-2">Code</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="px-2 py-2 font-medium text-slate-800">
                    {line.service_name}
                    {line.charges_patient === false ? (
                      <span className="ml-1 text-[10px] font-normal text-slate-500">(insurance)</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-slate-600">{line.billing_code || "—"}</td>
                  <td className="px-2 py-2 text-right text-slate-700">{line.quantity}</td>
                  <td className="px-2 py-2 text-right font-semibold text-slate-900">${line.line_total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">No line items on file for this visit.</p>
      )}

      <div className="mt-4 space-y-1 border-t border-slate-200 pt-3 text-sm text-slate-700">
        {inv.bill_charges_total ? (
          <div className="flex justify-between gap-4">
            <span>Total documented</span>
            <span className="font-medium">${inv.bill_charges_total}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 font-semibold text-[#0d5c2e]">
          <span>Patient Payments</span>
          <span>${inv.patient_charge_total ?? inv.total_amount}</span>
        </div>
        {inv.insurance_remaining_total && parseFloat(inv.insurance_remaining_total) > 0 ? (
          <div className="flex justify-between gap-4">
            <span>Remaining balance</span>
            <span className="font-medium">${inv.insurance_remaining_total}</span>
          </div>
        ) : null}
        {inv.discount !== "0.00" ? (
          <div className="flex justify-between gap-4 text-slate-600">
            <span>Professional discount</span>
            <span>-${inv.discount}</span>
          </div>
        ) : null}
        {inv.credit_applied_total !== "0.00" ? (
          <div className="flex justify-between gap-4 text-slate-600">
            <span>Credit applied</span>
            <span>-${inv.credit_applied_total}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 text-slate-600">
          <span>Payments received</span>
          <span className="font-medium">${inv.payments_received_total ?? "0.00"}</span>
        </div>
        <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
          <span>Remaining Client Responsibility</span>
          <span>
            $
            {inv.remaining_client_responsibility_total ??
              Math.max(
                0,
                parseFloat(inv.patient_charge_total ?? inv.total_amount) -
                  parseFloat(inv.payments_received_total ?? "0"),
              ).toFixed(2)}
          </span>
        </div>
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
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl border px-3 py-2.5 text-left transition",
        selected
          ? "border-[#16a349] bg-[#ecfdf5] shadow-sm ring-2 ring-[#16a349]/25"
          : a.status === "no_show"
            ? "border-red-200/90 bg-red-50/50 hover:border-red-300 hover:bg-red-50"
            : "border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/80",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">{formatMonthDayYear(a.appointment_date)}</span>
        <AppointmentStatusBadge status={a.status} size="xs" />
      </div>
      <p className="mt-0.5 text-xs text-slate-600 tabular-nums">
        {a.start_time}
        {a.service ? ` · ${a.service}` : ""}
      </p>
      {inv ? (
        <p className="mt-1 text-xs font-medium text-[#0f766e]">
          {invoiceKindLabel(inv.kind)} {inv.invoice_number} · ${inv.total_amount}
          {inv.status !== "paid" ? ` · ${inv.status}` : " · paid"}
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-400">No bill yet</p>
      )}
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
  onEditBilling,
  printingBill,
  emailingBill,
  emailSentTo,
  syncingBill,
  confirmingBill,
  recordingCash,
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
  onEditBilling?: () => void;
  printingBill: boolean;
  emailingBill?: boolean;
  emailSentTo?: string | null;
  syncingBill?: boolean;
  confirmingBill?: boolean;
  recordingCash?: boolean;
}) {
  const a = appointment;
  const dateLabel = formatWeekdayMonthDayYear(a.appointment_date);
  const [panel, setPanel] = useState<"chart" | "bill">(visitHasBill(a) ? "bill" : "chart");

  return (
    <article className={cn("overflow-hidden rounded-2xl border", appointmentHistoryRowClass(a.status))}>
      <header
        className={cn(
          "border-b px-4 py-3 sm:px-5",
          a.status === "no_show" ? "border-red-200/80 bg-red-50/90" : "border-slate-100 bg-slate-50/90",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-slate-900">{dateLabel}</h2>
            <p className="mt-0.5 text-sm font-medium text-slate-700">
              {a.start_time}
              {a.end_time ? ` – ${a.end_time}` : ""}
              {a.service ? ` · ${a.service}` : ""}
            </p>
            {a.provider ? (
              <p className="mt-0.5 text-sm text-slate-600">
                <span className="font-semibold text-[#0d5c2e]">{a.provider}</span>
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-2">
            <AppointmentStatusBadge status={a.status} size="sm" />
            {isVisitToday(a.appointment_date) ? (
              <Link
                href={`${scheduleHrefPrefix}?appointment=${a.id}`}
                className="text-xs font-semibold text-[#0d5c2e] hover:underline"
              >
                Today&apos;s schedule →
              </Link>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex gap-1 rounded-xl border border-slate-200/90 bg-white p-1 lg:hidden">
          <button
            type="button"
            onClick={() => setPanel("chart")}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
              panel === "chart" ? "bg-[#16a349] text-white" : "text-slate-600 hover:bg-slate-50",
            )}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            Chart
          </button>
          <button
            type="button"
            onClick={() => setPanel("bill")}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
              panel === "bill" ? "bg-[#16a349] text-white" : "text-slate-600 hover:bg-slate-50",
            )}
          >
            <Receipt className="h-3.5 w-3.5" aria-hidden />
            Bill
          </button>
        </div>
      </header>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-2">
        <section className={cn("space-y-4", panel === "bill" ? "hidden lg:block" : "")}>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Visit reminders & handoff
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Saved on this appointment for the next visit — not the same as consultation SOAP notes below.
            </p>
            <div className="mt-2">
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
          </div>

          {a.visit ? (
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 text-sm">
              {a.visit.reason_for_visit?.trim() ? (
                <p>
                  <span className="font-semibold text-slate-600">Reason for visit: </span>
                  {a.visit.reason_for_visit}
                </p>
              ) : null}
              {a.visit.diagnosis?.trim() || (a.visit.diagnoses?.length ?? 0) > 0 ? (
                <div className={a.visit.reason_for_visit?.trim() ? "mt-2" : ""}>
                  <p className="font-semibold text-slate-600">Diagnosis (on bill)</p>
                  <VisitDiagnosisDisplay diagnosis={a.visit.diagnosis} diagnoses={a.visit.diagnoses} className="mt-1" />
                </div>
              ) : null}
              {a.visit.doctor_notes?.trim() ? (
                <div className="mt-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">SOAP chart</p>
                  <div className="mt-2">
                    <ChartNoteReader text={a.visit.doctor_notes} />
                  </div>
                </div>
              ) : null}
              {a.visit.completed_at ? (
                <p className="mt-3 text-xs text-slate-500">
                  Visit completed {formatMonthDayYear(a.visit.completed_at.slice(0, 10))}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              This appointment has not been completed as a clinical visit yet.
            </p>
          )}
        </section>

        <section className={cn(panel === "chart" ? "hidden lg:block" : "")}>
          <VisitBillPanel
            appointment={a}
            patientName={patientName}
            onPrint={onPrintBill}
            onEmail={onEmailBill}
            onSyncPayment={onSyncPayment}
            onConfirmPaid={onConfirmPaid}
            onRecordCashPayment={onRecordCashPayment}
            onEditBilling={onEditBilling}
            printing={printingBill}
            emailing={emailingBill}
            emailSentTo={emailSentTo}
            syncing={syncingBill}
            confirming={confirmingBill}
            recordingCash={recordingCash}
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
  billingHref,
  allowEditVisitBilling,
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
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);
  const [billingEditAppointment, setBillingEditAppointment] = useState<AppointmentHistoryRow | null>(null);
  const { runWithFeedback } = useAppFeedback();
  const { requestCashAmount, RecordCashPaymentModal } = useRecordCashPayment();

  const loadDetail = async () => {
    setLoading(true);
    setError("");
    try {
      const d = await apiGetAuth<PatientDetail>(`${detailPath}/?patient_id=${patientId}`);
      setDetail(d);
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
    [invoiceConfirmPaidPath],
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

  const selectedVisit = useMemo(() => {
    if (!detail || selectedVisitId == null) return null;
    return detail.appointments.find((a) => a.id === selectedVisitId) ?? null;
  }, [detail, selectedVisitId]);

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
    <div className="mx-auto flex min-h-0 max-w-6xl flex-col p-3 sm:p-4 lg:p-5">
      <header className="sticky top-0 z-20 -mx-3 border-b border-slate-200/90 bg-[#f8faf9]/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4 lg:-mx-5 lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              <PatientNameWithProfile
                name={patientFullName(detail.first_name, detail.last_name)}
                profile={detail.payment_profile}
              />
            </h1>
            <p className="mt-0.5 text-sm text-slate-600">
              {detail.phone}
              <span className="text-slate-400"> · </span>
              {detail.appointments.length} visit{detail.appointments.length === 1 ? "" : "s"}
              {billCount > 0 ? ` · ${billCount} bill${billCount === 1 ? "" : "s"}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {chartHref ? (
              <Link
                href={chartHref}
                className="rounded-lg border border-[#16a349]/30 bg-[#f0fdf4] px-3 py-1.5 text-sm font-semibold text-[#0d5c2e] hover:bg-[#dcfce7]"
              >
                Chart
              </Link>
            ) : null}
            <Link
              href={backHref}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              ← Patients
            </Link>
          </div>
        </div>
        {detail.clinical_access === "read_only" && detail.clinical_access_message ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            {detail.clinical_access_message}
          </p>
        ) : null}
        {handoffMsg ? (
          <p
            className={cn(
              "mt-2 rounded-lg px-3 py-2 text-xs font-medium",
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
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
          <p className="text-base font-semibold text-slate-800">No appointments on file</p>
          <p className="mt-2 text-sm text-slate-500">
            When visits are completed, they will appear here with chart notes and printable bills.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-stretch">
          <aside className="flex flex-col lg:w-[17.5rem] lg:shrink-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Visits (newest first)</p>
            <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {detail.appointments.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedVisitId(a.id)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    selectedVisitId === a.id
                      ? "border-[#16a349] bg-[#16a349] text-white"
                      : "border-slate-200 bg-white text-slate-700",
                  )}
                >
                  {formatMonthDayYear(a.appointment_date)}
                </button>
              ))}
            </div>
            <nav
              className="hidden space-y-1.5 lg:block lg:max-h-[calc(100dvh-11rem)] lg:overflow-y-auto lg:pr-1"
              aria-label="Visit list"
            >
              {detail.appointments.map((a) => (
                <VisitListRow
                  key={a.id}
                  appointment={a}
                  selected={selectedVisitId === a.id}
                  onSelect={() => setSelectedVisitId(a.id)}
                />
              ))}
            </nav>
          </aside>

          <main className="min-h-0 min-w-0 flex-1 lg:max-h-[calc(100dvh-11rem)] lg:overflow-y-auto">
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
                onEditBilling={
                  allowEditVisitBilling && canEditVisitInvoice(selectedVisit)
                    ? () => setBillingEditAppointment(selectedVisit)
                    : undefined
                }
              />
            ) : (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                Select a visit to view chart notes and bill.
              </p>
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
