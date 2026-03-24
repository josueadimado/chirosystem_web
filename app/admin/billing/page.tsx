"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { useAppFeedback } from "@/components/app-feedback";
import { HelpTip } from "@/components/help-tip";
import { Loader } from "@/components/loader";
import { StatusChipView } from "@/components/status-chip";
import { ApiError, apiGetAuth, apiPost } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";

type BillingInvoiceRow = {
  id: number;
  invoice_number: string;
  patient_id: number;
  patient_name: string;
  status: string;
  total_amount: string;
  subtotal: string;
  tax: string;
  issued_at: string | null;
  paid_at: string | null;
};

function formatMoney(amount: string): string {
  const n = parseFloat(amount);
  if (Number.isNaN(n)) return amount;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdminBillingPage() {
  const { runWithFeedback, toast } = useAppFeedback();
  const [invoices, setInvoices] = useState<BillingInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "card" | "online" | "manual">("cash");
  const [payRef, setPayRef] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await apiGetAuth<BillingInvoiceRow[]>("/admin/billing_invoices/");
      setInvoices(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load invoices.");
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = selectedId != null ? invoices.find((i) => i.id === selectedId) : null;

  useEffect(() => {
    if (selected) {
      setPayAmount(selected.total_amount);
      setPayRef("");
    }
  }, [selected?.id, selected?.total_amount]);

  const canRecordPayment =
    selected &&
    (selected.status === "issued" || selected.status === "overdue" || selected.status === "draft");

  const submitPayment = async () => {
    if (!selected || !canRecordPayment) return;
    const amt = parseFloat(payAmount);
    if (Number.isNaN(amt) || amt <= 0) {
      toast.error("Enter a valid payment amount.");
      return;
    }
    const invoiceId = selected.id;
    setPayBusy(true);
    await runWithFeedback(
      async () => {
        await apiPost(`/invoices/${invoiceId}/pay/`, {
          amount: payAmount,
          payment_method: payMethod,
          payment_reference: payRef.trim(),
        });
        await load();
        setSelectedId(invoiceId);
      },
      {
        loadingMessage: "Recording payment…",
        successMessage: "Payment recorded. Invoice updated.",
        errorFallback: "Payment could not be recorded.",
      },
    );
    setPayBusy(false);
  };

  return (
    <div className="space-y-6">
      <AdminPageIntro
        title="Invoices & billing"
        description="Open balances and paid invoices from your database. Record cash, card, or manual payments to close out a visit."
        pageHelp="List loads from the server. Recording payment uses the same API as marking an invoice paid and completes the linked appointment if it was still open."
      />

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="admin-panel">
          <AdminSectionLabel help="Each row is an invoice. Click to inspect and record payment if it is still open.">
            Invoice list
          </AdminSectionLabel>
          {loading ? (
            <Loader variant="page" label="Loading invoices" sublabel="Fetching billing data…" />
          ) : invoices.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No invoices yet. They appear when visits are completed.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-2 pr-3 font-semibold">Invoice #</th>
                    <th className="pb-2 pr-3 font-semibold">Patient</th>
                    <th className="pb-2 pr-3 font-semibold">
                      <span className="inline-flex items-center gap-1">
                        Status
                        <HelpTip label="Status">
                          Issued or overdue means balance due. Paid is closed. Draft is rare (not yet finalized).
                        </HelpTip>
                      </span>
                    </th>
                    <th className="pb-2 font-semibold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const isSel = selectedId === inv.id;
                    return (
                      <tr
                        key={inv.id}
                        className={`cursor-pointer border-t border-slate-100 transition ${
                          isSel ? "bg-[#16a349]/8" : "hover:bg-slate-50/80"
                        }`}
                        onClick={() => setSelectedId(inv.id)}
                      >
                        <td className="py-2.5 pr-3 font-mono text-xs text-slate-800">{inv.invoice_number}</td>
                        <td className="py-2.5 pr-3 font-medium text-slate-900">{inv.patient_name}</td>
                        <td className="py-2.5 pr-3">
                          <StatusChipView status={inv.status} />
                        </td>
                        <td className="py-2.5 text-right font-medium tabular-nums">{formatMoney(inv.total_amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="admin-panel space-y-4">
          <AdminSectionLabel help="Choose an invoice on the left. If it is unpaid, record how the patient paid.">
            Detail & payment
          </AdminSectionLabel>

          {!selected ? (
            <p className="text-sm text-slate-500">Select an invoice to see totals and payment options.</p>
          ) : (
            <>
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Invoice</p>
                <p className="font-mono text-sm font-semibold text-slate-900">{selected.invoice_number}</p>
                <p className="mt-2 text-sm text-slate-700">{selected.patient_name}</p>
                <p className="mt-3 text-xs text-slate-500">Issued {formatWhen(selected.issued_at)}</p>
                {selected.paid_at && (
                  <p className="text-xs text-slate-500">Paid {formatWhen(selected.paid_at)}</p>
                )}
                <dl className="mt-3 space-y-1 border-t border-slate-200/80 pt-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Subtotal</dt>
                    <dd className="font-medium tabular-nums">{formatMoney(selected.subtotal)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Tax</dt>
                    <dd className="font-medium tabular-nums">{formatMoney(selected.tax)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 font-semibold text-slate-900">
                    <dt>Total</dt>
                    <dd className="tabular-nums">{formatMoney(selected.total_amount)}</dd>
                  </div>
                </dl>
              </div>

              {canRecordPayment ? (
                <div className="space-y-3 rounded-xl border border-slate-200/90 p-4">
                  <p className="text-sm font-semibold text-slate-800">Record payment</p>
                  <label className="block text-xs font-medium text-slate-500">
                    Amount
                    <input
                      type="text"
                      inputMode="decimal"
                      className="admin-input mt-1"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-500">
                    Method
                    <select
                      className="admin-input mt-1"
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="online">Online</option>
                      <option value="manual">Manual / other</option>
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-slate-500">
                    Reference (optional)
                    <input
                      className="admin-input mt-1"
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                      placeholder="Check #, last 4, etc."
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={payBusy}
                      onClick={() => void submitPayment()}
                      className="rounded-xl bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
                    >
                      {payBusy ? "Saving…" : "Record payment"}
                    </button>
                    <HelpTip label="Record payment">
                      Marks the invoice paid, logs a payment row, and sets the linked appointment to completed if needed.
                    </HelpTip>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  This invoice is <StatusChipView status={selected.status} /> — no payment entry needed.
                </p>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
