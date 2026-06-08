/** Shared types for visit detail panels (admin schedule, billing modal, history). */

export type VisitSnapshotLine = {
  service_id: number;
  service_name: string;
  billing_code: string;
  quantity: number;
  unit_price: string;
  line_total: string;
  charges_patient: boolean;
};

export type VisitSnapshotInvoice = {
  id: number;
  invoice_number: string;
  kind?: string;
  subtotal: string;
  discount: string;
  credit_applied_total: string;
  professional_discount_reason: string;
  total_amount: string;
  status: string;
  /** Cash/card recorded on this invoice (partial payments). */
  amount_paid?: string;
  /** Still owed after prior payments. */
  amount_due?: string;
  invoice_total?: string;
};

export type VisitSnapshot = {
  appointment_id: number;
  appointment_status: string;
  patient_name: string;
  patient_id: number;
  clinical_handoff_notes: string;
  visit_id: number | null;
  visit_status: string | null;
  reason_for_visit: string;
  doctor_notes: string;
  diagnosis: string;
  rendered_services: VisitSnapshotLine[];
  invoice: VisitSnapshotInvoice | null;
};

export function visitSnapshotHasDetailContent(s: VisitSnapshot): boolean {
  if (s.visit_id != null && (s.visit_status || "").trim()) return true;
  if ((s.clinical_handoff_notes || "").trim()) return true;
  if ((s.reason_for_visit || "").trim()) return true;
  if ((s.doctor_notes || "").trim()) return true;
  if ((s.diagnosis || "").trim()) return true;
  if (s.rendered_services.length > 0) return true;
  if (s.invoice) return true;
  return false;
}

export function estimatedPriceFromSnapshot(visitSnapshot: VisitSnapshot | null): string {
  if (!visitSnapshot) return "—";
  if (visitSnapshot.invoice?.total_amount?.trim()) {
    const n = Number.parseFloat(visitSnapshot.invoice.total_amount);
    if (!Number.isNaN(n)) return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
    return `$${visitSnapshot.invoice.total_amount}`;
  }
  if (visitSnapshot.rendered_services?.length) {
    let sum = 0;
    for (const row of visitSnapshot.rendered_services) {
      sum += Number.parseFloat(row.line_total || "0") || 0;
    }
    if (sum > 0) {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(sum);
    }
  }
  return "—";
}
