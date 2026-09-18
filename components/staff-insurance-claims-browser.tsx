"use client";

import { Cms1500PortalModal } from "@/components/cms1500-portal-modal";
import { Loader } from "@/components/loader";
import { StatusChipView } from "@/components/status-chip";
import { ApiError, apiGetAuth } from "@/lib/api";
import type { Cms1500ClaimPayload } from "@/lib/cms1500-print";
import { formatMonthDayYear } from "@/lib/format-date";
import { Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const PAGE_SIZE = 30;

type ClaimInvoiceRow = {
  id: number;
  invoice_number: string;
  patient_name: string;
  appointment_date: string | null;
  status: string;
  kind: string;
  total_amount: string;
  visit_id: number | null;
};

type Props = {
  /** "/admin" or "/doctor" */
  basePath: "/admin" | "/doctor";
};

function formatMoney(amount: string): string {
  const n = parseFloat(amount);
  if (Number.isNaN(n)) return amount;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export function StaffInsuranceClaimsBrowser({ basePath }: Props) {
  const [q, setQ] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [rows, setRows] = useState<ClaimInvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [claimBusyId, setClaimBusyId] = useState<number | null>(null);
  const [claimModal, setClaimModal] = useState<Cms1500ClaimPayload | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [searchDebounced]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(PAGE_SIZE));
      params.set("kind", "visit");
      if (basePath === "/admin") params.set("list_filter", "all");
      if (searchDebounced) params.set("search", searchDebounced);
      const data = await apiGetAuth<{
        count?: number;
        results: Array<{
          id: number;
          invoice_number: string;
          patient_name: string;
          appointment_date: string | null;
          status: string;
          kind: string;
          total_amount: string;
          visit_id?: number | null;
        }>;
      }>(`${basePath}/billing_invoices/?${params.toString()}`);
      setRows(
        (data.results || []).map((r) => ({
          id: r.id,
          invoice_number: r.invoice_number,
          patient_name: r.patient_name,
          appointment_date: r.appointment_date,
          status: r.status,
          kind: r.kind,
          total_amount: r.total_amount,
          visit_id: r.visit_id ?? null,
        })),
      );
      setTotalCount(typeof data.count === "number" ? data.count : (data.results || []).length);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load invoices.");
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [basePath, searchDebounced, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalCount);

  const openClaim = async (invoiceId: number) => {
    setClaimBusyId(invoiceId);
    setError("");
    try {
      const claim = await apiGetAuth<Cms1500ClaimPayload>(
        `${basePath}/insurance_claim/?invoice_id=${invoiceId}`,
      );
      setClaimModal(claim);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not build insurance claim.");
    } finally {
      setClaimBusyId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
          {error}
        </p>
      ) : null}

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#e8e8e8] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8e8e8] px-5 py-4">
          <h3 className="text-base font-semibold text-[#0d1f14]">CMS-1500 claims</h3>
          <div className="relative min-w-[12rem] w-full sm:w-72">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#949494]"
              aria-hidden
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search patient or invoice…"
              className="w-full rounded-lg border border-[#e8e8e8] bg-[#f8f8f7] py-2.5 pl-10 pr-3 text-sm text-[#0d1f14] placeholder:text-[#949494] focus:border-[#16a349]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
              aria-label="Search invoices"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {loading && rows.length === 0 ? (
            <div className="p-8">
              <Loader variant="page" label="Loading claims" sublabel="Gathering visit invoices…" />
            </div>
          ) : (
            <table className="w-full min-w-[800px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-[1] border-b border-[#e8e8e8] bg-[#f5f5f5]">
                <tr className="text-xs font-semibold text-[#949494]">
                  <th className="px-5 py-3">Patient</th>
                  <th className="px-3 py-3">Date of service</th>
                  <th className="px-3 py-3">Invoice</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Amount</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-[#949494]">
                      {searchDebounced ? "No invoices match that search." : "No visit invoices yet."}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const busy = claimBusyId === row.id;
                    const missingVisit = row.visit_id === null;
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-[#e8e8e8] last:border-b-0 hover:bg-[#f8f8f7]"
                      >
                        <td className="px-5 py-3.5 align-middle">
                          <p className="font-semibold text-[#0d1f14]">{row.patient_name}</p>
                          {missingVisit ? (
                            <p className="mt-0.5 text-xs font-medium text-[#92400e]">Needs visit notes</p>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 align-middle text-[#949494]">
                          {row.appointment_date ? formatMonthDayYear(row.appointment_date) : "—"}
                        </td>
                        <td className="px-3 py-3.5 align-middle font-mono text-[#949494]">
                          {row.invoice_number}
                        </td>
                        <td className="px-3 py-3.5 align-middle">
                          <StatusChipView status={row.status} />
                        </td>
                        <td className="px-3 py-3.5 align-middle text-right font-semibold tabular-nums text-[#0d1f14]">
                          {formatMoney(row.total_amount)}
                        </td>
                        <td className="px-5 py-3.5 align-middle text-right">
                          <button
                            type="button"
                            disabled={busy || missingVisit}
                            onClick={() => void openClaim(row.id)}
                            className="inline-flex items-center rounded-lg border border-[#16a349] bg-[#ecfdf5] px-3 py-2 text-xs font-medium text-[#16a349] hover:bg-[#d1fae5] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {busy ? "Opening…" : "View claim"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {totalCount > 0 ? (
          <div className="flex flex-col gap-2 border-t border-[#e8e8e8] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#949494]">
              <span className="tabular-nums text-[#0d1f14]">
                {rangeStart}–{rangeEnd}
              </span>{" "}
              of <span className="tabular-nums text-[#0d1f14]">{totalCount}</span>
              {loading ? <span className="ml-2">Loading…</span> : null}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-[#e8e8e8] bg-white px-3 py-1.5 text-xs font-semibold text-[#0d1f14] hover:bg-[#f5f5f5] disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-[#949494]">
                <span className="font-semibold tabular-nums text-[#0d1f14]">{page}</span> /{" "}
                <span className="tabular-nums">{totalPages}</span>
              </span>
              <button
                type="button"
                disabled={page >= totalPages || loading || totalCount === 0}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-[#e8e8e8] bg-white px-3 py-1.5 text-xs font-semibold text-[#0d1f14] hover:bg-[#f5f5f5] disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <Cms1500PortalModal claim={claimModal} onClose={() => setClaimModal(null)} basePath={basePath} />
    </div>
  );
}
