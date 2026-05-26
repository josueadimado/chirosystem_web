"use client";

import { ChartNoteReaderPanel } from "@/components/chart-note-document";
import { Loader } from "@/components/loader";
import { PatientDemographicsEditor } from "@/components/patient-demographics-editor";
import { PatientBillPortalModal } from "@/components/patient-bill-portal-modal";
import { appointmentStatusPillClass } from "@/components/status-chip";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ApiError, apiGetAuth } from "@/lib/api";
import type { PatientBillPayload } from "@/lib/patient-bill-print";
import {
  formatMonthDayYear,
  formatNowMonthDayYearTime,
  formatWeekdayMonthDayYear,
  parseApiDateOnly,
} from "@/lib/format-date";
import {
  formatDemographicsDate,
  formatMaritalStatus,
  formatPatientAge,
} from "@/lib/patient-demographics";
import Link from "next/link";
import { useParams } from "next/navigation";
import { flushSync } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";

// --- Types aligned with `GET /doctor/patient_detail/?patient_id=` (same as patient chart modal) ---

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
  email: string;
  date_of_birth: string | null;
  marital_status?: string;
  age?: number | null;
  date_established?: string | null;
  last_seen?: string | null;
  address_line1: string;
  address_line2: string;
  city_state_zip: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  appointments: AppointmentHistoryRow[];
};

function statusBadgeClass(status: string): string {
  return `${appointmentStatusPillClass(status)} ring-1 ring-black/[0.06]`;
}

function pricePaidLabel(inv: AppointmentHistoryRow["invoice"]): string {
  if (!inv) return "—";
  const st = (inv.status || "").toLowerCase();
  if (st === "paid") return `Paid $${inv.total_amount}`;
  if (st === "void") return "—";
  return `Billed $${inv.total_amount} (${st.replace(/_/g, " ")})`;
}

/** Print letterhead — aligns with clinic paperwork (no extra API). */
const CLINIC_PRINT_HEADER = {
  name: "Relief Chiropractic PC",
  phoneDisplay: "269-408-0303",
  addressLine: "3830 M 139, Suite 119, St Joseph, MI 49085",
} as const;

/** US-style MM/DD/YYYY for “Date of service” lines on printed records. */
function formatUsSlashDate(isoDate: string): string {
  const d = parseApiDateOnly(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function compareAppointmentsChronological(a: AppointmentHistoryRow, b: AppointmentHistoryRow): number {
  const d = a.appointment_date.localeCompare(b.appointment_date);
  if (d !== 0) return d;
  return (a.start_time || "").localeCompare(b.start_time || "");
}

/** Most recent appointment first (for on-screen visit history). */
function compareAppointmentsNewestFirst(a: AppointmentHistoryRow, b: AppointmentHistoryRow): number {
  const d = b.appointment_date.localeCompare(a.appointment_date);
  if (d !== 0) return d;
  return (b.start_time || "").localeCompare(a.start_time || "");
}

export default function DoctorPatientRecordPage() {
  const params = useParams<{ patientId: string }>();
  const id = Number(params.patientId);
  const [detail, setDetail] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedVisit, setSelectedVisit] = useState<AppointmentHistoryRow | null>(null);
  /** Shown on printed footer; set immediately before `window.print()` so the timestamp matches the print action. */
  const [printGeneratedAt, setPrintGeneratedAt] = useState("");
  const [printStart, setPrintStart] = useState("");
  const [printEnd, setPrintEnd] = useState("");
  const [patientBillModal, setPatientBillModal] = useState<PatientBillPayload | null>(null);
  const [printingInvoiceId, setPrintingInvoiceId] = useState<number | null>(null);
  const [billLoadError, setBillLoadError] = useState("");

  /* eslint-disable react-hooks/set-state-in-effect -- load chart when patient id changes */
  useEffect(() => {
    setSelectedVisit(null);
    if (!Number.isFinite(id) || id <= 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    void apiGetAuth<PatientDetail>(`/doctor/patient_detail/?patient_id=${id}`)
      .then(setDetail)
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : "Could not load patient record.");
        setDetail(null);
      })
      .finally(() => setLoading(false));
  }, [id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const appointmentDateBounds = useMemo(() => {
    if (!detail?.appointments?.length) return { min: "", max: "" };
    const dates = detail.appointments.map((a) => a.appointment_date).sort();
    return { min: dates[0]!, max: dates[dates.length - 1]! };
  }, [detail]);

  /* eslint-disable react-hooks/set-state-in-effect -- default print range when patient chart loads */
  useEffect(() => {
    if (!appointmentDateBounds.min) {
      setPrintStart("");
      setPrintEnd("");
      return;
    }
    setPrintStart(appointmentDateBounds.min);
    setPrintEnd(appointmentDateBounds.max);
  }, [detail?.id, appointmentDateBounds.min, appointmentDateBounds.max]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /** All appointments, most recent first — full visit history on screen. */
  const visitsNewestFirst = useMemo(() => {
    if (!detail?.appointments?.length) return [];
    return [...detail.appointments].sort(compareAppointmentsNewestFirst);
  }, [detail]);

  /** All chart appointments, oldest first — used for print narrative order. */
  const allVisitsSorted = useMemo(() => {
    if (!detail?.appointments?.length) return [];
    return [...detail.appointments].sort(compareAppointmentsChronological);
  }, [detail]);

  /** Visits whose appointment date falls in the selected print range (inclusive). */
  const visitsForPrint = useMemo(() => {
    if (!allVisitsSorted.length || !printStart || !printEnd) return allVisitsSorted;
    let a = printStart;
    let b = printEnd;
    if (a > b) [a, b] = [b, a];
    return allVisitsSorted.filter((row) => row.appointment_date >= a && row.appointment_date <= b);
  }, [allVisitsSorted, printStart, printEnd]);

  const handlePrintPatientFile = () => {
    flushSync(() => {
      setPrintGeneratedAt(formatNowMonthDayYearTime());
    });
    window.print();
  };

  const openBillPreview = useCallback(async (invoiceId: number, invoiceStatus: string) => {
    setBillLoadError("");
    setPrintingInvoiceId(invoiceId);
    try {
      const preview = invoiceStatus !== "paid";
      const q = `invoice_id=${invoiceId}${preview ? "&preview=1" : ""}`;
      const bill = await apiGetAuth<PatientBillPayload>(`/doctor/invoice_bill/?${q}`);
      setPatientBillModal(bill);
    } catch (e) {
      setBillLoadError(e instanceof ApiError ? e.message : "Could not load bill for preview.");
    } finally {
      setPrintingInvoiceId(null);
    }
  }, []);

  const billVisitCount = detail?.appointments.filter((a) => a.invoice?.id).length ?? 0;

  if (!Number.isFinite(id) || id <= 0) {
    return <div className="p-6 text-sm text-rose-700">Invalid patient id.</div>;
  }

  if (loading) {
    return (
      <div className="py-12">
        <Loader variant="page" label="Loading patient record" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <Link
          href="/doctor/patients"
          className="print:hidden inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          ← Back to patients
        </Link>
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error || "Patient record could not be loaded."}
        </p>
      </div>
    );
  }

  const displayInitial =
    (detail.first_name?.trim().charAt(0) || detail.last_name?.trim().charAt(0) || "?").toUpperCase();

  const printStyles = `
    @page {
      size: letter;
      margin: 14mm 12mm 18mm 12mm;
      @bottom-center {
        content: "Page " counter(page);
        font-size: 11px;
        color: #000;
        font-family: ui-sans-serif, system-ui, sans-serif;
      }
    }
    @media print {
      html, body {
        background: #fff !important;
        color: #000 !important;
      }
      body * {
        visibility: hidden !important;
      }
      #patient-record-print-root {
        display: none !important;
      }
      #patient-file-print-root {
        display: block !important;
        visibility: visible !important;
      }
      #patient-file-print-root,
      #patient-file-print-root * {
        visibility: visible !important;
      }
      #patient-file-print-root {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        z-index: 999999;
        background: #fff !important;
        color: #000 !important;
        font-family: ui-serif, Georgia, "Times New Roman", serif;
        font-size: 12px;
        line-height: 1.5;
      }
      #patient-file-print-root * {
        box-shadow: none !important;
        text-shadow: none !important;
      }
      #patient-file-print-root .pf-print-wrap {
        max-width: 720px;
        margin: 0 auto;
        padding: 0 8px;
      }
      #patient-file-print-root .pf-print-header {
        text-align: center;
        margin-bottom: 22px;
      }
      #patient-file-print-root .pf-clinic-name {
        font-size: 15px;
        font-weight: 700;
        margin: 0 0 6px 0;
      }
      #patient-file-print-root .pf-clinic-line {
        margin: 2px 0;
        font-size: 12px;
      }
      #patient-file-print-root .pf-report-line {
        margin-top: 12px;
        font-size: 11px;
      }
      #patient-file-print-root .pf-patient-line {
        text-align: center;
        font-weight: 700;
        font-size: 13px;
        margin: 18px 0 8px 0;
      }
      #patient-file-print-root .pf-policy-line {
        text-align: center;
        font-size: 12px;
        margin: 0 0 18px 0;
      }
      #patient-file-print-root table.pf-demo-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
        margin-bottom: 22px;
      }
      #patient-file-print-root table.pf-demo-table td {
        padding: 10px 12px;
        vertical-align: top;
        border-bottom: 1px solid #ccc;
      }
      #patient-file-print-root table.pf-demo-table td.pf-demo-label {
        width: 32%;
        font-weight: 700;
        color: #0f766e !important;
        font-family: ui-sans-serif, system-ui, sans-serif;
      }
      #patient-file-print-root table.pf-demo-table td.pf-demo-value {
        font-family: ui-serif, Georgia, "Times New Roman", serif;
      }
      #patient-file-print-root .pf-visit-block {
        margin-bottom: 22px;
        page-break-inside: avoid;
      }
      #patient-file-print-root .pf-visit-heading {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 12.5px;
        font-weight: 700;
        color: #0f766e !important;
        border-bottom: 1px solid #0f766e;
        padding-bottom: 4px;
        margin: 16px 0 10px 0;
      }
      #patient-file-print-root .pf-visit-meta {
        margin: 4px 0;
        font-size: 11.5px;
      }
      #patient-file-print-root .pf-subheading {
        font-weight: 700;
        margin: 12px 0 6px 0;
        font-size: 12px;
      }
      #patient-file-print-root .pf-subheading-sm {
        font-weight: 700;
        margin: 10px 0 4px 0;
        font-size: 11.5px;
      }
      #patient-file-print-root .pf-note-print {
        white-space: pre-wrap;
        margin: 0 0 8px 0;
        text-align: left;
      }
      #patient-file-print-root .pf-muted {
        font-size: 11px;
        opacity: 0.85;
      }
      #patient-file-print-root .pf-print-empty {
        font-style: italic;
        margin: 12px 0;
      }
      #patient-file-print-root .pf-generated {
        margin-top: 28px;
        font-size: 11px;
        border-top: 1px solid #999;
        padding-top: 12px;
      }
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: printStyles }} />

      <div id="patient-record-print-root" className="print:hidden space-y-8">
        {/* Top bar: back + print date range */}
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
          <Link
            href="/doctor/patients"
            className="print:hidden inline-flex w-fit items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            ← Back to patients
          </Link>
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500">Print from</span>
              <input
                type="date"
                value={printStart}
                onChange={(e) => setPrintStart(e.target.value)}
                min={appointmentDateBounds.min || undefined}
                max={appointmentDateBounds.max || undefined}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                aria-label="Print date range start"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500">Print through</span>
              <input
                type="date"
                value={printEnd}
                onChange={(e) => setPrintEnd(e.target.value)}
                min={appointmentDateBounds.min || undefined}
                max={appointmentDateBounds.max || undefined}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                aria-label="Print date range end"
              />
            </div>
            <p className="min-w-[12rem] pb-2 text-sm text-slate-600">
              <span className="font-semibold text-slate-800">{visitsForPrint.length}</span> visit
              {visitsForPrint.length === 1 ? "" : "s"} in this range
            </p>
            <button
              type="button"
              onClick={handlePrintPatientFile}
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-100"
            >
              Print patient file
            </button>
          </div>
        </div>

        {/* Header — mirrors patient chart modal overview card */}
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#16a349]/20 bg-gradient-to-br from-[#ecfdf5] via-white to-emerald-50/30 p-5 shadow-sm shadow-emerald-900/5 ring-1 ring-emerald-100/50">
          <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#16a349] to-[#13823d] text-2xl font-bold text-white shadow-lg shadow-emerald-900/20">
            {displayInitial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0d5c2e]">Medical record</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              {detail.first_name} {detail.last_name}
            </h1>
            <p className="mt-1 font-medium text-slate-700">{detail.phone}</p>
            {detail.email ? <p className="mt-0.5 text-sm text-slate-500">{detail.email}</p> : null}
            <p className="mt-2 text-sm font-medium text-slate-500">
              Patient ID <span className="font-semibold text-slate-700">#{detail.id}</span>
            </p>
            <Link
              href={`/doctor/patients/${detail.id}/history`}
              className="mt-3 inline-flex rounded-xl border border-[#16a349]/40 bg-[#ecfdf5] px-4 py-2 text-sm font-semibold text-[#0d5c2e] hover:bg-[#d1fae5]"
            >
              Bill history — preview &amp; print all visits
              {billVisitCount > 0 ? ` (${billVisitCount})` : ""}
            </Link>
          </div>
        </div>

        {billLoadError ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{billLoadError}</p>
        ) : null}

        {/* Visit history — opens detail in a side drawer (no inline expansion). */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Visit history</h2>
          <p className="text-sm text-slate-600">
            All appointments, most recent first. Select a row for chart notes and to preview or print that visit&apos;s patient bill.
          </p>

          {visitsNewestFirst.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-12 text-center">
              <p className="font-semibold text-slate-800">No visits on file yet</p>
              <p className="mt-2 text-sm text-slate-500">Appointments for this patient will appear here.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {visitsNewestFirst.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedVisit(a)}
                    className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white px-4 py-4 text-left shadow-sm transition hover:border-[#16a349]/25 hover:bg-slate-50/80 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
                      <span className="font-semibold text-slate-900">{formatMonthDayYear(a.appointment_date)}</span>
                      <span className="text-sm text-slate-600 tabular-nums">{a.start_time}</span>
                      <span className="text-sm text-slate-700">{a.service || "—"}</span>
                      <span className="text-sm text-slate-600">{a.provider || "—"}</span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadgeClass(a.status)}`}
                      >
                        {a.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-4">
                      <span className="text-sm font-medium text-slate-800">{pricePaidLabel(a.invoice)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <PatientDemographicsEditor
          patient={detail}
          intakeSavePath="/doctor/patient_intake/"
          detailPath="/doctor/patient_detail"
          onPatientUpdated={(refreshed) => setDetail(refreshed as PatientDetail)}
        />
      </div>

      <Sheet open={selectedVisit !== null} onOpenChange={(open) => !open && setSelectedVisit(null)}>
        {selectedVisit ? (
          <SheetContent
            side="right"
            showCloseButton
            className="flex h-full max-h-[100dvh] w-full max-w-[min(100vw,480px)] flex-col gap-0 overflow-hidden border-l border-slate-200 bg-white p-0 shadow-2xl sm:max-w-[480px]"
          >
            <div className="shrink-0 border-b border-slate-100 px-5 pb-4 pt-14">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Visit details</p>
              <p className="mt-1 text-xl font-bold tracking-tight text-slate-900">
                {formatMonthDayYear(selectedVisit.appointment_date)}
              </p>
              <p className="mt-2 text-sm font-medium text-slate-800">
                {selectedVisit.start_time}
                {selectedVisit.end_time ? ` – ${selectedVisit.end_time}` : ""}
              </p>
              <p className="mt-3 text-sm text-slate-700">{selectedVisit.service || "—"}</p>
              <p className="mt-1 text-sm text-slate-600">{selectedVisit.provider || "—"}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusBadgeClass(selectedVisit.status)}`}
                >
                  {selectedVisit.status.replace(/_/g, " ")}
                </span>
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-900">{pricePaidLabel(selectedVisit.invoice)}</p>
              {selectedVisit.invoice?.id ? (
                <button
                  type="button"
                  disabled={printingInvoiceId === selectedVisit.invoice.id}
                  onClick={() =>
                    void openBillPreview(selectedVisit.invoice!.id, selectedVisit.invoice!.status)
                  }
                  className="mt-3 w-full rounded-xl bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-60"
                >
                  {printingInvoiceId === selectedVisit.invoice.id
                    ? "Opening bill…"
                    : selectedVisit.invoice.status === "paid"
                      ? "Preview / reprint bill"
                      : "Preview bill"}
                </button>
              ) : (
                <p className="mt-3 text-xs text-slate-500">
                  No printable bill for this visit yet (billing may still be in progress).
                </p>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-6">
                <div className="max-h-[min(70vh,720px)] overflow-y-auto">
                  <ChartNoteReaderPanel
                    text={selectedVisit.clinical_handoff_notes ?? ""}
                    title="Chart note for the team"
                    meta={{
                      dateLabel: `${formatWeekdayMonthDayYear(selectedVisit.appointment_date)} at ${selectedVisit.start_time}${
                        selectedVisit.end_time ? ` – ${selectedVisit.end_time}` : ""
                      }`,
                      provider: selectedVisit.provider ?? undefined,
                      service: selectedVisit.service ?? undefined,
                    }}
                    emptyLabel="No handoff note for this visit."
                  />
                </div>

                {selectedVisit.visit?.doctor_notes?.trim() &&
                selectedVisit.visit.doctor_notes.trim() !== (selectedVisit.clinical_handoff_notes ?? "").trim() ? (
                  <div className="mt-6">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Visit chart (SOAP)</p>
                    <div className="mt-2 max-h-[min(50vh,480px)] overflow-y-auto">
                      <ChartNoteReaderPanel
                        text={selectedVisit.visit.doctor_notes}
                        title="Visit chart (SOAP)"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </SheetContent>
        ) : null}
      </Sheet>

      <PatientBillPortalModal bill={patientBillModal} onClose={() => setPatientBillModal(null)} />

      {/* Print-only layout — hidden until print; demographics + date-filtered visit narrative */}
      <div id="patient-file-print-root" className="hidden">
        <div className="pf-print-wrap">
          <header className="pf-print-header">
            <p className="pf-clinic-name">{CLINIC_PRINT_HEADER.name}</p>
            <p className="pf-clinic-line">{CLINIC_PRINT_HEADER.addressLine}</p>
            <p className="pf-clinic-line">Phone: {CLINIC_PRINT_HEADER.phoneDisplay}</p>
            <p className="pf-report-line">
              Report generated: {printGeneratedAt || formatNowMonthDayYearTime()}
            </p>
          </header>

          <p className="pf-patient-line">
            Patient: {detail.first_name} {detail.last_name} #{detail.id} DOB: {detail.date_of_birth || "—"}
          </p>
          <p className="pf-policy-line">Policy ID: Not on file in chart</p>

          <table className="pf-demo-table">
            <tbody>
              <tr>
                <td className="pf-demo-label">Phone</td>
                <td className="pf-demo-value">{detail.phone || "—"}</td>
              </tr>
              <tr>
                <td className="pf-demo-label">Email</td>
                <td className="pf-demo-value">{detail.email?.trim() ? detail.email : "—"}</td>
              </tr>
              <tr>
                <td className="pf-demo-label">Age</td>
                <td className="pf-demo-value">{formatPatientAge(detail.age)}</td>
              </tr>
              <tr>
                <td className="pf-demo-label">Marital</td>
                <td className="pf-demo-value">{formatMaritalStatus(detail.marital_status)}</td>
              </tr>
              <tr>
                <td className="pf-demo-label">Date established</td>
                <td className="pf-demo-value">{formatDemographicsDate(detail.date_established)}</td>
              </tr>
              <tr>
                <td className="pf-demo-label">Last seen</td>
                <td className="pf-demo-value">{formatDemographicsDate(detail.last_seen)}</td>
              </tr>
              <tr>
                <td className="pf-demo-label">Address</td>
                <td className="pf-demo-value">
                  {[detail.address_line1, detail.address_line2, detail.city_state_zip].filter(Boolean).join(", ") || "—"}
                </td>
              </tr>
              <tr>
                <td className="pf-demo-label">Emergency contact</td>
                <td className="pf-demo-value">
                  {detail.emergency_contact_name || detail.emergency_contact_phone
                    ? `${detail.emergency_contact_name}${detail.emergency_contact_phone ? ` · ${detail.emergency_contact_phone}` : ""}`
                    : "—"}
                </td>
              </tr>
            </tbody>
          </table>

          <p className="pf-muted">
            Visit notes below are limited to the selected print date range ({formatMonthDayYear(printStart)} –{" "}
            {formatMonthDayYear(printEnd)}), oldest to newest.
          </p>

          {visitsForPrint.length === 0 ? (
            <p className="pf-print-empty">No visits in the selected date range.</p>
          ) : (
            visitsForPrint.map((a) => {
              const v = a.visit;
              return (
                <article key={a.id} className="pf-visit-block">
                  <h3 className="pf-visit-heading">
                    {formatWeekdayMonthDayYear(a.appointment_date)} Provider: {a.provider || "—"}
                  </h3>
                  <p className="pf-visit-meta">Date of service: {formatUsSlashDate(a.appointment_date)}</p>
                  <p className="pf-visit-meta">NPI#: —</p>
                  <p className="pf-subheading">Subjective</p>
                  <div className="pf-note-print">
                    {a.clinical_handoff_notes?.trim() ||
                      "No subjective / handoff note recorded for this visit."}
                  </div>
                  {v?.reason_for_visit?.trim() ? (
                    <>
                      <p className="pf-subheading-sm">Reason for visit</p>
                      <div className="pf-note-print">{v.reason_for_visit}</div>
                    </>
                  ) : null}
                  {v?.diagnosis?.trim() ? (
                    <>
                      <p className="pf-subheading-sm">Diagnosis (billing)</p>
                      <div className="pf-note-print">{v.diagnosis}</div>
                    </>
                  ) : null}
                  {v?.doctor_notes?.trim() ? (
                    <>
                      <p className="pf-subheading-sm">Visit documentation</p>
                      <div className="pf-note-print">{v.doctor_notes}</div>
                    </>
                  ) : null}
                </article>
              );
            })
          )}

          <p className="pf-generated">
            Relief Chiropractic PC · Medical record summary · Printed {printGeneratedAt || formatNowMonthDayYearTime()}
          </p>
        </div>
      </div>
    </>
  );
}
