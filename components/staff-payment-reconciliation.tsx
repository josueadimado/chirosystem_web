"use client";

import { IconMoreVertical } from "@/components/icons";
import { Loader } from "@/components/loader";
import { StatusChipView } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, apiGetAuth, apiPost } from "@/lib/api";
import { formatMonthDayYear } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

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

function ReasonBadges({ row }: { row: ReconRow }) {
  return (
    <div className="flex flex-wrap gap-1">
      {row.appointment_awaiting_payment ? (
        <span className="rounded px-2 py-0.5 text-[11px] font-medium bg-[#ede9fe] text-[#5b21b6]">
          Awaiting payment
        </span>
      ) : row.appointment_status ? (
        <StatusChipView status={row.appointment_status} />
      ) : null}
      {row.has_full_discount ? (
        <span className="rounded px-2 py-0.5 text-[11px] font-medium bg-[#dbeafe] text-[#1d4ed8]">
          Full discount
        </span>
      ) : null}
      {row.has_cash_payment ? (
        <span className="rounded px-2 py-0.5 text-[11px] font-medium bg-[#fef3c7] text-[#92400e]">
          Cash recorded
        </span>
      ) : null}
      {row.should_close ? (
        <span className="rounded px-2 py-0.5 text-[11px] font-medium bg-[#f0fdf4] text-[#166534]">
          Should close
        </span>
      ) : null}
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
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [markPaidRow, setMarkPaidRow] = useState<ReconRow | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (menuOpenId == null) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpenId(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpenId]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
    setMenuOpenId(null);
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

  const markPaidVerified = async () => {
    if (!markPaidRow) return;
    const row = markPaidRow;
    setBusyId(row.invoice_id);
    setMsg("");
    setError("");
    try {
      const out = await apiPost<{ detail?: string }>("/admin/confirm-invoice-paid/", {
        invoice_id: row.invoice_id,
        invoice_number: row.invoice_number,
      });
      setMsg(out.detail || "Marked paid.");
      setMarkPaidRow(null);
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
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-xl border bg-white px-5 py-4 text-left transition",
              tab === t.id
                ? "border-[#16a349]/50 ring-2 ring-[#16a349]/15"
                : "border-[#d1e8d8] hover:border-[#16a349]/35",
            )}
          >
            <p className="text-sm font-medium text-[#5a7a62]">{t.label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-[#0d1f14]">{t.count}</p>
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-[#d1e8d8] bg-[#f0fdf4] px-4 py-3 text-sm text-[#166534]">{msg}</p>
      ) : null}

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#d1e8d8] bg-white">
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-[#d1e8d8] px-5 py-3">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a7a62]"
              aria-hidden
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search patient or invoice..."
              className="w-full rounded-lg border border-[#d1e8d8] bg-[#f4fbf7] py-2.5 pl-10 pr-3 text-sm text-[#0d1f14] placeholder:text-[#5a7a62] focus:border-[#16a349]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
              aria-label="Search reconciliation"
            />
          </div>
          <select
            value={tab}
            onChange={(e) => setTab(e.target.value as TabKey)}
            className="min-w-[12rem] rounded-lg border border-[#d1e8d8] bg-white px-3 py-2.5 text-sm font-medium text-[#0d1f14] focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
            aria-label="Filter list"
          >
            <option value="fully_paid_still_open">
              Fully paid ({data?.summary.fully_paid_still_open ?? 0})
            </option>
            <option value="partial_payment">Partial ({data?.summary.partial_payment ?? 0})</option>
            <option value="open_unpaid">Open unpaid ({data?.summary.open_unpaid ?? 0})</option>
          </select>
          {tab === "fully_paid_still_open" ? (
            <button
              type="button"
              disabled={batchBusy || (data?.summary.fully_paid_still_open ?? 0) === 0}
              onClick={() => void closeAllZeroDue()}
              className="rounded-lg bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#13823d] disabled:opacity-50"
            >
              {batchBusy ? "Fixing..." : "Close all fully paid"}
            </button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {loading && !data ? (
            <div className="p-8">
              <Loader variant="page" label="Loading" />
            </div>
          ) : (
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-[1] border-b border-[#d1e8d8] bg-[#f8fdf9]">
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-[#5a7a62]">
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Visit</th>
                  <th className="px-4 py-3">Why stuck</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Due</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-[#5a7a62]">
                      Nothing in this list.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const busy = busyId === row.invoice_id;
                    return (
                      <tr
                        key={row.invoice_id}
                        className="border-b border-[#d1e8d8] last:border-b-0 hover:bg-[#f8fdf9]"
                      >
                        <td className="px-4 py-3.5 align-middle">
                          <Link
                            href={`/admin/patients/${row.patient_id}/history`}
                            className="font-semibold text-[#0d1f14] hover:text-[#16a349] hover:underline"
                          >
                            {row.patient_name}
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 align-middle font-mono text-[#5a7a62]">
                          {row.invoice_number}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 align-middle text-[#5a7a62]">
                          {row.appointment_date ? formatMonthDayYear(row.appointment_date) : "-"}
                        </td>
                        <td className="px-4 py-3.5 align-middle">
                          <ReasonBadges row={row} />
                        </td>
                        <td className="px-4 py-3.5 align-middle text-right tabular-nums text-[#0d1f14]">
                          {formatMoney(row.total_amount)}
                        </td>
                        <td className="px-4 py-3.5 align-middle text-right tabular-nums text-[#166534]">
                          {formatMoney(row.amount_paid)}
                        </td>
                        <td className="px-4 py-3.5 align-middle text-right font-semibold tabular-nums text-[#0d1f14]">
                          {formatMoney(row.amount_due)}
                        </td>
                        <td className="px-4 py-3.5 align-middle text-right">
                          {tab === "fully_paid_still_open" ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void closeOne(row.invoice_id)}
                              className="rounded-lg bg-[#16a349] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#13823d] disabled:opacity-50"
                            >
                              {busy ? "Saving..." : "Close as paid"}
                            </button>
                          ) : (
                            <div
                              className="relative inline-flex justify-end"
                              ref={menuOpenId === row.invoice_id ? menuRef : undefined}
                            >
                              <button
                                type="button"
                                disabled={busy}
                                aria-haspopup="menu"
                                aria-expanded={menuOpenId === row.invoice_id}
                                aria-label={`Actions for ${row.invoice_number}`}
                                onClick={() =>
                                  setMenuOpenId((id) => (id === row.invoice_id ? null : row.invoice_id))
                                }
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#d1e8d8] bg-white text-[#5a7a62] hover:bg-[#f8fdf9] hover:text-[#0d1f14] disabled:opacity-50"
                              >
                                <IconMoreVertical className="h-4 w-4" />
                              </button>
                              {menuOpenId === row.invoice_id ? (
                                <div
                                  role="menu"
                                  className="absolute right-0 top-full z-20 mt-1.5 w-52 overflow-hidden rounded-xl border border-[#d1e8d8] bg-white py-1 shadow-lg"
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    disabled={busy}
                                    onClick={() => {
                                      setMenuOpenId(null);
                                      void checkSquare(row.invoice_id);
                                    }}
                                    className="block w-full px-3.5 py-2.5 text-left text-sm font-medium text-[#0d1f14] hover:bg-[#f8fdf9] disabled:opacity-50"
                                  >
                                    {busy ? "Checking..." : "Check Square"}
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    disabled={busy}
                                    onClick={() => {
                                      setMenuOpenId(null);
                                      setMarkPaidRow(row);
                                    }}
                                    className="block w-full px-3.5 py-2.5 text-left text-sm font-medium text-[#0d1f14] hover:bg-[#f8fdf9] disabled:opacity-50"
                                  >
                                    Mark paid
                                  </button>
                                  <Link
                                    role="menuitem"
                                    href="/admin/billing"
                                    onClick={() => setMenuOpenId(null)}
                                    className="block w-full px-3.5 py-2.5 text-left text-sm font-medium text-[#16a349] hover:bg-[#f8fdf9]"
                                  >
                                    Record cash on Billing
                                  </Link>
                                </div>
                              ) : null}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-[#d1e8d8] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[#5a7a62]">
            {totalCount === 0 ? (
              "0 invoices"
            ) : (
              <>
                <span className="tabular-nums text-[#0d1f14]">
                  {rangeStart}-{rangeEnd}
                </span>{" "}
                of <span className="tabular-nums text-[#0d1f14]">{totalCount}</span>
                {loading ? <span className="ml-2">Loading...</span> : null}
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-[#d1e8d8] bg-white px-3 py-1.5 text-xs font-semibold text-[#0d1f14] hover:bg-[#f8fdf9] disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading || totalCount === 0}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-[#d1e8d8] bg-white px-3 py-1.5 text-xs font-semibold text-[#0d1f14] hover:bg-[#f8fdf9] disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <Dialog
        open={markPaidRow != null}
        onOpenChange={(open) => {
          if (!open && busyId == null) setMarkPaidRow(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {markPaidRow ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-[#0d1f14]">Mark invoice as paid?</DialogTitle>
                <DialogDescription className="text-[#5a7a62]">
                  Only continue if Square or the front desk already shows this bill as paid, and automatic sync could
                  not match it. Nothing new will be charged.
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-xl border border-[#d1e8d8] bg-[#f8fdf9] px-4 py-3">
                <p className="font-semibold text-[#0d1f14]">{markPaidRow.patient_name}</p>
                <p className="mt-0.5 font-mono text-xs text-[#5a7a62]">{markPaidRow.invoice_number}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5a7a62]">Total</p>
                    <p className="tabular-nums text-[#0d1f14]">{formatMoney(markPaidRow.total_amount)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5a7a62]">Paid</p>
                    <p className="tabular-nums text-[#166534]">{formatMoney(markPaidRow.amount_paid)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5a7a62]">Due</p>
                    <p className="font-semibold tabular-nums text-[#0d1f14]">
                      {formatMoney(markPaidRow.amount_due)}
                    </p>
                  </div>
                </div>
                {markPaidRow.appointment_date ? (
                  <p className="mt-2 text-xs text-[#5a7a62]">
                    Visit {formatMonthDayYear(markPaidRow.appointment_date)}
                  </p>
                ) : null}
              </div>

              <DialogFooter className="border-[#d1e8d8] bg-[#f8fdf9]">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busyId === markPaidRow.invoice_id}
                  onClick={() => setMarkPaidRow(null)}
                  className="border-[#d1e8d8]"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={busyId === markPaidRow.invoice_id}
                  onClick={() => void markPaidVerified()}
                  className="bg-[#16a349] text-white hover:bg-[#13823d]"
                >
                  {busyId === markPaidRow.invoice_id ? "Saving..." : "Yes, mark paid"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
