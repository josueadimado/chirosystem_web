"use client";

import { Loader } from "@/components/loader";
import { appointmentStatusPillClass } from "@/components/status-chip";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ApiError, apiGetAuth } from "@/lib/api";
import { formatMonthDayYear } from "@/lib/format-date";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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

function parseMoney(s: string | undefined): number {
  if (s == null || s === "") return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function pricePaidLabel(inv: AppointmentHistoryRow["invoice"]): string {
  if (!inv) return "—";
  const st = (inv.status || "").toLowerCase();
  if (st === "paid") return `Paid $${inv.total_amount}`;
  if (st === "void") return "—";
  return `Billed $${inv.total_amount} (${st.replace(/_/g, " ")})`;
}

/** Matches clinic bill header defaults (ClinicSettings solo row) — same branding as printed invoices; no extra API. */
const CLINIC_PRINT_HEADER = {
  name: "Relief Chiropractic",
  phoneDisplay: "+1 (269) 408-0303",
  addressLines: ["3830 M 139, Suite 119", "St Joseph, MI 49085"],
  logoSrc: "/images/clinic-reception.png",
} as const;

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

function formatAmountBilled(inv: AppointmentHistoryRow["invoice"]): string {
  if (!inv) return "—";
  const st = (inv.status || "").toLowerCase();
  if (st === "void") return "—";
  return `$${inv.total_amount}`;
}

function formatAmountPaid(inv: AppointmentHistoryRow["invoice"]): string {
  if (!inv) return "—";
  const st = (inv.status || "").toLowerCase();
  if (st === "void") return "—";
  if (st === "paid") return `$${inv.total_amount}`;
  return "$0.00";
}

/** Invoice payload does not include payment tender; describe settlement status for records requests. */
function paymentMethodLabel(inv: AppointmentHistoryRow["invoice"]): string {
  if (!inv) return "—";
  const st = (inv.status || "").toLowerCase();
  if (st === "void") return "Void";
  if (st === "paid") return "Paid";
  return `Unpaid (${st.replace(/_/g, " ")})`;
}

export default function DoctorPatientRecordPage() {
  const params = useParams<{ patientId: string }>();
  const id = Number(params.patientId);
  const [detail, setDetail] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedVisit, setSelectedVisit] = useState<AppointmentHistoryRow | null>(null);
  const [docStamp] = useState(() =>
    typeof window !== "undefined"
      ? new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
      : "",
  );

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

  /** All appointments, most recent first — full visit history on screen. */
  const visitsNewestFirst = useMemo(() => {
    if (!detail?.appointments?.length) return [];
    return [...detail.appointments].sort(compareAppointmentsNewestFirst);
  }, [detail]);

  const billing = useMemo(() => {
    if (!detail?.appointments?.length) {
      return { totalBilled: 0, totalPaid: 0, outstanding: 0, visitCount: 0 };
    }
    let totalBilled = 0;
    let totalPaid = 0;
    let outstanding = 0;
    for (const a of detail.appointments) {
      const inv = a.invoice;
      if (!inv) continue;
      const st = (inv.status || "").toLowerCase();
      if (st === "void") continue;
      const amt = parseMoney(inv.total_amount);
      totalBilled += amt;
      if (st === "paid") totalPaid += amt;
      else outstanding += amt;
    }
    return {
      totalBilled,
      totalPaid,
      outstanding,
      visitCount: detail.appointments.length,
    };
  }, [detail]);

  /** All chart appointments (for legal / insurance printout billing table). */
  const allVisitsSorted = useMemo(() => {
    if (!detail?.appointments?.length) return [];
    return [...detail.appointments].sort(compareAppointmentsChronological);
  }, [detail]);

  const billingTotalsPrint = useMemo(() => {
    let totalBilled = 0;
    let totalPaid = 0;
    for (const a of allVisitsSorted) {
      const inv = a.invoice;
      if (!inv) continue;
      const st = (inv.status || "").toLowerCase();
      if (st === "void") continue;
      const amt = parseMoney(inv.total_amount);
      totalBilled += amt;
      if (st === "paid") totalPaid += amt;
    }
    return { totalBilled, totalPaid };
  }, [allVisitsSorted]);

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
      margin: 14mm 12mm 22mm 12mm;
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
        line-height: 1.45;
      }
      #patient-file-print-root * {
        box-shadow: none !important;
        text-shadow: none !important;
        background: transparent !important;
        color: #000 !important;
        border-color: #000 !important;
      }
      #patient-file-print-root img {
        filter: grayscale(100%);
        max-height: 56px;
        width: auto;
      }
      #patient-file-print-root .pf-clinic-bar {
        display: flex;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 24px;
        padding-bottom: 16px;
        border-bottom: 1px solid #000;
        page-break-after: always;
      }
      #patient-file-print-root .pf-patient-name-top {
        font-size: 20px;
        font-weight: 700;
        margin: 0 0 16px 0;
      }
      #patient-file-print-root .pf-section-title {
        font-size: 16px;
        font-weight: 700;
        margin: 0 0 12px 0;
        text-transform: none;
      }
      #patient-file-print-root .pf-print-break-before {
        page-break-before: always;
      }
      #patient-file-print-root .pf-print-note-block {
        page-break-inside: avoid;
        margin-bottom: 16px;
      }
      #patient-file-print-root .pf-table-wrap {
        margin-top: 8px;
      }
      #patient-file-print-root table.pf-billing-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      #patient-file-print-root table.pf-billing-table th,
      #patient-file-print-root table.pf-billing-table td {
        border: 1px solid #000;
        padding: 8px 10px;
        text-align: left;
        vertical-align: top;
      }
      #patient-file-print-root table.pf-billing-table th {
        font-weight: 700;
      }
      #patient-file-print-root table.pf-billing-table tfoot td {
        font-weight: 700;
      }
      #patient-file-print-root .pf-muted {
        font-size: 11px;
        color: #000 !important;
        opacity: 0.85;
      }
      #patient-file-print-root .pf-note-head {
        font-weight: 700;
        margin-bottom: 6px;
      }
      #patient-file-print-root .pf-note-body {
        white-space: pre-wrap;
        margin: 0;
      }
      #patient-file-print-root .pf-print-demographics p {
        margin: 0 0 10px 0;
      }
      #patient-file-print-root .pf-generated {
        margin-top: 24px;
        font-size: 11px;
        opacity: 0.8;
      }
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: printStyles }} />

      <div id="patient-record-print-root" className="print:hidden space-y-8">
        {/* Top bar: back + print */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/doctor/patients"
            className="print:hidden inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            ← Back to patients
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="print:hidden rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-100"
          >
            Print patient file
          </button>
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
          </div>
        </div>

        {/* Visit history — opens detail in a side drawer (no inline expansion). */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Visit history</h2>
          <p className="text-sm text-slate-600">
            All appointments, most recent first. Select a row to read chart and handoff notes in the panel on the right.
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

        {/* Demographics — read-only */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Demographics</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Date of birth</p>
              <p className="mt-1.5 font-semibold text-slate-900">{detail.date_of_birth || "—"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:col-span-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Address</p>
              <p className="mt-1.5 leading-relaxed text-slate-800">
                {[detail.address_line1, detail.address_line2, detail.city_state_zip].filter(Boolean).join(", ") || "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:col-span-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Emergency contact</p>
              <p className="mt-1.5 text-slate-800">
                {detail.emergency_contact_name || detail.emergency_contact_phone
                  ? `${detail.emergency_contact_name}${detail.emergency_contact_phone ? ` · ${detail.emergency_contact_phone}` : ""}`
                  : "—"}
              </p>
            </div>
          </div>
        </section>

        {/* Billing summary — derived from past visits & invoices on this chart */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Billing summary</h2>
          <p className="text-sm text-slate-600">
            Totals are calculated from invoices linked to appointments on this chart.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/60 to-white p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Total visits</p>
              <p className="mt-1.5 text-xl font-bold text-slate-900">{billing.visitCount}</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/60 to-white p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Total billed</p>
              <p className="mt-1.5 text-xl font-bold text-slate-900">${billing.totalBilled.toFixed(2)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/60 to-white p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Total paid</p>
              <p className="mt-1.5 text-xl font-bold text-slate-900">${billing.totalPaid.toFixed(2)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/60 to-white p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Outstanding</p>
              <p className="mt-1.5 text-xl font-bold text-slate-900">${billing.outstanding.toFixed(2)}</p>
            </div>
          </div>
        </section>
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
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-6">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Handoff note</p>
                  <div className="mt-2 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-relaxed text-slate-800">
                    {selectedVisit.clinical_handoff_notes?.trim()
                      ? selectedVisit.clinical_handoff_notes
                      : "No handoff note for this visit."}
                  </div>
                </div>

                {selectedVisit.visit?.doctor_notes?.trim() ? (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Chart / visit notes</p>
                    <div className="mt-2 whitespace-pre-wrap rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-800">
                      {selectedVisit.visit.doctor_notes}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </SheetContent>
        ) : null}
      </Sheet>

      {/* Legal / insurance printout — hidden on screen; print CSS swaps visibility */}
      <div id="patient-file-print-root" className="hidden">
        <header className="pf-clinic-bar">
          <img src={CLINIC_PRINT_HEADER.logoSrc} alt="Relief Chiropractic" width={120} height={48} />
          <div>
            <div style={{ fontSize: "18px", fontWeight: 700 }}>{CLINIC_PRINT_HEADER.name}</div>
            <div style={{ marginTop: "6px" }}>{CLINIC_PRINT_HEADER.phoneDisplay}</div>
            <div style={{ marginTop: "4px" }}>
              {CLINIC_PRINT_HEADER.addressLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          </div>
        </header>

        <section className="pf-print-demographics">
          <p className="pf-patient-name-top">
            {detail.first_name} {detail.last_name}
          </p>
          <h2 className="pf-section-title">Patient demographics</h2>
          <p>
            <strong>Date of birth:</strong> {detail.date_of_birth || "—"}
          </p>
          <p>
            <strong>Phone:</strong> {detail.phone}
          </p>
          <p>
            <strong>Email:</strong> {detail.email || "—"}
          </p>
          <p>
            <strong>Address:</strong>{" "}
            {[detail.address_line1, detail.address_line2, detail.city_state_zip].filter(Boolean).join(", ") || "—"}
          </p>
          <p>
            <strong>Emergency contact:</strong>{" "}
            {detail.emergency_contact_name || detail.emergency_contact_phone
              ? `${detail.emergency_contact_name}${detail.emergency_contact_phone ? ` · ${detail.emergency_contact_phone}` : ""}`
              : "—"}
          </p>
          <p>
            <strong>Patient ID:</strong> {detail.id}
          </p>
        </section>

        <section className="pf-print-billing pf-print-break-before">
          <h2 className="pf-section-title">Billing summary</h2>
          <p className="pf-muted">
            All visits on file (invoice amounts as recorded). Payment column reflects invoice settlement status; card/cash
            tender is stored in the clinic billing system when collected.
          </p>
          <div className="pf-table-wrap">
            <table className="pf-billing-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Service</th>
                  <th>Provider</th>
                  <th>Amount billed</th>
                  <th>Amount paid</th>
                  <th>Payment</th>
                </tr>
              </thead>
              <tbody>
                {allVisitsSorted.map((a) => (
                  <tr key={a.id}>
                    <td>{formatMonthDayYear(a.appointment_date)}</td>
                    <td>{a.service || "—"}</td>
                    <td>{a.provider || "—"}</td>
                    <td>{formatAmountBilled(a.invoice)}</td>
                    <td>{formatAmountPaid(a.invoice)}</td>
                    <td>{paymentMethodLabel(a.invoice)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Totals</td>
                  <td>${billingTotalsPrint.totalBilled.toFixed(2)}</td>
                  <td>${billingTotalsPrint.totalPaid.toFixed(2)}</td>
                  <td>—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="pf-print-notes pf-print-break-before">
          <h2 className="pf-section-title">Visit notes (chart / handoff)</h2>
          <p className="pf-muted">Provider team notes recorded on each appointment.</p>
          {allVisitsSorted.map((a) => (
            <article key={a.id} className="pf-print-note-block">
              <div className="pf-note-head">
                {formatMonthDayYear(a.appointment_date)}
                {a.provider ? ` · ${a.provider}` : ""}
              </div>
              <p className="pf-note-body">{a.clinical_handoff_notes?.trim() || "No chart note recorded for this visit."}</p>
            </article>
          ))}
          <p className="pf-generated">
            Generated {docStamp || "—"} · Relief Chiropractic medical records summary
          </p>
        </section>
      </div>
    </>
  );
}
