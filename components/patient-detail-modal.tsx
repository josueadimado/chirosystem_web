"use client";

import { DoctorSectionLabel } from "@/components/doctor-shell";
import { Loader } from "@/components/loader";
import { AppointmentStatusBadge, appointmentHistoryRowClass } from "@/components/status-chip";
import { Checkbox } from "@/components/ui/checkbox";
import { ApiError, apiDelete, apiGetAuth, apiPatch } from "@/lib/api";
import { ChartNoteReader, ChartNoteWorkspace } from "@/components/chart-note-document";
import { VisitDiagnosisDisplay } from "@/components/visit-diagnosis-display";
import { UsDateInput } from "@/components/us-date-input";
import { formatMonthDayYear, formatWeekdayMonthDayYear } from "@/lib/format-date";
import {
  formatDemographicsDate,
  formatMaritalStatus,
  formatPatientAge,
} from "@/lib/patient-demographics";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import {
  communicationPrefsFromDetail,
  PatientCommunicationPrefsFields,
  type NotifyChannel,
} from "@/components/patient-communication-prefs";
import { PatientDocumentsPanel } from "@/components/patient-documents-panel";

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
  provider: string | null;
  provider_id: number;
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
  email: string;
  date_of_birth: string | null;
  marital_status?: string;
  age?: number | null;
  date_established?: string | null;
  date_established_override?: string | null;
  first_appointment_date?: string | null;
  last_seen?: string | null;
  clinical_access?: "full" | "read_only";
  clinical_access_message?: string;
  address_line1: string;
  address_line2: string;
  city_state_zip: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  card_brand: string;
  card_last4: string;
  has_saved_card?: boolean;
  /** When true, public booking skips “must book intake chiro first” for this patient (migrated / established). */
  online_chiro_intake_waived?: boolean;
  sms_consent?: boolean;
  sms_consent_at?: string | null;
  notify_booking?: string;
  notify_reminders?: string;
  notify_bills?: string;
  appointments: AppointmentHistoryRow[];
};

type Tab = "overview" | "intake" | "history" | "documents";

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
  const router = useRouter();
  const [detail, setDetail] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [savingIntake, setSavingIntake] = useState(false);
  const [intakeMsg, setIntakeMsg] = useState("");
  const [deletingPatient, setDeletingPatient] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [intakeForm, setIntakeForm] = useState({
    first_name: "",
    last_name: "",
    phone: undefined as string | undefined,
    email: "",
    address_line1: "",
    address_line2: "",
    city_state_zip: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    date_of_birth: "",
    date_established: "",
    marital_status: "",
    online_chiro_intake_waived: false,
    sms_consent: false,
    notify_booking: "sms" as NotifyChannel,
    notify_reminders: "sms" as NotifyChannel,
    notify_bills: "email" as NotifyChannel,
  });
  const isAdminChart = detailPath === "/admin/patient_detail";

  const [portalReady, setPortalReady] = useState(false);
  /** Local text for “chart / handoff” notes per appointment row (synced when detail loads). */
  const [handoffEdits, setHandoffEdits] = useState<Record<number, string>>({});
  const [savingHandoffId, setSavingHandoffId] = useState<number | null>(null);
  const [handoffMsg, setHandoffMsg] = useState("");
  const [activeHistoryAppointmentId, setActiveHistoryAppointmentId] = useState<number | null>(null);
  const [activeIntakeSection, setActiveIntakeSection] = useState<"contact" | "address" | "emergency" | "dob">("contact");

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
    setActiveHistoryAppointmentId((prev) => {
      if (!detail.appointments.length) return null;
      if (prev && detail.appointments.some((a) => a.id === prev)) return prev;
      return detail.appointments[0].id;
    });
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
    if (patientId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [patientId, onClose]);

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
          first_name: d.first_name || "",
          last_name: d.last_name || "",
          phone: d.phone?.trim() ? d.phone : undefined,
          email: d.email || "",
          address_line1: d.address_line1 || "",
          address_line2: d.address_line2 || "",
          city_state_zip: d.city_state_zip || "",
          emergency_contact_name: d.emergency_contact_name || "",
          emergency_contact_phone: d.emergency_contact_phone || "",
          date_of_birth: d.date_of_birth || "",
          date_established: d.date_established_override || "",
          marital_status: d.marital_status || "",
          online_chiro_intake_waived: d.online_chiro_intake_waived === true,
          sms_consent: d.sms_consent === true,
          ...communicationPrefsFromDetail(d),
        });
        if (detailPath === "/admin/patient_detail") {
          setTab("intake");
        }
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
  const fullHistoryHref =
    patientId && detailPath === "/admin/patient_detail"
      ? `/admin/patients/${patientId}/history`
      : patientId
        ? `/doctor/patients/${patientId}/history`
        : null;

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
    if (readOnlyChart) {
      setIntakeMsg("This patient is outside your care type — front desk or the other provider must save changes.");
      return;
    }
    const canEditContact = isAdminChart || (isDoctorChart && !readOnlyChart);
    if (canEditContact) {
      if (!intakeForm.first_name.trim() || !intakeForm.last_name.trim()) {
        setIntakeMsg("First and last name are required.");
        return;
      }
      if (!intakeForm.phone || !isValidPhoneNumber(intakeForm.phone)) {
        setIntakeMsg("Enter a valid phone number for this patient.");
        return;
      }
    }
    if (isAdminChart) {
      const emerg = intakeForm.emergency_contact_phone.trim();
      if (emerg && !isValidPhoneNumber(emerg)) {
        setIntakeMsg("Emergency contact phone doesn’t look valid. Clear it or enter a full number.");
        return;
      }
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
        marital_status: intakeForm.marital_status || "",
        ...(canEditContact
          ? {
              first_name: intakeForm.first_name.trim(),
              last_name: intakeForm.last_name.trim(),
              phone: intakeForm.phone,
              email: intakeForm.email.trim(),
            }
          : {}),
        notify_booking: intakeForm.notify_booking,
        notify_reminders: intakeForm.notify_reminders,
        notify_bills: intakeForm.notify_bills,
        ...(isAdminChart
          ? {
              online_chiro_intake_waived: intakeForm.online_chiro_intake_waived,
              sms_consent: intakeForm.sms_consent,
              date_established: intakeForm.date_established.trim() ? intakeForm.date_established : null,
            }
          : {}),
      });
      setIntakeMsg("Saved.");
      const refreshed = await apiGetAuth<PatientDetail>(`${detailPath}/?patient_id=${patientId}`);
      setDetail(refreshed);
      setIntakeForm({
        first_name: refreshed.first_name || "",
        last_name: refreshed.last_name || "",
        phone: refreshed.phone?.trim() ? refreshed.phone : undefined,
        email: refreshed.email || "",
        address_line1: refreshed.address_line1 || "",
        address_line2: refreshed.address_line2 || "",
        city_state_zip: refreshed.city_state_zip || "",
        emergency_contact_name: refreshed.emergency_contact_name || "",
        emergency_contact_phone: refreshed.emergency_contact_phone || "",
        date_of_birth: refreshed.date_of_birth || "",
        date_established: refreshed.date_established_override || "",
        marital_status: refreshed.marital_status || "",
        online_chiro_intake_waived: refreshed.online_chiro_intake_waived === true,
        sms_consent: refreshed.sms_consent === true,
        ...communicationPrefsFromDetail(refreshed),
      });
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

  /** Doctor chart opens full-page record instead of an in-modal history tab (modal is too small). */
  const isDoctorChart = detailPath === "/doctor/patient_detail";
  const readOnlyChart = isDoctorChart && detail?.clinical_access === "read_only";

  useEffect(() => {
    if (isDoctorChart && tab === "history") setTab("overview");
  }, [isDoctorChart, tab]);

  if (patientId === null) return null;
  if (!portalReady) return null;

  const intakeDirty =
    detail !== null &&
    (intakeForm.address_line1 !== (detail.address_line1 || "") ||
      intakeForm.address_line2 !== (detail.address_line2 || "") ||
      intakeForm.city_state_zip !== (detail.city_state_zip || "") ||
      intakeForm.emergency_contact_name !== (detail.emergency_contact_name || "") ||
      intakeForm.emergency_contact_phone !== (detail.emergency_contact_phone || "") ||
      intakeForm.date_of_birth !== (detail.date_of_birth || "") ||
      intakeForm.date_established !== (detail.date_established_override || "") ||
      intakeForm.marital_status !== (detail.marital_status || "") ||
      intakeForm.first_name !== (detail.first_name || "") ||
      intakeForm.last_name !== (detail.last_name || "") ||
      intakeForm.phone !== (detail.phone?.trim() ? detail.phone : undefined) ||
      intakeForm.email !== (detail.email || "") ||
      intakeForm.notify_booking !== communicationPrefsFromDetail(detail).notify_booking ||
      intakeForm.notify_reminders !== communicationPrefsFromDetail(detail).notify_reminders ||
      intakeForm.notify_bills !== communicationPrefsFromDetail(detail).notify_bills ||
      (isAdminChart &&
        (intakeForm.online_chiro_intake_waived !== (detail.online_chiro_intake_waived === true) ||
          intakeForm.sms_consent !== (detail.sms_consent === true))));

  const intakeSectionButtonClass = (isActive: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-semibold transition ${
      isActive
        ? "bg-emerald-100 text-[#0d5c2e] ring-1 ring-emerald-200"
        : "bg-slate-100 text-slate-600 hover:bg-slate-200/80"
    }`;

  const tabs: { id: Tab; label: string; shortLabel: string; hint: string }[] = isDoctorChart
    ? [
        { id: "overview", label: "Overview", shortLabel: "Info", hint: "Summary & contacts" },
        { id: "intake", label: "Demographics", shortLabel: "Form", hint: "Name, phone, address, DOB" },
        { id: "documents", label: "Documents", shortLabel: "Docs", hint: "Insurance cards, X-rays & uploaded files" },
      ]
    : [
        { id: "overview", label: "Overview", shortLabel: "Info", hint: "Summary (read-only)" },
        {
          id: "intake",
          label: "Edit patient",
          shortLabel: "Edit",
          hint: "Name, phone, address, DOB, preferences",
        },
        { id: "history", label: "Visit history", shortLabel: "Visits", hint: "Notes & billing by visit" },
        { id: "documents", label: "Documents", shortLabel: "Docs", hint: "Insurance cards, X-rays & uploaded files" },
      ];

  const displayInitial = (d: PatientDetail) =>
    (d.first_name?.trim().charAt(0) || d.last_name?.trim().charAt(0) || "?").toUpperCase();

  return createPortal(
    <div
      className="animate-overlay-enter fixed inset-0 z-[400] overflow-y-auto bg-slate-900/45 backdrop-blur-[2px]"
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
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#13823d]/90">Medical record</p>
              <h2 id="patient-modal-title" className="mt-0.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                Patient chart
              </h2>
              {detail && (
                <p className="mt-1.5 truncate text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">
                    {detail.first_name} {detail.last_name}
                  </span>
                  <span className="text-slate-300"> · </span>
                  <span className="tabular-nums text-slate-500">ID {detail.id}</span>
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
          <div className="mt-4 flex flex-wrap items-stretch gap-2">
            <div className="flex min-w-0 flex-1 gap-1 rounded-xl border border-slate-200/80 bg-slate-50/90 p-1 shadow-inner">
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
                  <span className="sm:hidden">{t.shortLabel}</span>
                </button>
              ))}
            </div>
            {isDoctorChart && patientId ? (
              <Link
                href={`/doctor/patients/${patientId}/record`}
                className="inline-flex shrink-0 items-center justify-center rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-3 py-2 text-sm font-semibold text-[#0d5c2e] shadow-inner transition hover:bg-emerald-100/90"
              >
                View full record →
              </Link>
            ) : null}
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
                  {isAdminChart ? (
                    <div className="flex flex-col gap-3 rounded-2xl border border-[#16a349]/30 bg-[#ecfdf5] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-slate-700">
                        <span className="font-semibold text-slate-900">Need to change name, phone, or address?</span> Use the{" "}
                        <span className="font-semibold text-[#0d5c2e]">Edit patient</span> tab — all profile fields save together.
                      </p>
                      <button
                        type="button"
                        onClick={() => setTab("intake")}
                        className="shrink-0 rounded-xl bg-[#16a349] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13823d]"
                      >
                        Edit patient →
                      </button>
                    </div>
                  ) : null}
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

                  {fullHistoryHref ? (
                    <div className="rounded-2xl border-2 border-[#16a349]/35 bg-gradient-to-br from-[#ecfdf5] via-white to-emerald-50/40 p-5 shadow-sm ring-1 ring-emerald-100/60">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-[#166534]">Visit history</p>
                      <p className="mt-2 text-sm leading-relaxed text-slate-700">
                        Chart notes, SOAP records, and billing for every visit live on the full history page — with a side panel so you
                        never scroll to the bottom of the screen.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          router.push(fullHistoryHref);
                        }}
                        className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[#16a349] px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#13823d] sm:w-auto"
                      >
                        Open full visit history →
                      </button>
                    </div>
                  ) : null}

                  {readOnlyChart && detail.clinical_access_message ? (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                      {detail.clinical_access_message}
                    </p>
                  ) : null}

                  {(!readOnlyChart &&
                    (!detail.date_of_birth ||
                    !(detail.address_line1 || "").trim() ||
                    !(detail.city_state_zip || "").trim())) && (
                    <div className="flex flex-col gap-3 rounded-2xl border border-sky-200/80 bg-sky-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm leading-snug text-sky-950">
                        <span className="font-semibold">Demographics incomplete.</span>{" "}
                        <span className="text-sky-900/90">Add date of birth, address, or emergency contact when you can.</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => setTab("intake")}
                        className="shrink-0 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-sky-900 shadow-sm ring-1 ring-sky-200/80 transition hover:bg-sky-100/80"
                      >
                        Open demographics →
                      </button>
                    </div>
                  )}

                  <div>
                    <DoctorSectionLabel>Demographics & billing</DoctorSectionLabel>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/60 to-white p-4 shadow-sm">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Date of birth</p>
                        <p className="mt-1.5 font-semibold text-slate-900">
                          {detail.date_of_birth ? formatMonthDayYear(detail.date_of_birth) : "—"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/60 to-white p-4 shadow-sm">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Age</p>
                        <p className="mt-1.5 font-semibold tabular-nums text-slate-900">{formatPatientAge(detail.age)}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/60 to-white p-4 shadow-sm">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Marital</p>
                        <p className="mt-1.5 font-semibold text-slate-900">{formatMaritalStatus(detail.marital_status)}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/60 to-white p-4 shadow-sm">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Date established</p>
                        <p className="mt-1.5 font-semibold tabular-nums text-slate-900">
                          {formatDemographicsDate(detail.date_established)}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {detail.date_established_override ? "Custom date" : "From first appointment"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/60 to-white p-4 shadow-sm">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Last seen</p>
                        <p className="mt-1.5 font-semibold tabular-nums text-slate-900">
                          {formatDemographicsDate(detail.last_seen)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/60 to-white p-4 shadow-sm">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Card on file</p>
                        <p className="mt-1.5 font-semibold text-slate-900">
                          {detail.has_saved_card || detail.card_last4
                            ? `${(detail.card_brand || "Card").toUpperCase()} ·••• ${detail.card_last4}`
                            : "None on file"}
                        </p>
                      </div>
                      {detail.online_chiro_intake_waived ? (
                        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 shadow-sm sm:col-span-2">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">Online booking</p>
                          <p className="mt-1.5 text-sm font-medium text-amber-950">
                            Intake-first rule waived — patient may book regular chiropractic visits online.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <DoctorSectionLabel>Contact & emergency</DoctorSectionLabel>
                    <div className="grid gap-3">
                      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Address</p>
                        <p className="mt-1.5 leading-relaxed text-slate-800">
                          {[detail.address_line1, detail.address_line2, detail.city_state_zip].filter(Boolean).join(", ") ||
                            "Not on file — add under Demographics."}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Emergency contact</p>
                        <p className="mt-1.5 text-slate-800">
                          {detail.emergency_contact_name || detail.emergency_contact_phone
                            ? `${detail.emergency_contact_name}${detail.emergency_contact_phone ? ` · ${detail.emergency_contact_phone}` : ""}`
                            : "Not on file — add under Demographics."}
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
                  {readOnlyChart ? (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                      {detail.clinical_access_message || "Read-only chart for this patient."}
                    </p>
                  ) : (
                  <div className="rounded-xl border border-emerald-100/80 bg-emerald-50/35 px-4 py-3 text-sm leading-relaxed text-slate-700 ring-1 ring-emerald-100/40">
                    {isAdminChart ? (
                      <>
                        Update any patient information below, then{" "}
                        <span className="font-semibold text-slate-900">Save patient record</span> at the bottom. If another
                        patient already has the same name, date of birth, and phone, you&apos;ll see an alert and nothing will
                        be saved.
                      </>
                    ) : (
                      <>
                        Edit name, phone, email, and demographics below, then{" "}
                        <span className="font-semibold text-slate-900">Save demographics</span> at the bottom.
                      </>
                    )}
                  </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-white p-2 shadow-sm">
                    {!readOnlyChart ? (
                      <button
                        type="button"
                        onClick={() => setActiveIntakeSection("contact")}
                        className={intakeSectionButtonClass(activeIntakeSection === "contact")}
                      >
                        Name & phone
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setActiveIntakeSection("address")}
                      className={intakeSectionButtonClass(activeIntakeSection === "address")}
                    >
                      Address
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveIntakeSection("emergency")}
                      className={intakeSectionButtonClass(activeIntakeSection === "emergency")}
                    >
                      Emergency contact
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveIntakeSection("dob")}
                      className={intakeSectionButtonClass(activeIntakeSection === "dob")}
                    >
                      Date of birth
                    </button>
                  </div>

                  {!readOnlyChart ? (
                    <section
                      className={`rounded-2xl border p-4 transition ${
                        activeIntakeSection === "contact"
                          ? "border-emerald-200 bg-emerald-50/30 ring-1 ring-emerald-100"
                          : "border-slate-200/80 bg-white"
                      }`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Name & contact</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Legal name, mobile number, and email on file for reminders and receipts.
                      </p>
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        <label>
                          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            First name
                          </span>
                          <input
                            className={inputClass}
                            value={intakeForm.first_name}
                            onFocus={() => setActiveIntakeSection("contact")}
                            onChange={(e) => setIntakeForm((f) => ({ ...f, first_name: e.target.value }))}
                          />
                        </label>
                        <label>
                          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Last name
                          </span>
                          <input
                            className={inputClass}
                            value={intakeForm.last_name}
                            onFocus={() => setActiveIntakeSection("contact")}
                            onChange={(e) => setIntakeForm((f) => ({ ...f, last_name: e.target.value }))}
                          />
                        </label>
                        <label className="sm:col-span-2">
                          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Phone
                          </span>
                          <PhoneInput
                            international
                            defaultCountry="US"
                            value={intakeForm.phone}
                            onChange={(v) => setIntakeForm((f) => ({ ...f, phone: v }))}
                            className="phone-input-root"
                            numberInputProps={{
                              className: inputClass,
                              onFocus: () => setActiveIntakeSection("contact"),
                            }}
                          />
                        </label>
                        <label className="sm:col-span-2">
                          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Email
                          </span>
                          <input
                            type="email"
                            className={inputClass}
                            value={intakeForm.email}
                            onFocus={() => setActiveIntakeSection("contact")}
                            onChange={(e) => setIntakeForm((f) => ({ ...f, email: e.target.value }))}
                            placeholder="optional"
                          />
                        </label>
                      </div>
                    </section>
                  ) : null}

                  <div className="grid gap-4">
                    <section
                      className={`rounded-2xl border p-4 transition ${
                        activeIntakeSection === "address"
                          ? "border-emerald-200 bg-emerald-50/30 ring-1 ring-emerald-100"
                          : "border-slate-200/80 bg-white"
                      }`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Address</p>
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        <label className="sm:col-span-2">
                          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Street address
                          </span>
                          <input
                            className={inputClass}
                            value={intakeForm.address_line1}
                            onFocus={() => setActiveIntakeSection("address")}
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
                            onFocus={() => setActiveIntakeSection("address")}
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
                            onFocus={() => setActiveIntakeSection("address")}
                            onChange={(e) => setIntakeForm((f) => ({ ...f, city_state_zip: e.target.value }))}
                          />
                        </label>
                      </div>
                    </section>

                    <section
                      className={`rounded-2xl border p-4 transition ${
                        activeIntakeSection === "emergency"
                          ? "border-emerald-200 bg-emerald-50/30 ring-1 ring-emerald-100"
                          : "border-slate-200/80 bg-white"
                      }`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Emergency contact</p>
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        <label>
                          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Emergency name
                          </span>
                          <input
                            className={inputClass}
                            value={intakeForm.emergency_contact_name}
                            onFocus={() => setActiveIntakeSection("emergency")}
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
                            onFocus={() => setActiveIntakeSection("emergency")}
                            onChange={(e) => setIntakeForm((f) => ({ ...f, emergency_contact_phone: e.target.value }))}
                          />
                        </label>
                      </div>
                    </section>

                    <section
                      className={`rounded-2xl border p-4 transition ${
                        activeIntakeSection === "dob"
                          ? "border-emerald-200 bg-emerald-50/30 ring-1 ring-emerald-100"
                          : "border-slate-200/80 bg-white"
                      }`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date of birth & marital</p>
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        <label>
                          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Date of birth
                          </span>
                          <UsDateInput
                            className={`${inputClass} max-w-xs`}
                            value={intakeForm.date_of_birth}
                            onFocus={() => setActiveIntakeSection("dob")}
                            onChange={(iso) => setIntakeForm((f) => ({ ...f, date_of_birth: iso }))}
                            aria-label="Date of birth"
                          />
                        </label>
                        <label>
                          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Marital (Y / N)
                          </span>
                          <select
                            className={inputClass}
                            value={intakeForm.marital_status}
                            onFocus={() => setActiveIntakeSection("dob")}
                            onChange={(e) => setIntakeForm((f) => ({ ...f, marital_status: e.target.value }))}
                          >
                            <option value="">— Not set —</option>
                            <option value="Y">Y — Married</option>
                            <option value="N">N — Not married</option>
                          </select>
                        </label>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Use MM/DD/YYYY (e.g. 05/09/1971). You can paste from a spreadsheet or chart. Age and last seen
                        update automatically from visits.
                      </p>
                    </section>

                    {isAdminChart && !readOnlyChart ? (
                      <section className="rounded-2xl border border-slate-200/80 bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date established</p>
                        <div className="mt-3">
                          <label>
                            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Established with clinic
                            </span>
                            <UsDateInput
                              className={`${inputClass} max-w-xs`}
                              value={intakeForm.date_established}
                              onChange={(iso) => setIntakeForm((f) => ({ ...f, date_established: iso }))}
                              aria-label="Date established with clinic"
                            />
                          </label>
                          <p className="mt-2 text-xs leading-relaxed text-slate-500">
                            {detail.first_appointment_date ? (
                              <>
                                First appointment in system: {formatDemographicsDate(detail.first_appointment_date)}.
                                Leave this blank to use that date.
                              </>
                            ) : (
                              <>Override when the real start date differs from the first booked visit.</>
                            )}{" "}
                            Format: MM/DD/YYYY — paste OK.
                          </p>
                        </div>
                      </section>
                    ) : null}
                  </div>
                  {!readOnlyChart ? (
                    <PatientCommunicationPrefsFields
                      prefs={{
                        notify_booking: intakeForm.notify_booking,
                        notify_reminders: intakeForm.notify_reminders,
                        notify_bills: intakeForm.notify_bills,
                      }}
                      smsConsent={
                        isAdminChart ? intakeForm.sms_consent : detail.sms_consent === true
                      }
                      showSmsConsentNote
                      onChange={(p) =>
                        setIntakeForm((f) => ({
                          ...f,
                          notify_booking: p.notify_booking,
                          notify_reminders: p.notify_reminders,
                          notify_bills: p.notify_bills,
                        }))
                      }
                    />
                  ) : null}
                  {isAdminChart && !readOnlyChart ? (
                    <section className="space-y-3 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Clinic preferences</p>
                      <div className="flex gap-3">
                        <Checkbox
                          id="online-chiro-intake-waived"
                          checked={intakeForm.online_chiro_intake_waived}
                          onCheckedChange={(c) =>
                            setIntakeForm((f) => ({ ...f, online_chiro_intake_waived: c === true }))
                          }
                          className="mt-0.5"
                        />
                        <label htmlFor="online-chiro-intake-waived" className="cursor-pointer text-sm leading-relaxed text-slate-700">
                          <span className="font-semibold text-slate-900">Skip “intake first” for online chiro booking</span>
                          <span className="mt-1 block font-normal text-slate-600">
                            Lets this patient book regular chiropractic online without a completed intake visit on file.
                          </span>
                        </label>
                      </div>
                      <div className="flex gap-3">
                        <Checkbox
                          id="sms-consent"
                          checked={intakeForm.sms_consent}
                          onCheckedChange={(c) => setIntakeForm((f) => ({ ...f, sms_consent: c === true }))}
                          className="mt-0.5"
                        />
                        <label htmlFor="sms-consent" className="cursor-pointer text-sm leading-relaxed text-slate-700">
                          <span className="font-semibold text-slate-900">SMS appointment reminders allowed</span>
                          <span className="mt-1 block font-normal text-slate-600">
                            Turn on if the patient agreed to text reminders (required for TCPA).{" "}
                            {detail.sms_consent_at ? (
                              <span className="text-slate-500">
                                Last recorded: {formatMonthDayYear(detail.sms_consent_at.slice(0, 10))}
                              </span>
                            ) : (
                              <span className="text-slate-500">Not yet recorded from online booking.</span>
                            )}
                          </span>
                        </label>
                      </div>
                    </section>
                  ) : null}
                  {canSaveIntake && !readOnlyChart && (
                    <div className="sticky bottom-0 z-10 -mx-5 border-t border-slate-200/80 bg-white/95 px-5 py-3 backdrop-blur sm:-mx-6 sm:px-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs font-medium text-slate-600">
                          {intakeDirty ? "You have unsaved changes." : "All changes saved."}
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              detail &&
                              setIntakeForm({
                                first_name: detail.first_name || "",
                                last_name: detail.last_name || "",
                                phone: detail.phone?.trim() ? detail.phone : undefined,
                                email: detail.email || "",
                                address_line1: detail.address_line1 || "",
                                address_line2: detail.address_line2 || "",
                                city_state_zip: detail.city_state_zip || "",
                                emergency_contact_name: detail.emergency_contact_name || "",
                                emergency_contact_phone: detail.emergency_contact_phone || "",
                                date_of_birth: detail.date_of_birth || "",
                                date_established: detail.date_established_override || "",
                                marital_status: detail.marital_status || "",
                                online_chiro_intake_waived: detail.online_chiro_intake_waived === true,
                                sms_consent: detail.sms_consent === true,
                                ...communicationPrefsFromDetail(detail),
                              })
                            }
                            disabled={!intakeDirty || savingIntake}
                            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
                          >
                            Reset changes
                          </button>
                          <button
                            type="button"
                            onClick={saveIntake}
                            disabled={savingIntake || !intakeDirty}
                            className="rounded-xl bg-[#16a349] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-900/15 hover:bg-[#13823d] disabled:opacity-50"
                          >
                            {savingIntake
                              ? "Saving…"
                              : isAdminChart
                                ? "Save patient record"
                                : "Save demographics"}
                          </button>
                          {intakeMsg ? (
                            <span
                              className={`max-w-md text-sm font-medium ${
                                intakeMsg === "Saved." ? "text-[#166534]" : "text-rose-800"
                              }`}
                              role={intakeMsg === "Saved." ? undefined : "alert"}
                            >
                              {intakeMsg}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === "history" && !isDoctorChart && fullHistoryHref && (
                <div className="animate-fade-in space-y-5 py-4 text-center">
                  <DoctorSectionLabel>Visit history</DoctorSectionLabel>
                  <p className="mx-auto max-w-md text-sm leading-relaxed text-slate-600">
                    This popup is too small for chart notes and billing detail. Open the dedicated history page — tap any visit and the
                    chart slides in from the right.
                  </p>
                  <p className="text-sm font-medium text-slate-800">
                    {detail.appointments.length} visit{detail.appointments.length === 1 ? "" : "s"} on file
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      router.push(fullHistoryHref);
                    }}
                    className="inline-flex items-center justify-center rounded-xl bg-[#16a349] px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#13823d]"
                  >
                    Open full visit history →
                  </button>
                </div>
              )}

              {tab === "history" && !isDoctorChart && !fullHistoryHref && (
                <div className="animate-fade-in space-y-4">
                  <DoctorSectionLabel>Visit history</DoctorSectionLabel>
                  {detail.appointments.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/50 px-5 py-10 text-center">
                      <p className="font-medium text-slate-700">No appointments on file</p>
                    </div>
                  ) : (
                    <div className="grid gap-4 lg:grid-cols-[16rem,1fr]">
                      <aside className="space-y-2 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-2">
                        {detail.appointments.map((a) => {
                          const selected = a.id === activeHistoryAppointmentId;
                          return (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => setActiveHistoryAppointmentId(a.id)}
                              className={`w-full rounded-xl border-2 px-3 py-3 text-left transition ${
                                selected
                                  ? "border-[#16a349] bg-[#ecfdf5]/60 shadow-md ring-2 ring-[#16a349]/35"
                                  : a.status === "no_show"
                                    ? "border-red-200 bg-red-50/70 hover:border-red-300 hover:bg-red-50"
                                    : "border-transparent bg-transparent hover:border-slate-200 hover:bg-white/80"
                              }`}
                            >
                              <p className="text-sm font-semibold text-slate-900">{formatMonthDayYear(a.appointment_date)}</p>
                              <p className="mt-0.5 text-xs font-medium text-[#0d5c2e]">
                                {a.start_time}
                                {a.end_time ? ` - ${a.end_time}` : ""}
                              </p>
                              {a.provider ? <p className="mt-1 text-xs text-slate-600">{a.provider}</p> : null}
                              <AppointmentStatusBadge status={a.status} size="xs" className="mt-2" />
                            </button>
                          );
                        })}
                      </aside>

                      {(() => {
                        const active =
                          detail.appointments.find((a) => a.id === activeHistoryAppointmentId) || detail.appointments[0];
                        if (!active) return null;
                        return (
                          <section
                            className={`space-y-4 rounded-2xl border p-4 sm:p-5 ${appointmentHistoryRowClass(active.status)}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100/80 pb-3">
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
                              <AppointmentStatusBadge status={active.status} size="sm" />
                            </div>

                            <ChartNoteWorkspace
                              value={handoffEdits[active.id] ?? ""}
                              onChange={(next) =>
                                setHandoffEdits((prev) => ({ ...prev, [active.id]: next }))
                              }
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
                                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                  Completed visit record
                                </p>
                                {active.visit.reason_for_visit?.trim() ? (
                                  <p className="mt-3 text-sm">
                                    <span className="font-semibold text-slate-600">Reason: </span>
                                    <span className="text-slate-800">{active.visit.reason_for_visit}</span>
                                  </p>
                                ) : null}
                                {active.visit.diagnosis?.trim() || (active.visit.diagnoses?.length ?? 0) > 0 ? (
                                  <div className="mt-2 text-sm">
                                    <p className="font-semibold text-slate-600">Diagnosis (bill)</p>
                                    <VisitDiagnosisDisplay
                                      diagnosis={active.visit.diagnosis}
                                      diagnoses={active.visit.diagnoses}
                                      className="mt-1 text-slate-800"
                                    />
                                  </div>
                                ) : null}
                                {active.visit.doctor_notes?.trim() ? (
                                  <div className="mt-4">
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Visit chart (SOAP)</p>
                                    <div className="mt-2 max-h-[min(50vh,480px)] overflow-y-auto">
                                      <ChartNoteReader text={active.visit.doctor_notes} />
                                    </div>
                                  </div>
                                ) : null}
                                {active.visit.rendered_services.length > 0 ? (
                                  <div className="mt-3">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                      Procedures billed
                                    </p>
                                    <ul className="mt-1.5 space-y-1 text-xs text-slate-700">
                                      {active.visit.rendered_services.map((line, idx) => (
                                        <li key={idx} className="flex flex-wrap gap-x-2 border-b border-slate-200/60 py-1.5 last:border-0">
                                          <span className="font-mono text-[11px] text-slate-500">{line.billing_code || "—"}</span>
                                          <span>{line.service_name}</span>
                                          {line.charges_patient === false ? (
                                            <span className="text-[10px] font-semibold uppercase text-indigo-700">
                                              (insurance line · no patient charge)
                                            </span>
                                          ) : null}
                                          <span className="text-slate-500">
                                            ×{line.quantity} · ${line.line_total}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}
                                {active.visit.completed_at ? (
                                  <p className="mt-2 text-[10px] text-slate-400">Completed {active.visit.completed_at}</p>
                                ) : null}
                              </div>
                            ) : (
                              <p className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-sm text-slate-500">
                                No completed visit documentation on file yet for this appointment.
                              </p>
                            )}

                            {active.invoice ? (
                              <div className="space-y-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-slate-700">Invoice</span>
                                  <span className="font-mono">{active.invoice.invoice_number}</span>
                                  <span>·</span>
                                  <span>${active.invoice.total_amount}</span>
                                  <span>·</span>
                                  <span className="uppercase">{active.invoice.status}</span>
                                </div>
                                {parseFloat(active.invoice.discount || "0") > 0 ? (
                                  <div className="space-y-0.5 text-emerald-700">
                                    <p>
                                      Professional discount (internal): ${active.invoice.discount} (
                                      {active.invoice.subtotal} before discount)
                                    </p>
                                    {active.invoice.professional_discount_reason?.trim() ? (
                                      <p className="text-slate-600">
                                        Reason: {active.invoice.professional_discount_reason}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}
                                {parseFloat(active.invoice.credit_applied_total || "0") > 0 ? (
                                  <p className="text-emerald-700">
                                    Credit used from wallet (internal): ${active.invoice.credit_applied_total}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </section>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
              {tab === "documents" && (
                <PatientDocumentsPanel
                  patientId={detail.id}
                  basePath={isAdminChart ? "/admin" : "/doctor"}
                />
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
