"use client";

import { ApiError, apiGetAuth, apiPatch } from "@/lib/api";
import {
  formatDemographicsDate,
  formatMaritalStatus,
  formatPatientAge,
} from "@/lib/patient-demographics";
import { UsDateInput } from "@/components/us-date-input";
import { useEffect, useMemo, useState } from "react";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import {
  communicationPrefsFromDetail,
  PatientCommunicationPrefsFields,
  type PatientCommunicationPrefs,
} from "@/components/patient-communication-prefs";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm transition focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15";

export type PatientDemographicsSource = {
  id: number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  date_of_birth: string | null;
  marital_status?: string;
  age?: number | null;
  date_established?: string | null;
  date_established_override?: string | null;
  first_appointment_date?: string | null;
  last_seen?: string | null;
  address_line1: string;
  address_line2: string;
  city_state_zip: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  notify_booking?: string;
  notify_reminders?: string;
  notify_bills?: string;
  sms_consent?: boolean;
};

type IntakeForm = {
  first_name: string;
  last_name: string;
  phone: string | undefined;
  email: string;
  date_of_birth: string;
  date_established: string;
  marital_status: string;
  address_line1: string;
  address_line2: string;
  city_state_zip: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
};

function detailToForm(
  d: PatientDemographicsSource,
  includeDateEstablished: boolean,
  includeContactFields: boolean,
): IntakeForm {
  return {
    first_name: includeContactFields ? d.first_name || "" : "",
    last_name: includeContactFields ? d.last_name || "" : "",
    phone: includeContactFields && d.phone?.trim() ? d.phone : undefined,
    email: includeContactFields ? d.email || "" : "",
    date_of_birth: d.date_of_birth || "",
    date_established: includeDateEstablished ? d.date_established_override || "" : "",
    marital_status: d.marital_status || "",
    address_line1: d.address_line1 || "",
    address_line2: d.address_line2 || "",
    city_state_zip: d.city_state_zip || "",
    emergency_contact_name: d.emergency_contact_name || "",
    emergency_contact_phone: d.emergency_contact_phone || "",
  };
}

function formDirty(
  form: IntakeForm,
  patient: PatientDemographicsSource,
  includeDateEstablished: boolean,
  includeContactFields: boolean,
): boolean {
  const baseline = detailToForm(patient, includeDateEstablished, includeContactFields);
  return (Object.keys(baseline) as (keyof IntakeForm)[]).some((k) => form[k] !== baseline[k]);
}

type Props = {
  patient: PatientDemographicsSource;
  /** e.g. `/doctor/patient_intake/` or `/admin/patient_intake/` */
  intakeSavePath: string;
  /** Reload full patient after save */
  detailPath: string;
  onPatientUpdated: (patient: PatientDemographicsSource) => void;
  /** Chiropractic vs massage: view-only when patient is outside this doctor's care type */
  readOnly?: boolean;
  readOnlyMessage?: string;
  /** Owner/staff: allow editing date established (e.g. imported patients). */
  canEditDateEstablished?: boolean;
  /** Name, phone, and email (doctors with full chart access). */
  includeContactFields?: boolean;
  /** Booking / reminder / bill channel preferences (doctor + admin). */
  showCommunicationPrefs?: boolean;
};

/**
 * Editable demographics for doctors and front desk (contact, DOB, marital, address, emergency).
 * Age, date established, and last seen stay read-only (calculated by the server).
 */
export function PatientDemographicsEditor({
  patient,
  intakeSavePath,
  detailPath,
  onPatientUpdated,
  readOnly = false,
  readOnlyMessage = "",
  canEditDateEstablished = false,
  includeContactFields = false,
  showCommunicationPrefs = true,
}: Props) {
  const [form, setForm] = useState<IntakeForm>(() =>
    detailToForm(patient, canEditDateEstablished, includeContactFields),
  );
  const [commPrefs, setCommPrefs] = useState<PatientCommunicationPrefs>(() =>
    communicationPrefsFromDetail(patient),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setForm(detailToForm(patient, canEditDateEstablished, includeContactFields));
    setCommPrefs(communicationPrefsFromDetail(patient));
  }, [patient, canEditDateEstablished, includeContactFields]);

  const baselineComm = useMemo(() => communicationPrefsFromDetail(patient), [patient]);

  const dirty = useMemo(() => {
    if (formDirty(form, patient, canEditDateEstablished, includeContactFields)) return true;
    if (!showCommunicationPrefs || readOnly) return false;
    return (
      commPrefs.notify_booking !== baselineComm.notify_booking ||
      commPrefs.notify_reminders !== baselineComm.notify_reminders ||
      commPrefs.notify_bills !== baselineComm.notify_bills
    );
  }, [
    form,
    patient,
    canEditDateEstablished,
    includeContactFields,
    showCommunicationPrefs,
    readOnly,
    commPrefs,
    baselineComm,
  ]);

  const save = async () => {
    if (includeContactFields) {
      if (!form.first_name.trim() || !form.last_name.trim()) {
        setMessage("First and last name are required.");
        return;
      }
      if (!form.phone || !isValidPhoneNumber(form.phone)) {
        setMessage("Enter a valid phone number for this patient.");
        return;
      }
    }
    setSaving(true);
    setMessage("");
    try {
      await apiPatch(intakeSavePath, {
        patient_id: patient.id,
        ...(includeContactFields
          ? {
              first_name: form.first_name.trim(),
              last_name: form.last_name.trim(),
              phone: form.phone,
              email: form.email.trim(),
            }
          : {}),
        address_line1: form.address_line1,
        address_line2: form.address_line2,
        city_state_zip: form.city_state_zip,
        emergency_contact_name: form.emergency_contact_name,
        emergency_contact_phone: form.emergency_contact_phone,
        date_of_birth: form.date_of_birth || null,
        marital_status: form.marital_status || "",
        ...(canEditDateEstablished
          ? { date_established: form.date_established.trim() ? form.date_established : null }
          : {}),
        ...(showCommunicationPrefs && !readOnly
          ? {
              notify_booking: commPrefs.notify_booking,
              notify_reminders: commPrefs.notify_reminders,
              notify_bills: commPrefs.notify_bills,
            }
          : {}),
      });
      const refreshed = await apiGetAuth<PatientDemographicsSource>(
        `${detailPath}/?patient_id=${patient.id}`,
      );
      onPatientUpdated(refreshed);
      setMessage("Patient information saved.");
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Could not save patient information.");
    } finally {
      setSaving(false);
    }
  };

  const showContact = includeContactFields;

  return (
    <section className="space-y-4">
      {showCommunicationPrefs && !readOnly ? (
        <PatientCommunicationPrefsFields
          prefs={commPrefs}
          smsConsent={patient.sms_consent === true}
          onChange={setCommPrefs}
        />
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Patient information</h2>
          <p className="mt-1 text-sm text-slate-600">
            {readOnly
              ? "Review only — demographics are managed by the front desk or the provider for this care type."
              : showContact
                ? "Update name, phone, email, date of birth, address, and emergency contact. Age and visit dates update automatically."
                : "You can update these during the visit. Age and visit dates update automatically."}
          </p>
        </div>
        {readOnly && readOnlyMessage ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {readOnlyMessage}
          </p>
        ) : null}
        {message ? (
          <p
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              message === "Patient information saved."
                ? "bg-emerald-50 text-emerald-900"
                : "bg-amber-50 text-amber-950"
            }`}
          >
            {message}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Age</p>
          <p className="mt-1.5 font-semibold tabular-nums text-slate-900">{formatPatientAge(patient.age)}</p>
        </div>
        {canEditDateEstablished && !readOnly ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:col-span-2">
            <label>
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Date established
              </span>
              <UsDateInput
                className={inputClass}
                value={form.date_established}
                onChange={(iso) => setForm((f) => ({ ...f, date_established: iso }))}
                aria-label="Date established"
              />
              <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
                {patient.first_appointment_date ? (
                  <>
                    First appointment in system: {formatDemographicsDate(patient.first_appointment_date)}. Leave blank to
                    use that date.
                  </>
                ) : (
                  <>Set when the patient started with the clinic. Leave blank if unknown.</>
                )}
              </p>
            </label>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Date established</p>
            <p className="mt-1.5 font-semibold tabular-nums text-slate-900">
              {formatDemographicsDate(patient.date_established)}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {patient.date_established_override ? "Set by staff" : "From first appointment"}
            </p>
          </div>
        )}
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:col-span-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Last seen</p>
          <p className="mt-1.5 font-semibold tabular-nums text-slate-900">
            {formatDemographicsDate(patient.last_seen)}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">Last completed visit</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
        {readOnly ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {showContact ? (
              <>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">First name</p>
                  <p className="mt-1.5 font-semibold text-slate-900">{patient.first_name || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Last name</p>
                  <p className="mt-1.5 font-semibold text-slate-900">{patient.last_name || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Phone</p>
                  <p className="mt-1.5 font-semibold text-slate-900">{patient.phone || "—"}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Email</p>
                  <p className="mt-1.5 font-semibold text-slate-900">{patient.email || "—"}</p>
                </div>
              </>
            ) : null}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Date of birth</p>
              <p className="mt-1.5 font-semibold text-slate-900">
                {patient.date_of_birth ? formatDemographicsDate(patient.date_of_birth) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Marital</p>
              <p className="mt-1.5 font-semibold text-slate-900">{formatMaritalStatus(patient.marital_status)}</p>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Address</p>
              <p className="mt-1.5 text-slate-800">
                {[patient.address_line1, patient.address_line2, patient.city_state_zip]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Emergency contact</p>
              <p className="mt-1.5 text-slate-800">
                {patient.emergency_contact_name || patient.emergency_contact_phone
                  ? `${patient.emergency_contact_name}${patient.emergency_contact_phone ? ` · ${patient.emergency_contact_phone}` : ""}`
                  : "—"}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {showContact ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <p className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Name & contact
                </p>
                <label>
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    First name
                  </span>
                  <input
                    className={inputClass}
                    value={form.first_name}
                    onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                  />
                </label>
                <label>
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Last name
                  </span>
                  <input
                    className={inputClass}
                    value={form.last_name}
                    onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Phone
                  </span>
                  <PhoneInput
                    international
                    defaultCountry="US"
                    value={form.phone}
                    onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                    className="phone-input-root"
                    numberInputProps={{ className: inputClass }}
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Email
                  </span>
                  <input
                    type="email"
                    className={inputClass}
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="optional — needed to email bills"
                  />
                </label>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <p className="sm:col-span-2 lg:col-span-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Demographics
              </p>
              <label>
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Date of birth
                </span>
                <UsDateInput
                  className={inputClass}
                  value={form.date_of_birth}
                  onChange={(iso) => setForm((f) => ({ ...f, date_of_birth: iso }))}
                  aria-label="Date of birth"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Marital (Y / N)
                </span>
                <select
                  className={inputClass}
                  value={form.marital_status}
                  onChange={(e) => setForm((f) => ({ ...f, marital_status: e.target.value }))}
                >
                  <option value="">— Not set —</option>
                  <option value="Y">Y — Married</option>
                  <option value="N">N — Not married</option>
                </select>
                <p className="mt-1 text-[10px] text-slate-500">Current: {formatMaritalStatus(patient.marital_status)}</p>
              </label>
              <label className="sm:col-span-2 lg:col-span-3">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Street address
                </span>
                <input
                  className={inputClass}
                  value={form.address_line1}
                  onChange={(e) => setForm((f) => ({ ...f, address_line1: e.target.value }))}
                />
              </label>
              <label className="sm:col-span-2 lg:col-span-3">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Apt / suite
                </span>
                <input
                  className={inputClass}
                  value={form.address_line2}
                  onChange={(e) => setForm((f) => ({ ...f, address_line2: e.target.value }))}
                />
              </label>
              <label className="sm:col-span-2 lg:col-span-3">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  City, state, ZIP
                </span>
                <input
                  className={inputClass}
                  placeholder="St Joseph, MI 49085"
                  value={form.city_state_zip}
                  onChange={(e) => setForm((f) => ({ ...f, city_state_zip: e.target.value }))}
                />
              </label>
              <label>
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Emergency name
                </span>
                <input
                  className={inputClass}
                  value={form.emergency_contact_name}
                  onChange={(e) => setForm((f) => ({ ...f, emergency_contact_name: e.target.value }))}
                />
              </label>
              <label>
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Emergency phone
                </span>
                <input
                  className={inputClass}
                  value={form.emergency_contact_phone}
                  onChange={(e) => setForm((f) => ({ ...f, emergency_contact_phone: e.target.value }))}
                />
              </label>
            </div>
          </div>
        )}

        {!readOnly ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => setForm(detailToForm(patient, canEditDateEstablished, includeContactFields))}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => void save()}
              className="rounded-xl bg-[#16a349] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save patient information"}
            </button>
            {!dirty ? (
              <span className="text-xs text-slate-500">Change a field above to enable save.</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
