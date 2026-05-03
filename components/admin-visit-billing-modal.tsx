"use client";

import { useAppFeedback } from "@/components/app-feedback";
import { HelpTip } from "@/components/help-tip";
import { ApiError, apiGetAuth, apiPost } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

type ServiceOpt = {
  id: number;
  name: string;
  price: string;
  billing_code?: string;
  charges_patient?: boolean;
  is_active?: boolean;
};

type BillLine = { service_id: number; quantity: string; unit_price: string };

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
  const [services, setServices] = useState<ServiceOpt[]>([]);
  const [doctorNotes, setDoctorNotes] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [billLines, setBillLines] = useState<BillLine[]>([]);
  const [invoiceHint, setInvoiceHint] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [svcList, billing] = await Promise.all([
          apiGetAuth<ServiceOpt[]>("/services/").then((list) => list.filter((s) => s.is_active !== false)),
          apiGetAuth<{
            doctor_notes: string;
            diagnosis: string;
            rendered_services: Array<{ service_id: number; quantity: number; unit_price: string }>;
            invoice_number: string;
            total_amount: string;
          }>(`/admin/visit_billing_for_edit/?appointment_id=${appointmentId}`),
        ]);
        if (cancelled) return;
        setServices(svcList);
        setDoctorNotes(billing.doctor_notes ?? "");
        setDiagnosis(billing.diagnosis ?? "");
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

  const sortedBillServices = useMemo(() => {
    return [...services].sort((a, b) => {
      if (bookedServiceId != null) {
        if (a.id === bookedServiceId && b.id !== bookedServiceId) return -1;
        if (b.id === bookedServiceId && a.id !== bookedServiceId) return 1;
      }
      const ca = (a.billing_code || "").toLowerCase();
      const cb = (b.billing_code || "").toLowerCase();
      if (ca !== cb) return ca.localeCompare(cb);
      return a.name.localeCompare(b.name);
    });
  }, [services, bookedServiceId]);

  const estimatedTotal = useMemo(() => {
    let total = 0;
    let hasLine = false;
    for (const line of billLines) {
      const svc = services.find((s) => s.id === line.service_id);
      if (!svc) continue;
      if (svc.charges_patient === false) continue;
      hasLine = true;
      const q = Math.max(1, parseInt(line.quantity, 10) || 1);
      const raw = line.unit_price.trim();
      const unit = raw ? parseFloat(raw) : parseFloat(svc.price);
      if (Number.isNaN(unit)) continue;
      total += unit * q;
    }
    if (!hasLine) return null;
    return total;
  }, [billLines, services]);

  const toggleService = (serviceId: number) => {
    setBillLines((rows) => {
      const has = rows.some((r) => r.service_id === serviceId);
      if (has) return rows.filter((r) => r.service_id !== serviceId);
      return [...rows, { service_id: serviceId, quantity: "1", unit_price: "" }];
    });
  };

  const isChecked = (serviceId: number) => billLines.some((r) => r.service_id === serviceId);
  const lineFor = (serviceId: number) => billLines.find((r) => r.service_id === serviceId);

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
          diagnosis,
          rendered_services: rendered,
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-billing-modal-title"
    >
      <div className="max-h-[min(90vh,720px)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 id="admin-billing-modal-title" className="text-lg font-bold text-slate-900">
          Edit billing — {patientLabel}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Appointment #{appointmentId}
          {appointmentDate ? ` · ${appointmentDate}` : ""}
          {invoiceHint ? ` · ${invoiceHint}` : ""}
        </p>
        {loading ? (
          <p className="mt-6 text-sm text-slate-600">Loading…</p>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Diagnosis (for bill)</p>
              <textarea
                className="h-24 w-full rounded-lg border border-slate-200 p-2 text-sm"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
              />
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2">
                <p className="text-xs font-semibold uppercase text-slate-500">Billable procedures</p>
                <HelpTip label="Lines" tone="emerald">
                  Checked items appear on the invoice. Use the assigned provider&apos;s allowed services when possible (inactive or wrong-type
                  services are blocked on save). Insurance-only services do not add to the patient total.
                </HelpTip>
              </div>
              <div className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-2">
                {sortedBillServices.map((s) => {
                  const on = isChecked(s.id);
                  const line = lineFor(s.id);
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "rounded-lg border px-2 py-2",
                        on ? "border-[#16a349]/40 bg-white shadow-sm" : "border-transparent hover:bg-white/60",
                      )}
                    >
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleService(s.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-[#16a349]"
                        />
                        <div className="min-w-0 flex-1 text-sm">
                          <span className="font-mono text-[11px] text-slate-500">{s.billing_code?.trim() || "—"}</span>{" "}
                          <span className="font-medium text-slate-900">{s.name}</span>
                          {s.charges_patient === false ? (
                            <span className="ml-1 text-[10px] font-bold uppercase text-indigo-800">No patient charge</span>
                          ) : null}
                          <span className="text-xs text-slate-500"> · ${s.price}</span>
                        </div>
                      </label>
                      {on && line ? (
                        <div className="mt-2 flex flex-wrap items-end gap-3 pl-7">
                          <label className="text-xs text-slate-600">
                            Units
                            <input
                              type="number"
                              min={1}
                              className="ml-1 w-16 rounded border border-slate-200 p-1 text-sm"
                              value={line.quantity}
                              onChange={(e) =>
                                setBillLines((rows) =>
                                  rows.map((r) => (r.service_id === s.id ? { ...r, quantity: e.target.value } : r)),
                                )
                              }
                            />
                          </label>
                          <label className="text-xs text-slate-600">
                            Fee override
                            <input
                              className="ml-1 w-28 rounded border border-slate-200 p-1 text-sm"
                              placeholder="Auto"
                              value={line.unit_price}
                              onChange={(e) =>
                                setBillLines((rows) =>
                                  rows.map((r) => (r.service_id === s.id ? { ...r, unit_price: e.target.value } : r)),
                                )
                              }
                            />
                          </label>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {estimatedTotal != null && (
                <p className="mt-2 text-sm font-semibold text-[#0d5c2e]">
                  Estimated patient total: {estimatedTotal.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                </p>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Visit notes</p>
              <textarea
                className="h-24 w-full rounded-lg border border-slate-200 p-2 text-sm"
                value={doctorNotes}
                onChange={(e) => setDoctorNotes(e.target.value)}
              />
            </div>
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving || loading}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void save()}
            className="rounded-xl bg-[#16a349] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13823d] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Update invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}
