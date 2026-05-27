"use client";

import { HelpTip } from "@/components/help-tip";
import { visitSnapshotHasDetailContent, type VisitSnapshot } from "@/lib/visit-panel-types";

function SnapshotField({ label, value }: { label: string; value: string }) {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">{trimmed}</p>
    </div>
  );
}

/** Read-only clinical + billing snapshot for a visit (admin schedule, history). */
export function VisitSnapshotDisplay({
  snapshot,
  loading = false,
  showBillingHint = true,
  title = "Visit details",
}: {
  snapshot: VisitSnapshot | null;
  loading?: boolean;
  showBillingHint?: boolean;
  title?: string;
}) {
  return (
    <div className="mt-8 border-t border-slate-200 pt-6">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-4 space-y-3 rounded-xl border border-slate-200/90 bg-slate-50/40 p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Visit snapshot</p>
          {showBillingHint ? (
            <HelpTip label="Visit snapshot" tone="emerald">
              Handoff, notes, diagnosis, and line items for this appointment. When status is <strong>awaiting payment</strong>, use the
              billing actions above for <strong>Preview bill</strong> and <strong>Edit billing</strong>.
            </HelpTip>
          ) : null}
        </div>
        {loading && <p className="text-xs text-slate-500">Loading visit details…</p>}
        {!loading && snapshot && visitSnapshotHasDetailContent(snapshot) && (
          <>
            {snapshot.visit_id != null && snapshot.visit_status && (
              <p className="text-xs text-slate-600">
                <span className="font-semibold text-slate-500">Visit record:</span>{" "}
                <span className="capitalize">{snapshot.visit_status.replace(/_/g, " ")}</span>
              </p>
            )}
            <SnapshotField label="Patient&apos;s reason (from booking)" value={snapshot.reason_for_visit} />
            <SnapshotField label="Chart note for the team" value={snapshot.clinical_handoff_notes} />
            <SnapshotField label="Doctor notes" value={snapshot.doctor_notes} />
            <SnapshotField label="Diagnosis" value={snapshot.diagnosis} />
            {snapshot.rendered_services.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white text-xs">
                <table className="min-w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90">
                      <th className="px-2 py-2 font-semibold text-slate-600">Service</th>
                      <th className="px-2 py-2 font-semibold text-slate-600">Code</th>
                      <th className="px-2 py-2 text-right font-semibold text-slate-600">Qty</th>
                      <th className="px-2 py-2 text-right font-semibold text-slate-600">Line</th>
                      <th className="px-2 py-2 text-center font-semibold text-slate-600">Pt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.rendered_services.map((row) => (
                      <tr key={row.service_id} className="border-b border-slate-100 last:border-0">
                        <td className="px-2 py-1.5 text-slate-800">{row.service_name}</td>
                        <td className="px-2 py-1.5 font-mono text-slate-600">{row.billing_code || "—"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{row.quantity}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-800">{row.line_total}</td>
                        <td className="px-2 py-1.5 text-center text-slate-600">{row.charges_patient ? "Y" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-500">No line items on this visit yet.</p>
            )}
            {snapshot.invoice && (
              <div className="space-y-1 text-xs text-slate-700">
                <p>
                  <span className="font-semibold text-slate-500">Invoice:</span> {snapshot.invoice.invoice_number} · $
                  {snapshot.invoice.total_amount}{" "}
                  <span className="text-slate-500">({snapshot.invoice.status})</span>
                </p>
                {parseFloat(snapshot.invoice.discount || "0") > 0 ? (
                  <div className="space-y-0.5">
                    <p className="text-emerald-700">
                      <span className="font-semibold">Professional discount (internal):</span> ${snapshot.invoice.discount}
                    </p>
                    {parseFloat(snapshot.invoice.credit_applied_total || "0") > 0 ? (
                      <p className="text-emerald-700">
                        <span className="font-semibold">Credit applied (wallet):</span> ${snapshot.invoice.credit_applied_total}
                      </p>
                    ) : null}
                    {snapshot.invoice.professional_discount_reason?.trim() ? (
                      <p className="text-slate-600">
                        <span className="font-semibold">Reason:</span> {snapshot.invoice.professional_discount_reason}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}
        {!loading && snapshot && !visitSnapshotHasDetailContent(snapshot) && (
          <p className="text-sm text-slate-500">No visit notes yet</p>
        )}
        {!loading && !snapshot && <p className="text-xs text-slate-500">Could not load visit details for this appointment.</p>}
      </div>
    </div>
  );
}
