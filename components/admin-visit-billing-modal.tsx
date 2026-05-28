"use client";

import { useAppFeedback } from "@/components/app-feedback";
import { VisitBillingForm } from "@/components/visit-panel/visit-billing-form";
import { ApiError, apiGetAuth, apiPost } from "@/lib/api";
import {
  sortBillableServices,
  toggleBillLine,
  type BillableServiceOption,
  type VisitBillLine,
} from "@/lib/visit-billing-form-utils";
import {
  toggleDiagnosisId,
  type DiagnosisCatalogEntry,
} from "@/lib/diagnosis-catalog";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  appointmentId: number;
  appointmentDate: string;
  bookedServiceId: number | null;
  patientLabel: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * Owner/staff: edit visit billing while appointment is awaiting payment (mirrors doctor flow, uses /admin/revise_visit_billing/).
 */
export function AdminVisitBillingModal({
  appointmentId,
  appointmentDate,
  bookedServiceId,
  patientLabel,
  open,
  onClose,
  onSaved,
}: Props) {
  const { runWithFeedback, toast } = useAppFeedback();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [services, setServices] = useState<BillableServiceOption[]>([]);
  const [doctorNotes, setDoctorNotes] = useState("");
  const [diagnosisCatalog, setDiagnosisCatalog] = useState<DiagnosisCatalogEntry[]>([]);
  const [selectedDiagnosisIds, setSelectedDiagnosisIds] = useState<number[]>([]);
  const [diagnosisSearch, setDiagnosisSearch] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [professionalDiscount, setProfessionalDiscount] = useState("");
  const [professionalDiscountReason, setProfessionalDiscountReason] = useState("");
  const [billLines, setBillLines] = useState<VisitBillLine[]>([]);
  const [invoiceHint, setInvoiceHint] = useState("");
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [svcList, dxList, billing] = await Promise.all([
          apiGetAuth<BillableServiceOption[]>("/services/").then((list) => list.filter((s) => s.is_active !== false)),
          apiGetAuth<DiagnosisCatalogEntry[]>("/diagnoses/").then((list) => list.filter((d) => d.is_active !== false)),
          apiGetAuth<{
            doctor_notes: string;
            diagnosis: string;
            diagnosis_ids?: number[];
            rendered_services: Array<{ service_id: number; quantity: number; unit_price: string }>;
            invoice_number: string;
            discount?: string;
            professional_discount_reason?: string;
            total_amount: string;
          }>(`/admin/visit_billing_for_edit/?appointment_id=${appointmentId}`),
        ]);
        if (cancelled) return;
        setServices(svcList);
        setDiagnosisCatalog(dxList);
        setDoctorNotes(billing.doctor_notes ?? "");
        setDiagnosis(billing.diagnosis ?? "");
        setSelectedDiagnosisIds(billing.diagnosis_ids ?? []);
        setDiagnosisSearch("");
        setProfessionalDiscount(billing.discount ?? "");
        setProfessionalDiscountReason(billing.professional_discount_reason ?? "");
        setInvoiceHint(`${billing.invoice_number ?? ""} · $${billing.total_amount ?? ""}`.trim());
        if (!billing.rendered_services?.length) {
          toast.error("No billing lines on this visit.");
          onClose();
          return;
        }
        setBillLines(
          billing.rendered_services.map((r) => ({
            service_id: r.service_id,
            quantity: String(r.quantity),
            unit_price: r.unit_price?.trim() ? r.unit_price : "",
          })),
        );
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof ApiError ? e.message : "Could not load billing for editing.");
          onClose();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, appointmentId, onClose, toast]);

  const sortedBillServices = useMemo(
    () => sortBillableServices(services, bookedServiceId),
    [services, bookedServiceId],
  );

  const save = async () => {
    const rendered = billLines
      .filter((l) => l.service_id)
      .map((l) => {
        const q = Math.max(1, parseInt(l.quantity, 10) || 1);
        const row: { service_id: number; quantity: number; unit_price?: string } = {
          service_id: l.service_id,
          quantity: q,
        };
        if (l.unit_price.trim()) row.unit_price = l.unit_price.trim();
        return row;
      });
    if (rendered.length === 0) {
      toast.error("Add at least one billable line.");
      return;
    }
    setSaving(true);
    await runWithFeedback(
      async () => {
        await apiPost("/admin/revise_visit_billing/", {
          appointment_id: appointmentId,
          doctor_notes: doctorNotes,
          diagnosis_ids: selectedDiagnosisIds,
          rendered_services: rendered,
          professional_discount: professionalDiscount.trim() || "0",
          professional_discount_reason: professionalDiscountReason.trim(),
          charge_saved_card_if_present: false,
        });
        onSaved();
        onClose();
      },
      {
        loadingMessage: "Updating invoice…",
        successMessage: "Invoice updated from the schedule.",
        errorFallback: "Could not update billing.",
      },
    );
    setSaving(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !portalReady) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] overflow-y-auto bg-slate-900/40 backdrop-blur-[2px]"
      role="presentation"
      onClick={onClose}
    >
      <div className="flex min-h-full justify-center px-4 pt-[max(5.75rem,env(safe-area-inset-top,0px)+4.75rem)] pb-10 sm:px-6 sm:pt-28 sm:pb-14">
        <div
          className="mb-4 flex w-full max-w-2xl flex-col"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-billing-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex max-h-[min(82vh,720px)] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.22)] ring-1 ring-slate-200/60">
            <div className="shrink-0 border-b border-slate-100 bg-gradient-to-b from-slate-50/90 to-white px-6 pb-5 pt-7 sm:px-8 sm:pb-6 sm:pt-8">
              <h2 id="admin-billing-modal-title" className="text-xl font-bold tracking-tight text-slate-900 sm:text-[1.35rem]">
                Edit billing — {patientLabel}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                <span className="font-mono text-xs text-slate-500">Appointment #{appointmentId}</span>
                {appointmentDate ? (
                  <>
                    {" "}
                    <span className="text-slate-300">·</span> {appointmentDate}
                  </>
                ) : null}
                {invoiceHint ? (
                  <>
                    {" "}
                    <span className="text-slate-300">·</span> <span className="text-slate-600">{invoiceHint}</span>
                  </>
                ) : null}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8 sm:py-6">
              {loading ? (
                <p className="text-sm text-slate-600">Loading…</p>
              ) : (
                <VisitBillingForm
                  compact
                  diagnosis={diagnosis}
                  onDiagnosisChange={setDiagnosis}
                  diagnosisCatalog={diagnosisCatalog}
                  selectedDiagnosisIds={selectedDiagnosisIds}
                  onToggleDiagnosis={(id) => setSelectedDiagnosisIds((prev) => toggleDiagnosisId(prev, id))}
                  diagnosisSearchQuery={diagnosisSearch}
                  onDiagnosisSearchQueryChange={setDiagnosisSearch}
                  doctorNotes={doctorNotes}
                  onDoctorNotesChange={setDoctorNotes}
                  professionalDiscount={professionalDiscount}
                  onProfessionalDiscountChange={setProfessionalDiscount}
                  professionalDiscountReason={professionalDiscountReason}
                  onProfessionalDiscountReasonChange={setProfessionalDiscountReason}
                  services={services}
                  sortedServices={sortedBillServices}
                  billLines={billLines}
                  onToggleService={(id) => setBillLines((rows) => toggleBillLine(rows, id))}
                  onUpdateLine={(serviceId, patch) =>
                    setBillLines((rows) =>
                      rows.map((r) => (r.service_id === serviceId ? { ...r, ...patch } : r)),
                    )
                  }
                />
              )}
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4 sm:px-8">
              <button
                type="button"
                onClick={onClose}
                disabled={saving || loading}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || loading}
                onClick={() => void save()}
                className="rounded-xl bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
              >
                {saving ? "Saving…" : "Update invoice"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
