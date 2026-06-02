import { apiPost } from "@/lib/api";

export type EmailPatientBillResult = {
  detail: string;
  recipient: string;
};

/** User-facing confirmation after the server accepts the send. */
export function formatPatientBillEmailSentMessage(recipient: string): string {
  const to = (recipient || "").trim();
  if (!to) return "Email sent successfully. The patient bill was delivered.";
  return `Email sent successfully. The patient bill was delivered to ${to}.`;
}

/** Short label for buttons after send. */
/** Green banner / handoff lines after a successful send. */
export function isPatientBillEmailSuccessMessage(message: string): boolean {
  const m = (message || "").trim();
  return /^Email sent successfully/i.test(m) || /^Bill emailed to /i.test(m);
}

export function formatPatientBillEmailSentButtonLabel(recipient: string): string {
  const to = (recipient || "").trim();
  if (!to) return "Sent ✓";
  if (to.length > 28) return `Sent ✓ · ${to.slice(0, 24)}…`;
  return `Sent ✓ · ${to}`;
}

/** Doctor portal: email paid bill (own appointments only). */
export async function emailPatientBillDoctor(invoiceId: number): Promise<EmailPatientBillResult> {
  return apiPost<EmailPatientBillResult>("/doctor/email-patient-bill/", { invoice_id: invoiceId });
}

/** Admin / staff: email paid bill for any invoice. */
export async function emailPatientBillAdmin(invoiceId: number): Promise<EmailPatientBillResult> {
  return apiPost<EmailPatientBillResult>("/admin/email-patient-bill/", { invoice_id: invoiceId });
}
