/** Shared types for digital patient intake forms. */

export type IntakeFormType = "massage" | "pediatric" | "adult_chiropractic";

export type IntakeFormStatus = "not_started" | "draft" | "submitted";

export type IntakeFormPackItem = {
  form_type: IntakeFormType;
  label: string;
  status: IntakeFormStatus | string;
  submitted_at: string | null;
  answers: Record<string, unknown>;
  signature_name: string;
};

export type IntakeFormPack = {
  token: string;
  expires_at: string;
  patient: { id: number; display_name: string };
  forms: IntakeFormPackItem[];
  prefill: Record<string, unknown>;
};

export type IntakeSubmissionRow = {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_phone: string;
  patient_email: string;
  form_type: IntakeFormType | string;
  form_label: string;
  status: string;
  answers: Record<string, unknown>;
  signature_name: string;
  signed_at: string | null;
  submitted_at: string | null;
  updated_at: string | null;
  appointment_id: number | null;
};

export const FORM_TYPE_OPTIONS: { value: IntakeFormType; label: string }[] = [
  { value: "massage", label: "Massage intake" },
  { value: "pediatric", label: "Children / pediatric intake" },
  { value: "adult_chiropractic", label: "Adult chiropractic new-patient paperwork" },
];

export function strVal(answers: Record<string, unknown>, key: string): string {
  const v = answers[key];
  if (v == null) return "";
  return String(v);
}

export function boolVal(answers: Record<string, unknown>, key: string): boolean {
  return answers[key] === true || answers[key] === "true" || answers[key] === "yes" || answers[key] === "Y";
}

export function formatAnswerValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "—";
  if (typeof value === "object") {
    try {
      const entries = Object.entries(value as Record<string, unknown>).filter(
        ([, v]) => v != null && String(v).trim() !== "" && v !== false,
      );
      if (!entries.length) return "—";
      return entries.map(([k, v]) => `${humanizeIntakeKey(k)}: ${formatAnswerValue(v)}`).join("; ");
    } catch {
      return "—";
    }
  }
  const s = String(value).trim();
  return s || "—";
}

/** Readable labels for common intake answer keys. */
const INTAKE_ANSWER_LABELS: Record<string, string> = {
  first_name: "First name",
  last_name: "Last name",
  preferred_name: "Preferred name",
  email: "Email",
  phone: "Mobile phone",
  home_phone: "Home phone",
  work_phone: "Work phone",
  date_of_birth: "Date of birth",
  sex: "Sex",
  weight: "Weight",
  height: "Height",
  address_line1: "Street address",
  city: "City",
  state: "State",
  zip: "Zip",
  occupation: "Occupation",
  employer: "Employer",
  referred_by: "Referred by",
  emergency_contact_name: "Emergency contact",
  emergency_contact_relationship: "Emergency contact relationship",
  emergency_contact_phone: "Emergency phone",
  parent_guardian_names: "Parent / guardian",
  siblings_count: "Siblings",
  physician_name: "Physician",
  physician_phone: "Physician phone",
  pediatrician_name: "Pediatrician",
  pediatrician_last_visit: "Pediatrician last visit",
  prior_chiropractor: "Prior chiropractor",
  last_physical: "Last physical",
  imaging: "Imaging",
  hospitalizations: "Hospitalizations",
  surgeries: "Surgeries",
  medications: "Medications",
  vitamins: "Vitamins / supplements",
  allergies: "Allergies",
  accidents_surgeries: "Accidents / surgeries",
  reason_for_visit: "Reason for visit",
  general_health: "General health",
  prior_massage: "Prior massage",
  last_massage_date: "Last massage date",
  initial_visit_date: "Initial visit date",
  other_doctors: "Other doctors",
  prior_treatment: "Prior treatment",
  other_health_problems: "Other health problems",
  insurance_company: "Insurance company",
  insurance_policy_number: "Insurance policy #",
  symptoms: "Symptoms",
  symptoms_other: "Other symptoms",
  health_problems: "Health problems",
  birth_location: "Birth location",
  prenatal_notes: "Prenatal notes",
  feeding_history: "Feeding history",
  developmental_milestones: "Developmental milestones",
  childhood_diseases: "Childhood diseases",
  vaccination_notes: "Vaccinations",
  injuries_trauma: "Injuries / trauma",
  symptoms_began: "Symptoms began",
  symptoms_how_started: "How symptoms started",
  pain_rating: "Pain rating (0–10)",
  pain_map_notes: "Pain / numbness areas",
  aggravated_by: "What makes it worse",
  relieves_symptoms: "What relieves symptoms",
  activity_limits: "Activity limits",
  policies_acknowledged: "Policies acknowledged",
  signature_name: "Signature",
};

/** Preferred display order so contact info appears first (JSON key order is not reliable). */
const INTAKE_ANSWER_ORDER: string[] = [
  "first_name",
  "last_name",
  "preferred_name",
  "date_of_birth",
  "sex",
  "email",
  "phone",
  "home_phone",
  "work_phone",
  "address_line1",
  "city",
  "state",
  "zip",
  "occupation",
  "employer",
  "referred_by",
  "emergency_contact_name",
  "emergency_contact_relationship",
  "emergency_contact_phone",
  "parent_guardian_names",
  "siblings_count",
  "physician_name",
  "physician_phone",
  "pediatrician_name",
  "pediatrician_last_visit",
  "prior_chiropractor",
  "last_physical",
  "imaging",
  "hospitalizations",
  "surgeries",
  "medications",
  "vitamins",
  "allergies",
  "accidents_surgeries",
  "general_health",
  "prior_massage",
  "last_massage_date",
  "initial_visit_date",
  "other_doctors",
  "prior_treatment",
  "other_health_problems",
  "insurance_company",
  "insurance_policy_number",
  "symptoms",
  "symptoms_other",
  "health_problems",
  "birth_location",
  "prenatal_notes",
  "feeding_history",
  "developmental_milestones",
  "childhood_diseases",
  "vaccination_notes",
  "injuries_trauma",
  "reason_for_visit",
  "symptoms_began",
  "symptoms_how_started",
  "pain_rating",
  "pain_map_notes",
  "aggravated_by",
  "relieves_symptoms",
  "activity_limits",
  "policies_acknowledged",
  "signature_name",
];

export function humanizeIntakeKey(key: string): string {
  if (INTAKE_ANSWER_LABELS[key]) return INTAKE_ANSWER_LABELS[key];
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Keys that duplicate other fields or header metadata — hide from the answer table. */
const INTAKE_ANSWER_SKIP_ALWAYS = new Set([
  "signature_name", // shown in the modal / print header
]);

export type IntakeAnswerRow = { key: string; label: string; value: string };

/** Stable, labeled rows for staff viewing — skips empty values unless includeEmpty. */
export function orderedIntakeAnswerRows(
  answers: Record<string, unknown> | null | undefined,
  opts?: { includeEmpty?: boolean },
): IntakeAnswerRow[] {
  const src = answers || {};
  const includeEmpty = opts?.includeEmpty === true;
  const seen = new Set<string>();
  const rows: IntakeAnswerRow[] = [];

  const hasCityParts =
    Boolean(String(src.city || "").trim()) ||
    Boolean(String(src.state || "").trim()) ||
    Boolean(String(src.zip || "").trim());

  const push = (key: string) => {
    if (seen.has(key) || !(key in src)) return;
    if (INTAKE_ANSWER_SKIP_ALWAYS.has(key)) {
      seen.add(key);
      return;
    }
    // Prefill stores city_state_zip plus city/state/zip — only show one version.
    if (key === "city_state_zip" && hasCityParts) {
      seen.add(key);
      return;
    }
    seen.add(key);
    const formatted = formatAnswerValue(src[key]);
    if (!includeEmpty && (formatted === "—" || formatted === "")) return;
    rows.push({ key, label: humanizeIntakeKey(key), value: formatted });
  };

  for (const key of INTAKE_ANSWER_ORDER) push(key);
  for (const key of Object.keys(src)) push(key);
  return rows;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Printable HTML document for a submitted intake form. */
export function buildIntakePrintHtml(row: IntakeSubmissionRow, clinicName = "Relief Chiropractic"): string {
  const answers = orderedIntakeAnswerRows(row.answers);
  const submitted = row.submitted_at ? new Date(row.submitted_at).toLocaleString() : "—";
  const signed = row.signature_name || "—";
  const bodyRows = answers
    .map(
      (a) =>
        `<tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;width:34%;font-weight:600;color:#334155;">${escapeHtml(a.label)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;white-space:pre-wrap;color:#0f172a;">${escapeHtml(a.value)}</td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(row.form_label)} — ${escapeHtml(row.patient_name)}</title>
  <style>
    @page { margin: 0.6in; }
    body { font-family: Georgia, "Times New Roman", serif; color: #0f172a; margin: 0; padding: 24px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .meta { font-size: 13px; color: #475569; margin: 0 0 4px; }
    .clinic { font-size: 12px; color: #64748b; margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; border-bottom: 2px solid #cbd5e1; padding: 6px 10px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <p class="clinic">${escapeHtml(clinicName)}</p>
  <h1>${escapeHtml(row.form_label)}</h1>
  <p class="meta"><strong>Patient:</strong> ${escapeHtml(row.patient_name)}</p>
  <p class="meta"><strong>Phone:</strong> ${escapeHtml(row.patient_phone || "—")}
    ${row.patient_email ? ` · <strong>Email:</strong> ${escapeHtml(row.patient_email)}` : ""}</p>
  <p class="meta"><strong>Submitted:</strong> ${escapeHtml(submitted)} · <strong>Signed:</strong> ${escapeHtml(signed)}</p>
  <table>
    <thead><tr><th>Question</th><th>Answer</th></tr></thead>
    <tbody>
      ${bodyRows || `<tr><td colspan="2" style="padding:12px;color:#64748b;">No answers recorded.</td></tr>`}
    </tbody>
  </table>
</body>
</html>`;
}

/** Open a hidden iframe and print the intake form. */
export function printIntakeSubmission(row: IntakeSubmissionRow, clinicName?: string): void {
  if (typeof document === "undefined") return;
  const html = buildIntakePrintHtml(row, clinicName);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Print intake form");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const doc = iframe.contentDocument || win?.document;
  if (!doc || !win) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => {
    try {
      document.body.removeChild(iframe);
    } catch {
      /* already removed */
    }
  };
  win.focus();
  window.setTimeout(() => {
    try {
      win.print();
    } finally {
      window.setTimeout(cleanup, 1000);
    }
  }, 250);
}

