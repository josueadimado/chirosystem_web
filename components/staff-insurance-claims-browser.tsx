"use client";

import { AdminPageIntro } from "@/components/admin-shell";
import { Cms1500PortalModal } from "@/components/cms1500-portal-modal";
import { DoctorPageIntro } from "@/components/doctor-shell";
import { Loader } from "@/components/loader";
import { StatusChipView } from "@/components/status-chip";
import { ApiError, apiGetAuth } from "@/lib/api";
import type { Cms1500ClaimPayload } from "@/lib/cms1500-print";
import { formatMonthDayYear } from "@/lib/format-date";
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
  const isAdmin = basePath === "/admin";
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
      if (isAdmin) {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("page_size", String(PAGE_SIZE));
        params.set("kind", "visit");
        params.set("list_filter", "all");
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
      } else {
        if (!searchDebounced) {
          setRows([]);
          setTotalCount(0);
          return;
        }
        const results = await apiGetAuth<
          Array<{
            invoice_id: number;
            invoice_number: string;
            patient_name: string;
            date_of_service: string | null;
            total_amount: string;
            status: string;
            kind?: string;
            visit_id?: number | null;
          }>
        >(`${basePath}/invoice_search/?q=${encodeURIComponent(searchDebounced)}`);
        const mapped = (results || []).map((r) => ({
          id: r.invoice_id,
          invoice_number: r.invoice_number,
          patient_name: r.patient_name,
          appointment_date: r.date_of_service,
          status: r.status,
          kind: r.kind || "visit",
          total_amount: r.total_amount,
          visit_id: r.visit_id ?? null,
        }));
        // Doctor search returns a capped list; page locally in chunks of 30.
        setTotalCount(mapped.length);
        const start = (page - 1) * PAGE_SIZE;
        setRows(mapped.slice(start, start + PAGE_SIZE));
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load invoices.");
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [basePath, isAdmin, searchDebounced, page]);

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
    <div className="space-y-6">
      {isAdmin ? (
        <AdminPageIntro
          title="Insurance claims"
          description="Find a visit invoice, then generate a CMS-1500 claim to print or email to the insurance company. Fill patient insurance details on the patient chart first for best results."
          pageHelp="Claims use visit documentation (CPT codes and diagnoses) plus insurance info saved on the patient chart. The table shows 30 invoices per page."
        />
      ) : (
        <DoctorPageIntro
          title="Insurance claims"
          description="Search one of your visit invoices by patient name or invoice number, then generate a CMS-1500 claim to print or email."
        />
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {isAdmin ? "Search patient or invoice #" : "Search your invoices"}
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              isAdmin
                ? "Patient name, patient ID, or invoice number…"
                : "Patient name, invoice number, or visit date (YYYY-MM-DD)…"
            }
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm shadow-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </label>
        {!isAdmin && !searchDebounced ? (
          <p className="mt-3 text-sm text-slate-500">
            Type a name or invoice number above to find visits you can claim.
          </p>
        ) : null}
      </section>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
          {error}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100/80">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-slate-900">
            {isAdmin ? "Visit invoices" : "Matching invoices"}
          </h2>
          {loading ? <Loader variant="spinner" label="Loading" /> : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50/95 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80">
              <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">Visit date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Claim</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    {isAdmin
                      ? searchDebounced
                        ? "No visit invoices match that search."
                        : "No visit invoices found yet."
                      : "No matching invoices."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const busy = claimBusyId === row.id;
                  const missingVisit = row.visit_id === null;
                  return (
                    <tr
                      key={row.id}
                      className="border-t border-slate-100 transition hover:bg-emerald-50/40"
                    >
                      <td className="px-4 py-3 align-middle">
                        <p className="font-medium text-slate-900">{row.patient_name}</p>
                        {missingVisit ? (
                          <p className="mt-0.5 text-xs font-medium text-amber-800">
                            Needs visit documentation
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 align-middle font-mono text-slate-700">
                        {row.invoice_number}
                      </td>
                      <td className="px-4 py-3 align-middle whitespace-nowrap text-slate-600">
                        {row.appointment_date ? formatMonthDayYear(row.appointment_date) : "—"}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <StatusChipView status={row.status} />
                      </td>
                      <td className="px-4 py-3 align-middle text-right font-medium tabular-nums text-slate-900">
                        {formatMoney(row.total_amount)}
                      </td>
                      <td className="px-4 py-3 align-middle text-right">
                        <button
                          type="button"
                          disabled={busy || missingVisit}
                          onClick={() => void openClaim(row.id)}
                          className="rounded-xl bg-[#0d5c2e] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#0a4a25] disabled:opacity-50 sm:text-sm"
                        >
                          {busy ? "Opening…" : "Generate claim"}
                        </button>
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
              "No invoices"
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
            <span className="text-sm text-slate-600">
              Page <span className="font-semibold tabular-nums text-slate-800">{page}</span> of{" "}
              <span className="font-semibold tabular-nums text-slate-800">{totalPages}</span>
            </span>
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
              aria-label="Previous page"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading || totalCount === 0}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <Cms1500PortalModal claim={claimModal} onClose={() => setClaimModal(null)} basePath={basePath} />
    </div>
  );
}
