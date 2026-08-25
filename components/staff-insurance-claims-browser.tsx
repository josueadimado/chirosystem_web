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
  const [rows, setRows] = useState<ClaimInvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [claimBusyId, setClaimBusyId] = useState<number | null>(null);
  const [claimModal, setClaimModal] = useState<Cms1500ClaimPayload | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (isAdmin) {
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("page_size", "30");
        params.set("kind", "visit");
        params.set("list_filter", "all");
        if (searchDebounced) params.set("search", searchDebounced);
        const data = await apiGetAuth<{
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
      } else {
        if (!searchDebounced) {
          setRows([]);
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
        setRows(
          (results || []).map((r) => ({
            id: r.invoice_id,
            invoice_number: r.invoice_number,
            patient_name: r.patient_name,
            appointment_date: r.date_of_service,
            status: r.status,
            kind: r.kind || "visit",
            total_amount: r.total_amount,
            visit_id: r.visit_id ?? null,
          })),
        );
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load invoices.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [basePath, isAdmin, searchDebounced]);

  useEffect(() => {
    void load();
  }, [load]);

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
          pageHelp="Claims use visit documentation (CPT codes and diagnoses) plus insurance info saved on the patient chart."
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

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-slate-900">
            {isAdmin ? "Recent visit invoices" : "Matching invoices"}
          </h2>
          {loading ? <Loader className="h-4 w-4" /> : null}
        </div>

        {!loading && rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500 sm:px-5">
            {isAdmin
              ? searchDebounced
                ? "No visit invoices match that search."
                : "No visit invoices found yet."
              : "No matching invoices."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => {
              const busy = claimBusyId === row.id;
              const missingVisit = row.visit_id === null;
              return (
                <li
                  key={row.id}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{row.patient_name}</p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      Invoice {row.invoice_number}
                      {row.appointment_date ? ` · ${formatMonthDayYear(row.appointment_date)}` : ""}
                      {` · ${formatMoney(row.total_amount)}`}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusChipView status={row.status} />
                      {missingVisit ? (
                        <span className="text-xs font-medium text-amber-800">
                          Needs visit documentation for a claim
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy || missingVisit}
                    onClick={() => void openClaim(row.id)}
                    className="shrink-0 rounded-xl bg-[#0d5c2e] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0a4a25] disabled:opacity-50"
                  >
                    {busy ? "Opening…" : "Generate claim"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Cms1500PortalModal claim={claimModal} onClose={() => setClaimModal(null)} basePath={basePath} />
    </div>
  );
}
