"use client";

import Link from "next/link";
import { Loader } from "@/components/loader";
import { PatientBillPortalModal } from "@/components/patient-bill-portal-modal";
import { appointmentStatusPillClass } from "@/components/status-chip";
import { ApiError, apiGetAuth, apiPatch } from "@/lib/api";
import { clinicTodayIso } from "@/lib/format-date";
import type { PatientBillPayload } from "@/lib/patient-bill-print";
import { ChartNoteReader, ChartNoteWorkspace } from "@/components/chart-note-document";
import { formatMonthDayYear, formatWeekdayMonthDayYear } from "@/lib/format-date";
import { Printer } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
  completed_at: string | null;
  rendered_services: VisitHistoryLine[];
};

type AppointmentHistoryRow = {
  id: number;
  appointment_date: string;
  start_time: string;
  end_time: string;
  service: string | null;
  provider: string | null;
  status: string;
  clinical_handoff_notes: string;
  can_edit_handoff_notes: boolean;
  visit: VisitHistory | null;
  invoice: {
    id: number;
    invoice_number: string;
    subtotal: string;
    discount: string;
    credit_applied_total: string;
    professional_discount_reason: string;
    total_amount: string;
    status: string;
  } | null;
};

type PatientDetail = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  appointments: AppointmentHistoryRow[];
};

function statusBadgeClass(status: string): string {
  return `${appointmentStatusPillClass(status)} ring-1 ring-black/[0.06]`;
}

function isVisitToday(appointmentDate: string): boolean {
  return appointmentDate === clinicTodayIso();
}

function visitHasBill(a: AppointmentHistoryRow): boolean {
  return Boolean(a.invoice?.id);
}

function VisitBillPanel({
  appointment,
  onPrint,
  printing,
}: {
  appointment: AppointmentHistoryRow;
  onPrint: (invoiceId: number, invoiceStatus: string) => void;
  printing: boolean;
}) {
  const inv = appointment.invoice;
  const lines = appointment.visit?.rendered_services ?? [];

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
    <div className="rounded-xl border-2 border-[#0f766e]/25 bg-gradient-to-b from-[#f0fdfa] to-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#0f766e]/15 pb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0f766e]">Patient bill</p>
          <p className="mt-1 font-mono text-sm font-bold text-slate-900">{inv.invoice_number}</p>
          <p className="mt-0.5 text-xs capitalize text-slate-600">{inv.status.replace(/_/g, " ")}</p>
        </div>
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
        <div className="flex justify-between gap-4">
          <span>Subtotal (patient portion)</span>
          <span className="font-medium">${inv.subtotal}</span>
        </div>
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
        <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
          <span>Amount due</span>
          <span>${inv.total_amount}</span>
        </div>
      </div>
    </div>
  );
}

function VisitRecordCard({
  appointment,
  handoffValue,
  onHandoffChange,
  savingHandoff,
  onSaveHandoff,
  scheduleHrefPrefix,
  onPrintBill,
  printingBill,
}: {
  appointment: AppointmentHistoryRow;
  handoffValue: string;
  onHandoffChange: (v: string) => void;
  savingHandoff: boolean;
  onSaveHandoff: () => void;
  scheduleHrefPrefix: string;
  onPrintBill: (invoiceId: number, invoiceStatus: string) => void;
  printingBill: boolean;
}) {
  const a = appointment;
  const dateLabel = formatWeekdayMonthDayYear(a.appointment_date);

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 bg-slate-50/90 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#0d5c2e]">Visit record</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">{dateLabel}</h2>
            <p className="mt-0.5 text-sm font-medium text-slate-700">
              {a.start_time}
              {a.end_time ? ` – ${a.end_time}` : ""}
              {a.service ? ` · ${a.service}` : ""}
            </p>
            {a.provider ? (
              <p className="mt-1 text-sm text-slate-600">
                Provider: <span className="font-semibold text-[#0d5c2e]">{a.provider}</span>
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${statusBadgeClass(a.status)}`}
            >
              {a.status.replace(/_/g, " ")}
            </span>
            {isVisitToday(a.appointment_date) ? (
              <Link
                href={`${scheduleHrefPrefix}?appointment=${a.id}`}
                className="text-xs font-semibold text-[#0d5c2e] hover:underline"
              >
                On today&apos;s schedule →
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-2">
        <section className="space-y-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Chart & clinical notes</p>
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
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 text-sm">
              {a.visit.reason_for_visit?.trim() ? (
                <p>
                  <span className="font-semibold text-slate-600">Reason for visit: </span>
                  {a.visit.reason_for_visit}
                </p>
              ) : null}
              {a.visit.diagnosis?.trim() ? (
                <p className={a.visit.reason_for_visit?.trim() ? "mt-2" : ""}>
                  <span className="font-semibold text-slate-600">Diagnosis (on bill): </span>
                  {a.visit.diagnosis}
                </p>
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

        <section>
          <VisitBillPanel appointment={a} onPrint={onPrintBill} printing={printingBill} />
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
  scheduleHrefPrefix,
  invoiceBillPath,
}: {
  patientId: number;
  detailPath: string;
  handoffSavePath: string;
  backHref: string;
  scheduleHrefPrefix: string;
  /** e.g. `/admin/invoice_bill` or `/doctor/invoice_bill` */
  invoiceBillPath: string;
}) {
  const [detail, setDetail] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [handoffEdits, setHandoffEdits] = useState<Record<number, string>>({});
  const [savingHandoffId, setSavingHandoffId] = useState<number | null>(null);
  const [handoffMsg, setHandoffMsg] = useState("");
  const [patientBillModal, setPatientBillModal] = useState<PatientBillPayload | null>(null);
  const [printingInvoiceId, setPrintingInvoiceId] = useState<number | null>(null);

  const loadDetail = async () => {
    setLoading(true);
    setError("");
    try {
      const d = await apiGetAuth<PatientDetail>(`${detailPath}/?patient_id=${patientId}`);
      setDetail(d);
      const m: Record<number, string> = {};
      for (const a of d.appointments) m[a.id] = a.clinical_handoff_notes ?? "";
      setHandoffEdits(m);
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
      setHandoffMsg("Chart note saved.");
      await loadDetail();
    } catch (e) {
      setHandoffMsg(e instanceof ApiError ? e.message : "Could not save chart note.");
    } finally {
      setSavingHandoffId(null);
    }
  };

  const billCount = detail?.appointments.filter(visitHasBill).length ?? 0;

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
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0d5c2e]">Medical record</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              {detail.first_name} {detail.last_name}
            </h1>
            <p className="mt-1 text-sm text-slate-600">{detail.phone}</p>
            <p className="mt-2 text-sm text-slate-500">
              {detail.appointments.length} visit{detail.appointments.length === 1 ? "" : "s"} on file
              {billCount > 0 ? ` · ${billCount} with printable bill${billCount === 1 ? "" : "s"}` : ""}
            </p>
          </div>
          <Link
            href={backHref}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back
          </Link>
        </div>
      </div>

      {handoffMsg ? (
        <p
          className={`rounded-xl px-3 py-2 text-sm font-medium ${
            handoffMsg === "Chart note saved." ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-950"
          }`}
        >
          {handoffMsg}
        </p>
      ) : null}

      {detail.appointments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
          <p className="text-base font-semibold text-slate-800">No appointments on file</p>
          <p className="mt-2 text-sm text-slate-500">
            When visits are completed, each one will show here with chart notes and a patient bill you can reprint.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Each visit is shown as a record with clinical notes on the left and the patient bill on the right (when the visit
            was completed). Use <strong>Reprint bill</strong> to open the official statement for the patient.
          </p>

          {detail.appointments.map((a) => (
            <VisitRecordCard
              key={a.id}
              appointment={a}
              handoffValue={handoffEdits[a.id] ?? ""}
              onHandoffChange={(v) => setHandoffEdits((prev) => ({ ...prev, [a.id]: v }))}
              savingHandoff={savingHandoffId === a.id}
              onSaveHandoff={() => void saveAppointmentHandoff(a.id)}
              scheduleHrefPrefix={scheduleHrefPrefix}
              onPrintBill={(id, status) => void openBill(id, status)}
              printingBill={printingInvoiceId === a.invoice?.id}
            />
          ))}
        </div>
      )}

      <PatientBillPortalModal bill={patientBillModal} onClose={() => setPatientBillModal(null)} />
    </div>
  );
}
