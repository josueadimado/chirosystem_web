import { apiPost } from "@/lib/api";

export type EmailPatientBillResult = {
  detail: string;
  recipient: string;
};

/** Doctor portal: email paid bill (own appointments only). */
export async function emailPatientBillDoctor(invoiceId: number): Promise<EmailPatientBillResult> {
  return apiPost<EmailPatientBillResult>("/doctor/email-patient-bill/", { invoice_id: invoiceId });
}

/** Admin / staff: email paid bill for any invoice. */
export async function emailPatientBillAdmin(invoiceId: number): Promise<EmailPatientBillResult> {
  return apiPost<EmailPatientBillResult>("/admin/email-patient-bill/", { invoice_id: invoiceId });
}
