"use client";

import { AdminPageIntro } from "@/components/admin-shell";
import { Loader } from "@/components/loader";
import { StatusChipView } from "@/components/status-chip";
import { ApiError, apiGetAuth, apiPost } from "@/lib/api";
import { formatMonthDayYear } from "@/lib/format-date";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const PAGE_SIZE = 30;

type ReconPayment = {
  id: number;
  amount: string;
  payment_method: string;
  payment_reference: string;
  paid_at: string | null;
};

type ReconRow = {
  invoice_id: number;
  invoice_number: string;
  patient_id: number;
  patient_name: string;
  status: string;
  kind: string;
  total_amount: string;
  amount_paid: string;
  amount_due: string;
  issued_at: string | null;
  appointment_id?: number | null;
  appointment_date: string | null;
  appointment_status?: string;
  appointment_awaiting_payment?: boolean;
  payments: ReconPayment[];
  has_cash_payment: boolean;
  has_full_discount?: boolean;
  should_close?: boolean;
  reason_code?: string;
  reason_label?: string;
  discount?: string;
  subtotal?: string;
  issue: string;
};

type ReconSection = {
  count: number;
  page: number;
  page_size: number;
  results: ReconRow[];
};

type ReconPayload = {
  summary: {
    fully_paid_still_open: number;
    partial_payment: number;
    open_unpaid: number;
    awaiting_payment_stuck?: number;
    full_discount_stuck?: number;
    cash_recorded_stuck?: number;
  };
  fully_paid_still_open: ReconSection;
  partial_payment: ReconSection;
  open_unpaid: ReconSection;
};

type TabKey = "fully_paid_still_open" | "partial_payment" | "open_unpaid";

function formatMoney(amount: string): string {
  const n = parseFloat(amount);
  if (Number.isNaN(n)) return amount;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function methodLabel(m: string): string {
  if (m === "cash") return "Cash";
  if (m === "card") return "Card";
  if (m === "online") return "Online";
  if (m === "manual") return "Manual";
  return m;
}

function ReasonBadges({ row }: { row: ReconRow }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {row.appointment_awaiting_payment ? (
          <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-900">
            Awaiting payment
          </span>
        ) : row.appointment_status ? (
          <StatusChipView status={row.appointment_status} />
        ) : null}
        {row.has_full_discount ? (
          <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-900">
            Full discount
          </span>
        ) : null}
        {row.has_cash_payment ? (
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-950">
            Cash recorded
          </span>
        ) : null}
        {row.should_close ? (
          <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-900">
            Should close
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function StaffPaymentReconciliation() {
  const [tab, setTab] = useState<TabKey>("fully_paid_still_open");
  const [q, setQ] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReconPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [searchDebounced, tab]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(PAGE_SIZE));
      if (searchDebounced) params.set("q", searchDebounced);
      const out = await apiGetAuth<ReconPayload>(`/admin/payment_reconciliation/?${params}`);
      setData(out);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load reconciliation list.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, searchDebounced]);

  useEffect(() => {
    void load();
  }, [load]);

  const section = data?.[tab];
  const totalCount = section?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalCount);
  const rows = section?.results ?? [];

  const closeOne = async (invoiceId: number) => {
    setBusyId(invoiceId);
    setMsg("");
    setError("");
    try {
      const out = await apiPost<{ ok?: boolean; closed?: boolean; detail?: string }>(
        "/admin/close_zero_due_invoice/",
        { invoice_id: invoiceId },
      );
      setMsg(out.detail || "Updated.");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not close invoice.");
    } finally {
      setBusyId(null);
    }
  };

  const closeAllZeroDue = async () => {
    const ok = window.confirm(
      "Mark all fully paid open invoices as Paid?\n\nOnly invoices with $0 still due (cash/card already recorded) will be closed. Nothing is charged again.",
    );
    if (!ok) return;
    setBatchBusy(true);
    setMsg("");
    setError("");
    try {
      const out = await apiPost<{ detail?: string; closed_count?: number }>("/admin/close_zero_due_invoice/", {
        all: true,
      });
      setMsg(out.detail || `Closed ${out.closed_count ?? 0} invoice(s).`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not batch-close invoices.");
    } finally {
      setBatchBusy(false);
    }
  };

  const checkSquare = async (invoiceId: number) => {
    setBusyId(invoiceId);
    setMsg("");
    setError("");
    try {
      const out = await apiPost<{ detail?: string; paid?: boolean }>("/admin/sync-invoice-payment/", {
        invoice_id: invoiceId,
      });
      setMsg(out.detail || (out.paid ? "Marked paid from Square." : "No matching Square payment found."));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not check Square.");
    } finally {
      setBusyId(null);
    }
  };

  const markPaidVerified = async (row: ReconRow) => {
    const ok = window.confirm(
      `Mark ${row.invoice_number} paid?\n\nOnly continue if Square (or the desk) already shows this bill as paid and automatic sync could not match it.`,
    );
    if (!ok) return;
    setBusyId(row.invoice_id);
    setMsg("");
    setError("");
    try {
      const out = await apiPost<{ detail?: string }>("/admin/confirm-invoice-paid/", {
        invoice_id: row.invoice_id,
        invoice_number: row.invoice_number,
      });
      setMsg(out.detail || "Marked paid.");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not mark paid.");
    } finally {
      setBusyId(null);
    }
  };

  const tabs: { id: TabKey; label: string; count: number }[] = [
    {
      id: "fully_paid_still_open",
      label: "Fully paid, still open",
      count: data?.summary.fully_paid_still_open ?? 0,
    },
    {
      id: "partial_payment",
      label: "Partial payments",
      count: data?.summary.partial_payment ?? 0,
    },
    {
      id: "open_unpaid",
      label: "Open unpaid",
      count: data?.summary.open_unpaid ?? 0,
    },
  ];

  return (
    <div className="space-y-6">
      <AdminPageIntro
        title="Payment reconciliation"
        description="Find invoices that still look outstanding after cash or Square payments, and correct them without charging again."
        pageHelp="Use this alongside Billing and Square. “Close as paid” only works when local payments already cover the bill. Check Square looks for card/Terminal payments. Mark paid is for when Square’s app shows paid but sync cannot match."
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Patient name, patient ID, or invoice #…"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm shadow-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          {tab === "fully_paid_still_open" ? (
            <button
              type="button"
              disabled={batchBusy || (data?.summary.fully_paid_still_open ?? 0) === 0}
              onClick={() => void closeAllZeroDue()}
              className="rounded-xl bg-[#0d5c2e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4a25] disabled:opacity-50"
            >
              {batchBusy ? "Fixing…" : "Close all fully paid"}
            </button>
          ) : null}
        </div>
      </section>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{msg}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "rounded-full bg-[#0d5c2e] px-4 py-2 text-sm font-semibold text-white"
                : "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            }
          >
            {t.label}
            <span className="ml-2 tabular-nums opacity-80">{t.count}</span>
          </button>
        ))}
      </div>

      {tab === "fully_paid_still_open" && data ? (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 font-semibold text-violet-900">
            Awaiting payment: {data.summary.awaiting_payment_stuck ?? 0}
          </span>
          <span className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 font-semibold text-sky-900">
            Full discount: {data.summary.full_discount_stuck ?? 0}
          </span>
          <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 font-semibold text-amber-950">
            Cash recorded: {data.summary.cash_recorded_stuck ?? 0}
          </span>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-slate-900">Invoices needing attention</h2>
          {loading ? <Loader variant="spinner" label="Loading" /> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Visit</th>
                <th className="px-4 py-3">Invoice status</th>
                <th className="px-4 py-3">Why stuck</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Due</th>
                <th className="px-4 py-3">Payments</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                    Nothing in this list — good news if Fully paid / still open is empty.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const busy = busyId === row.invoice_id;
                  return (
                    <tr key={row.invoice_id} className="border-t border-slate-100 hover:bg-emerald-50/30">
                      <td className="px-4 py-3 align-top">
                        <p className="font-medium text-slate-900">{row.patient_name}</p>
                        <Link
                          href={`/admin/patients/${row.patient_id}/history`}
                          className="text-xs font-semibold text-[#0d5c2e] hover:underline"
                        >
                          Open chart
                        </Link>
                      </td>
                      <td className="px-4 py-3 align-top font-mono text-slate-700">{row.invoice_number}</td>
                      <td className="px-4 py-3 align-top whitespace-nowrap text-slate-600">
                        {row.appointment_date ? formatMonthDayYear(row.appointment_date) : "—"}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <StatusChipView status={row.status} />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <ReasonBadges row={row} />
                      </td>
                      <td className="px-4 py-3 align-top text-right tabular-nums">
                        <div>{formatMoney(row.total_amount)}</div>
                        {row.has_full_discount && row.discount && row.subtotal ? (
                          <p className="text-[11px] text-slate-500">
                            {formatMoney(row.subtotal)} − {formatMoney(row.discount)} disc.
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 align-top text-right tabular-nums text-emerald-800">
                        {formatMoney(row.amount_paid)}
                      </td>
                      <td className="px-4 py-3 align-top text-right font-semibold tabular-nums text-slate-900">
                        {formatMoney(row.amount_due)}
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-slate-600">
                        {row.payments.length === 0
                          ? row.has_full_discount
                            ? "No payment (covered by discount)"
                            : "—"
                          : row.payments
                              .map((p) => `${methodLabel(p.payment_method)} ${formatMoney(p.amount)}`)
                              .join(" · ")}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          {tab === "fully_paid_still_open" ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void closeOne(row.invoice_id)}
                              className="rounded-lg bg-[#0d5c2e] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0a4a25] disabled:opacity-50"
                            >
                              {busy ? "Saving…" : "Close as paid"}
                            </button>
                          ) : null}
                          {tab !== "fully_paid_still_open" ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void checkSquare(row.invoice_id)}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                              >
                                {busy ? "Checking…" : "Check Square"}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void markPaidVerified(row)}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                              >
                                Mark paid
                              </button>
                              <Link
                                href="/admin/billing"
                                className="text-xs font-semibold text-[#0d5c2e] hover:underline"
                              >
                                Record cash on Billing
                              </Link>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-sm text-slate-600">
            {totalCount === 0 ? (
              "No rows"
            ) : (
              <>
                Showing{" "}
                <span className="font-semibold tabular-nums text-slate-800">
                  {rangeStart}–{rangeEnd}
                </span>{" "}
                of <span className="font-semibold tabular-nums text-slate-800">{totalCount}</span>
                <span className="text-slate-400"> · {PAGE_SIZE} per page</span>
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading || totalCount === 0}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
