"use client";

import { DoctorSectionLabel } from "@/components/doctor-shell";
import { Loader } from "@/components/loader";
import { appointmentStatusPillClass } from "@/components/status-chip";
import { ApiError, apiDelete, apiGetAuth, apiPatch } from "@/lib/api";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm transition focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15";

type VisitHistoryLine = {
  service_name: string;
  billing_code: string;
  quantity: number;
  unit_price: string;
  line_total: string;
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
  provider_id: number;
  status: string;
  clinical_handoff_notes: string;
  can_edit_handoff_notes: boolean;
  visit: VisitHistory | null;
  invoice: { invoice_number: string; total_amount: string; status: string } | null;
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
  card_brand: string;
  card_last4: string;
  has_saved_card?: boolean;
  appointments: AppointmentHistoryRow[];
};

type Tab = "overview" | "intake" | "history";

function statusBadgeClass(status: string): string {
  return `${appointmentStatusPillClass(status)} ring-1 ring-black/[0.06]`;
}

export function PatientDetailModal({
  patientId,
  onClose,
  detailPath = "/doctor/patient_detail",
  onPatientDeleted,
}: {
  patientId: number | null;
  onClose: () => void;
  detailPath?: string;
  /** When set (e.g. admin chart), shows delete patient — server allows owner_admin and staff only. */
  onPatientDeleted?: () => void;
}) {
  const [detail, setDetail] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [savingIntake, setSavingIntake] = useState(false);
  const [intakeMsg, setIntakeMsg] = useState("");
  const [deletingPatient, setDeletingPatient] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [intakeForm, setIntakeForm] = useState({
    address_line1: "",
    address_line2: "",
    city_state_zip: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    date_of_birth: "",
  });

  const [portalReady, setPortalReady] = useState(false);
  /** Local text for “chart / handoff” notes per appointment row (synced when detail loads). */
  const [handoffEdits, setHandoffEdits] = useState<Record<number, string>>({});
  const [savingHandoffId, setSavingHandoffId] = useState<number | null>(null);
  const [handoffMsg, setHandoffMsg] = useState("");

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!detail?.appointments) return;
    const m: Record<number, string> = {};
    for (const a of detail.appointments) {
      m[a.id] = a.clinical_handoff_notes ?? "";
    }
    setHandoffEdits(m);
  }, [detail]);

  useEffect(() => {
    if (patientId === null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [patientId]);

  useEffect(() => {
    if (!patientId) {
      setDetail(null);
      setError("");
      setTab("overview");
      return;
    }
    setLoading(true);
    setError("");
    setDeleteError("");
    apiGetAuth<PatientDetail>(`${detailPath}/?patient_id=${patientId}`)
      .then((d) => {
        setDetail(d);
        setIntakeForm({
          address_line1: d.address_line1 || "",
          address_line2: d.address_line2 || "",
          city_state_zip: d.city_state_zip || "",
          emergency_contact_name: d.emergency_contact_name || "",
          emergency_contact_phone: d.emergency_contact_phone || "",
          date_of_birth: d.date_of_birth || "",
        });
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : "Could not load patient.");
        setDetail(null);
      })
      .finally(() => setLoading(false));
  }, [patientId, detailPath]);

  const intakeSavePath =
    detailPath === "/admin/patient_detail" ? "/admin/patient_intake/" : "/doctor/patient_intake/";
  const handoffSavePath =
    detailPath === "/admin/patient_detail" ? "/admin/appointment_handoff/" : "/doctor/appointment_handoff/";
  const canSaveIntake =
    detailPath === "/doctor/patient_detail" || detailPath === "/admin/patient_detail";

  const saveAppointmentHandoff = async (appointmentId: number) => {
    setSavingHandoffId(appointmentId);
    setHandoffMsg("");
    try {
      await apiPatch(handoffSavePath, {
        appointment_id: appointmentId,
        clinical_handoff_notes: handoffEdits[appointmentId] ?? "",
      });
      setHandoffMsg("Chart note saved.");
      if (patientId) {
        const refreshed = await apiGetAuth<PatientDetail>(`${detailPath}/?patient_id=${patientId}`);
        setDetail(refreshed);
      }
    } catch (e) {
      setHandoffMsg(e instanceof ApiError ? e.message : "Could not save chart note.");
    } finally {
      setSavingHandoffId(null);
    }
  };

  const saveIntake = async () => {
    if (!patientId || !canSaveIntake) {
      setIntakeMsg("Intake cannot be saved from this screen.");
      return;
    }
    setSavingIntake(true);
    setIntakeMsg("");
    try {
      await apiPatch(intakeSavePath, {
        patient_id: patientId,
        address_line1: intakeForm.address_line1,
        address_line2: intakeForm.address_line2,
        city_state_zip: intakeForm.city_state_zip,
        emergency_contact_name: intakeForm.emergency_contact_name,
        emergency_contact_phone: intakeForm.emergency_contact_phone,
        date_of_birth: intakeForm.date_of_birth || null,
      });
      setIntakeMsg("Saved.");
      const refreshed = await apiGetAuth<PatientDetail>(`${detailPath}/?patient_id=${patientId}`);
      setDetail(refreshed);
    } catch (e) {
      setIntakeMsg(e instanceof ApiError ? e.message : "Save failed.");
    } finally {
      setSavingIntake(false);
    }
  };

  const deletePatientRecord = async () => {
    if (!patientId || !onPatientDeleted) return;
    if (
      !window.confirm(
        `Permanently delete ${detail?.first_name ?? "this"} ${detail?.last_name ?? "patient"}?\n\n` +
          "This removes their chart and related appointments, visits, and billing rows from this system. It cannot be undone.",
      )
    ) {
      return;
    }
    setDeletingPatient(true);
    setDeleteError("");
    try {
      await apiDelete(`/patients/${patientId}/`);
      onPatientDeleted();
      onClose();
    } catch (e) {
      setDeleteError(e instanceof ApiError ? e.message : "Could not delete this patient.");
    } finally {
      setDeletingPatient(false);
    }
  };

  if (patientId === null) return null;
  if (!portalReady) return null;

  const tabs: { id: Tab; label: string; hint: string }[] = [
    { id: "overview", label: "Overview", hint: "Summary & demographics" },
    { id: "intake", label: "Patient intake", hint: "Address & contacts" },
    { id: "history", label: "Record history", hint: "Visits, chart notes & billing" },
  ];

  const displayInitial = (d: PatientDetail) =>
    (d.first_name?.trim().charAt(0) || d.last_name?.trim().charAt(0) || "?").toUpperCase();

  return createPortal(
    <div
      className="animate-overlay-enter fixed inset-0 z-[200] overflow-y-auto bg-slate-900/45 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="patient-modal-title"
    >
      <div className="flex min-h-[100dvh] items-center justify-center p-4 py-16 sm:py-20">
        <div
          className="animate-modal-enter relative max-h-[min(92vh,100dvh-8rem)] w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl shadow-slate-400/25 ring-1 ring-emerald-100/40"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="sticky top-0 z-10 border-b border-emerald-100/60 bg-gradient-to-br from-white via-white to-emerald-50/40 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#13823d]">Medical record</p>
              <h2 id="patient-modal-title" className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                Patient chart
              </h2>
              {detail && (
                <p className="mt-1 truncate text-sm text-slate-600">
                  {detail.first_name} {detail.last_name}
                  <span className="text-slate-400"> · </span>
                  <span className="font-medium text-slate-500">ID #{detail.id}</span>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl p-2 text-slate-500 transition hover:bg-emerald-50 hover:text-[#0d5c2e]"
              aria-label="Close"
            >
              <span className="block text-2xl leading-none">×</span>
            </button>
          </div>
          <div className="mt-4 flex gap-1 rounded-xl border border-slate-200/80 bg-slate-50/90 p-1 shadow-inner">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                title={t.hint}
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-lg px-2 py-2.5 text-center text-sm font-semibold transition sm:px-3 ${
                  tab === t.id
                    ? "bg-white text-[#0d5c2e] shadow-md shadow-emerald-900/5 ring-1 ring-emerald-100/80"
                    : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                }`}
              >
                <span className="hidden sm:inline">{t.label}</span>
                <span className="sm:hidden">
                  {t.id === "overview" ? "Info" : t.id === "intake" ? "Intake" : "History"}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[calc(min(92vh,100dvh-8rem)-10.5rem)] overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          {loading ? (
            <div className="py-8">
              <Loader variant="page" label="Loading chart" sublabel="Opening patient record…" />
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200/80 bg-rose-50/90 px-4 py-3 text-sm font-medium text-rose-800">
              {error}
            </div>
          ) : detail ? (
            <>
              {tab === "overview" && (
                <div className="animate-fade-in space-y-6">
                  <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#16a349]/20 bg-gradient-to-br from-[#ecfdf5] via-white to-emerald-50/30 p-5 shadow-sm shadow-emerald-900/5 ring-1 ring-emerald-100/50">
                    <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#16a349] to-[#13823d] text-2xl font-bold text-white shadow-lg shadow-emerald-900/20">
                      {displayInitial(detail)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                        {detail.first_name} {detail.last_name}
                      </p>
                      <p className="mt-1 font-medium text-slate-700">{detail.phone}</p>
                      {detail.email ? <p className="mt-0.5 text-sm text-slate-500">{detail.email}</p> : null}
                    </div>
                  </div>

                  <div>
                    <DoctorSectionLabel>Demographics & billing</DoctorSectionLabel>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/60 to-white p-4 shadow-sm">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Date of birth</p>
                        <p className="mt-1.5 font-semibold text-slate-900">{detail.date_of_birth || "—"}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/60 to-white p-4 shadow-sm">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Card on file</p>
                        <p className="mt-1.5 font-semibold text-slate-900">
                          {detail.has_saved_card || detail.card_last4
                            ? `${(detail.card_brand || "Card").toUpperCase()} ·••• ${detail.card_last4}`
                            : "None on file"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <DoctorSectionLabel>Contact & emergency</DoctorSectionLabel>
                    <div className="grid gap-3">
                      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Address</p>
                        <p className="mt-1.5 leading-relaxed text-slate-800">
                          {[detail.address_line1, detail.address_line2, detail.city_state_zip].filter(Boolean).join(", ") ||
                            "Not on file — add under Patient intake."}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Emergency contact</p>
                        <p className="mt-1.5 text-slate-800">
                          {detail.emergency_contact_name || detail.emergency_contact_phone
                            ? `${detail.emergency_contact_name}${detail.emergency_contact_phone ? ` · ${detail.emergency_contact_phone}` : ""}`
                            : "Not on file — add under Patient intake."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {onPatientDeleted && (
                    <div className="rounded-2xl border border-rose-200/80 bg-rose-50/50 p-4 ring-1 ring-rose-100/60">
                      <p className="text-sm font-semibold text-rose-900">Danger zone</p>
                      <p className="mt-1 text-xs leading-relaxed text-rose-800/90">
                        Owner and staff accounts can remove this patient from the database. Doctors cannot delete patients from here.
                      </p>
                      {deleteError && (
                        <p className="mt-2 text-xs font-medium text-rose-800">{deleteError}</p>
                      )}
                      <button
                        type="button"
                        disabled={deletingPatient}
                        onClick={() => void deletePatientRecord()}
                        className="mt-3 rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:opacity-50"
                      >
                        {deletingPatient ? "Deleting…" : "Delete patient record…"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {tab === "intake" && (
                <div className="animate-fade-in space-y-5">
                  <div className="rounded-2xl border border-emerald-100/80 bg-emerald-50/40 px-4 py-3 text-sm leading-relaxed text-slate-700 ring-1 ring-emerald-100/50">
                    Update demographics and emergency contacts to match the clinic intake form. Changes save to the
                    patient record.
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="sm:col-span-2">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Street address
                      </span>
                      <input
                        className={inputClass}
                        value={intakeForm.address_line1}
                        onChange={(e) => setIntakeForm((f) => ({ ...f, address_line1: e.target.value }))}
                      />
                    </label>
                    <label className="sm:col-span-2">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Apt / suite
                      </span>
                      <input
                        className={inputClass}
                        value={intakeForm.address_line2}
                        onChange={(e) => setIntakeForm((f) => ({ ...f, address_line2: e.target.value }))}
                      />
                    </label>
                    <label className="sm:col-span-2">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        City, state, ZIP
                      </span>
                      <input
                        className={inputClass}
                        placeholder="St Joseph, MI 49085"
                        value={intakeForm.city_state_zip}
                        onChange={(e) => setIntakeForm((f) => ({ ...f, city_state_zip: e.target.value }))}
                      />
                    </label>
                    <label>
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Emergency name
                      </span>
                      <input
                        className={inputClass}
                        value={intakeForm.emergency_contact_name}
                        onChange={(e) => setIntakeForm((f) => ({ ...f, emergency_contact_name: e.target.value }))}
                      />
                    </label>
                    <label>
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Emergency phone
                      </span>
                      <input
                        className={inputClass}
                        value={intakeForm.emergency_contact_phone}
                        onChange={(e) => setIntakeForm((f) => ({ ...f, emergency_contact_phone: e.target.value }))}
                      />
                    </label>
                    <label className="sm:col-span-2">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Date of birth
                      </span>
                      <input
                        type="date"
                        className={`${inputClass} max-w-xs`}
                        value={intakeForm.date_of_birth}
                        onChange={(e) => setIntakeForm((f) => ({ ...f, date_of_birth: e.target.value }))}
                      />
                    </label>
                  </div>
                  {canSaveIntake && (
                    <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                      <button
                        type="button"
                        onClick={saveIntake}
                        disabled={savingIntake}
                        className="rounded-xl bg-[#16a349] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-900/15 hover:bg-[#13823d] disabled:opacity-50"
                      >
                        {savingIntake ? "Saving…" : "Save intake"}
                      </button>
                      {intakeMsg ? (
                        <span
                          className={`text-sm font-medium ${intakeMsg === "Saved." ? "text-[#166534]" : "text-slate-600"}`}
                        >
                          {intakeMsg}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              )}

              {tab === "history" && (
                <div className="animate-fade-in space-y-4">
                  <DoctorSectionLabel>Patient record history</DoctorSectionLabel>
                  <p className="text-sm leading-relaxed text-slate-600">
                    Each visit is expandable. <strong>Chart note for the team</strong> stays on that appointment so another
                    doctor can read it tomorrow. Visit notes and diagnosis come from completed encounters; procedures show what
                    was billed.
                  </p>
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
                    <div className="rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/50 px-5 py-10 text-center">
                      <p className="font-medium text-slate-700">No appointments on file</p>
                      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
                        When this patient books or you add visits, they will appear here with clinical and billing detail.
                      </p>
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {detail.appointments.map((a) => (
                        <li
                          key={a.id}
                          className="overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/40 text-sm shadow-sm ring-1 ring-slate-100/80"
                        >
                          <details className="group">
                            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3.5 marker:hidden [&::-webkit-details-marker]:hidden">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                  <span className="font-bold tabular-nums text-slate-900">{a.appointment_date}</span>
                                  <span className="text-slate-300">·</span>
                                  <span className="font-semibold text-[#0d5c2e]">{a.start_time}</span>
                                  {a.end_time ? (
                                    <>
                                      <span className="text-slate-300">–</span>
                                      <span className="text-slate-600">{a.end_time}</span>
                                    </>
                                  ) : null}
                                </div>
                                {a.provider ? (
                                  <p className="mt-1 text-xs font-medium text-slate-600">
                                    Provider: <span className="text-[#16a349]">{a.provider}</span>
                                  </p>
                                ) : null}
                                {a.service ? <p className="mt-0.5 text-slate-500">{a.service}</p> : null}
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <span
                                  className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${statusBadgeClass(a.status)}`}
                                >
                                  {a.status.replace(/_/g, " ")}
                                </span>
                                <span className="text-xs font-semibold text-slate-400 group-open:hidden">Expand</span>
                                <span className="hidden text-xs font-semibold text-slate-400 group-open:inline">Hide</span>
                              </div>
                            </summary>
                            <div className="space-y-4 border-t border-slate-200/80 bg-white/80 px-4 py-4">
                              <div>
                                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                  Chart note for the team (handoff)
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {a.can_edit_handoff_notes
                                    ? "Visible on this patient’s chart to every provider. Saved on this appointment only."
                                    : "Only the assigned provider or admin can edit this note. You can still read it for continuity of care."}
                                </p>
                                {a.can_edit_handoff_notes ? (
                                  <div className="mt-2 space-y-2">
                                    <textarea
                                      className={`${inputClass} min-h-[88px] resize-y`}
                                      value={handoffEdits[a.id] ?? ""}
                                      onChange={(e) =>
                                        setHandoffEdits((prev) => ({ ...prev, [a.id]: e.target.value }))
                                      }
                                      placeholder="e.g. Follow-up on L4 tenderness; patient prefers morning slots; coordinate with massage…"
                                      aria-label={`Chart handoff note for appointment ${a.id}`}
                                    />
                                    <button
                                      type="button"
                                      disabled={savingHandoffId === a.id}
                                      onClick={() => void saveAppointmentHandoff(a.id)}
                                      className="rounded-xl bg-[#16a349] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
                                    >
                                      {savingHandoffId === a.id ? "Saving…" : "Save chart note"}
                                    </button>
                                  </div>
                                ) : (
                                  <p className="mt-2 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-slate-800">
                                    {a.clinical_handoff_notes?.trim() ? a.clinical_handoff_notes : "—"}
                                  </p>
                                )}
                              </div>

                              {a.visit ? (
                                <div className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-3">
                                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                    Completed visit record
                                  </p>
                                  {a.visit.reason_for_visit?.trim() ? (
                                    <p className="mt-2 text-xs">
                                      <span className="font-semibold text-slate-600">Reason: </span>
                                      <span className="text-slate-800">{a.visit.reason_for_visit}</span>
                                    </p>
                                  ) : null}
                                  {a.visit.diagnosis?.trim() ? (
                                    <p className="mt-2 text-xs">
                                      <span className="font-semibold text-slate-600">Diagnosis (bill): </span>
                                      <span className="text-slate-800">{a.visit.diagnosis}</span>
                                    </p>
                                  ) : null}
                                  {a.visit.doctor_notes?.trim() ? (
                                    <p className="mt-2 text-xs">
                                      <span className="font-semibold text-slate-600">Visit notes: </span>
                                      <span className="whitespace-pre-wrap text-slate-800">{a.visit.doctor_notes}</span>
                                    </p>
                                  ) : null}
                                  {a.visit.rendered_services.length > 0 ? (
                                    <div className="mt-3">
                                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                        Procedures billed
                                      </p>
                                      <ul className="mt-1.5 space-y-1 text-xs text-slate-700">
                                        {a.visit.rendered_services.map((line, idx) => (
                                          <li key={idx} className="flex flex-wrap gap-x-2 border-b border-slate-200/60 py-1 last:border-0">
                                            <span className="font-mono text-[11px] text-slate-500">
                                              {line.billing_code || "—"}
                                            </span>
                                            <span>{line.service_name}</span>
                                            <span className="text-slate-500">
                                              ×{line.quantity} · ${line.line_total}
                                            </span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  ) : null}
                                  {a.visit.completed_at ? (
                                    <p className="mt-2 text-[10px] text-slate-400">
                                      Completed {a.visit.completed_at}
                                    </p>
                                  ) : null}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500">No completed visit documentation on file yet for this slot.</p>
                              )}

                              {a.invoice ? (
                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                  <span className="font-semibold text-slate-700">Invoice</span>
                                  <span className="font-mono">{a.invoice.invoice_number}</span>
                                  <span>·</span>
                                  <span>${a.invoice.total_amount}</span>
                                  <span>·</span>
                                  <span className="uppercase">{a.invoice.status}</span>
                                </div>
                              ) : null}
                            </div>
                          </details>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
