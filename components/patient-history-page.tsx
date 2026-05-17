"use client";

import Link from "next/link";
import { Loader } from "@/components/loader";
import { appointmentStatusPillClass } from "@/components/status-chip";
import { ApiError, apiGetAuth, apiPatch } from "@/lib/api";
import { ChartNoteReader, ChartNoteWorkspace } from "@/components/chart-note-document";
import { formatMonthDayYear, formatWeekdayMonthDayYear } from "@/lib/format-date";
import { useEffect, useMemo, useState } from "react";

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

export function PatientHistoryPage({
  patientId,
  detailPath,
  handoffSavePath,
  backHref,
}: {
  patientId: number;
  detailPath: string;
  handoffSavePath: string;
  backHref: string;
}) {
  const [detail, setDetail] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeHistoryAppointmentId, setActiveHistoryAppointmentId] = useState<number | null>(null);
  const [handoffEdits, setHandoffEdits] = useState<Record<number, string>>({});
  const [savingHandoffId, setSavingHandoffId] = useState<number | null>(null);
  const [handoffMsg, setHandoffMsg] = useState("");

  const loadDetail = async () => {
    setLoading(true);
    setError("");
    try {
      const d = await apiGetAuth<PatientDetail>(`${detailPath}/?patient_id=${patientId}`);
      setDetail(d);
      const m: Record<number, string> = {};
      for (const a of d.appointments) m[a.id] = a.clinical_handoff_notes ?? "";
      setHandoffEdits(m);
      setActiveHistoryAppointmentId((prev) => {
        if (!d.appointments.length) return null;
        if (prev && d.appointments.some((a) => a.id === prev)) return prev;
        return d.appointments[0].id;
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

  const active = useMemo(
    () => detail?.appointments.find((a) => a.id === activeHistoryAppointmentId) || detail?.appointments[0] || null,
    [detail, activeHistoryAppointmentId],
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
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0d5c2e]">Medical record</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              {detail.first_name} {detail.last_name} - Patient record history
            </h1>
            <p className="mt-1 text-sm text-slate-600">{detail.phone}</p>
          </div>
          <Link
            href={backHref}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to dashboard
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
          <p className="mt-2 text-sm text-slate-500">When visits are created, the full chart and billing history will appear here.</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[20rem,1fr]">
          <aside className="max-h-[80vh] space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/70 p-2">
            {detail.appointments.map((a) => {
              const selected = a.id === active?.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setActiveHistoryAppointmentId(a.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    selected
                      ? "border-emerald-300 bg-white shadow-sm ring-1 ring-emerald-200"
                      : "border-transparent bg-transparent hover:border-slate-200 hover:bg-white/80"
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900">{formatMonthDayYear(a.appointment_date)}</p>
                  <p className="mt-0.5 text-xs font-medium text-[#0d5c2e]">
                    {a.start_time}
                    {a.end_time ? ` - ${a.end_time}` : ""}
                  </p>
                  {a.provider ? <p className="mt-1 text-xs text-slate-600">{a.provider}</p> : null}
                  <span
                    className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusBadgeClass(a.status)}`}
                  >
                    {a.status.replace(/_/g, " ")}
                  </span>
                </button>
              );
            })}
          </aside>

          {active ? (
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <p className="text-lg font-bold tracking-tight text-slate-900">
                    {formatMonthDayYear(active.appointment_date)} at {active.start_time}
                    {active.end_time ? ` - ${active.end_time}` : ""}
                  </p>
                  {active.service ? <p className="mt-1 text-sm text-slate-600">{active.service}</p> : null}
                  {active.provider ? (
                    <p className="mt-1 text-sm text-slate-600">
                      Provider: <span className="font-semibold text-[#0d5c2e]">{active.provider}</span>
                    </p>
                  ) : null}
                </div>
                <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${statusBadgeClass(active.status)}`}>
                  {active.status.replace(/_/g, " ")}
                </span>
              </div>

              <ChartNoteWorkspace
                value={handoffEdits[active.id] ?? ""}
                onChange={(next) => setHandoffEdits((prev) => ({ ...prev, [active.id]: next }))}
                editable={active.can_edit_handoff_notes}
                saving={savingHandoffId === active.id}
                onSave={() => void saveAppointmentHandoff(active.id)}
                meta={{
                  dateLabel: `${formatWeekdayMonthDayYear(active.appointment_date)} at ${active.start_time}${
                    active.end_time ? ` - ${active.end_time}` : ""
                  }`,
                  provider: active.provider ?? undefined,
                  service: active.service ?? undefined,
                }}
                lineItems={active.visit?.rendered_services}
                inputClassName={inputClass}
              />
              {active.visit ? (
                <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Completed visit record</p>
                  {active.visit.reason_for_visit?.trim() ? (
                    <p className="mt-3 text-sm">
                      <span className="font-semibold text-slate-600">Reason: </span>
                      <span className="text-slate-800">{active.visit.reason_for_visit}</span>
                    </p>
                  ) : null}
                  {active.visit.diagnosis?.trim() ? (
                    <p className="mt-2 text-sm">
                      <span className="font-semibold text-slate-600">Diagnosis (bill): </span>
                      <span className="text-slate-800">{active.visit.diagnosis}</span>
                    </p>
                  ) : null}
                  {active.visit.doctor_notes?.trim() ? (
                    <div className="mt-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Visit chart (SOAP)</p>
                      <div className="mt-2 max-h-[min(50vh,480px)] overflow-y-auto">
                        <ChartNoteReader text={active.visit.doctor_notes} />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {active.invoice ? (
                <div className="rounded-xl border border-slate-200/90 bg-white p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Invoice details</p>
                  <div className="mt-2 grid gap-1 text-sm text-slate-700">
                    <p>Invoice: {active.invoice.invoice_number}</p>
                    <p>Status: {active.invoice.status.replace(/_/g, " ")}</p>
                    <p>Subtotal: ${active.invoice.subtotal}</p>
                    {active.invoice.discount !== "0.00" ? <p>Professional discount (internal): -${active.invoice.discount}</p> : null}
                    {active.invoice.professional_discount_reason?.trim() ? (
                      <p className="text-xs text-slate-500">Reason: {active.invoice.professional_discount_reason}</p>
                    ) : null}
                    {active.invoice.credit_applied_total !== "0.00" ? (
                      <p>Credit used from wallet (internal): -${active.invoice.credit_applied_total}</p>
                    ) : null}
                    <p className="font-semibold text-slate-900">Amount due: ${active.invoice.total_amount}</p>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
