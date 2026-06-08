"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { useAppFeedback } from "@/components/app-feedback";
import { HelpTip } from "@/components/help-tip";
import { Loader } from "@/components/loader";
import { SquareTerminalCheckoutPoller } from "@/components/square-terminal-checkout";
import { Button } from "@/components/ui/button";
import { StatusChipView } from "@/components/status-chip";
import { ApiError, apiGetAuth, apiPost } from "@/lib/api";
import { EmailBillButton } from "@/components/email-bill-button";
import { emailPatientBillAdmin } from "@/lib/patient-bill-email";
import { usePatientBillEmail } from "@/hooks/use-patient-bill-email";
import type { PatientBillPayload } from "@/lib/patient-bill-print";
import { AdminVisitBillingModal } from "@/components/admin-visit-billing-modal";
import { PatientBillPortalModal } from "@/components/patient-bill-portal-modal";
import { PatientNameWithProfile } from "@/components/patient-payment-profile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatInstantAsMonthDayYear,
  formatInstantMonthDayYearTime,
  formatMonthDayYear,
} from "@/lib/format-date";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type BillingInvoiceRow = {
  id: number;
  invoice_number: string;
  patient_id: number;
  patient_name: string;
  patient_payment_profile?: string;
  patient_credit_balance: string;
  status: string;
  /** visit | no_show_fee | late_cancel_fee — only visit invoices support line-item edit before payment */
  kind: string;
  appointment_id: number;
  appointment_status: string;
  appointment_date: string | null;
  booked_service_id: number | null;
  total_amount: string;
  subtotal: string;
  discount: string;
  credit_applied_total: string;
  professional_discount_reason: string;
  tax: string;
  issued_at: string | null;
  paid_at: string | null;
  bill_charges_total?: string;
  patient_charge_total?: string;
  insurance_remaining_total?: string;
  payments_received_total?: string;
  remaining_client_responsibility_total?: string;
};

function formatMoney(amount: string): string {
  const n = parseFloat(amount);
  if (Number.isNaN(n)) return amount;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function formatWhen(iso: string | null): string {
  return formatInstantMonthDayYearTime(iso);
}

function invoiceKindLabel(kind: string): string {
  switch (kind) {
    case "visit":
      return "Visit";
    case "no_show_fee":
      return "No-show fee";
    case "late_cancel_fee":
      return "Late cancel";
    default:
      return kind.replace(/_/g, " ");
  }
}

type ListFilter = "all" | "open" | "paid" | "overdue";

type KindFilter = "" | "visit" | "no_show_fee" | "late_cancel_fee";

const KIND_FILTER_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: "", label: "All types" },
  { value: "visit", label: "Visit" },
  { value: "no_show_fee", label: "No-show fee" },
  { value: "late_cancel_fee", label: "Late cancel fee" },
];

type BillingInvoicesResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: BillingInvoiceRow[];
  summary: {
    total: number;
    open: number;
    overdue: number;
    paid: number;
  };
};

const BILLING_PAGE_SIZE = 25;

function parseMoneyNum(amount: string | undefined): number {
  if (amount == null || String(amount).trim() === "") return 0;
  const n = parseFloat(amount);
  return Number.isFinite(n) ? n : 0;
}

function hasActiveBillingFilters(args: {
  search: string;
  listFilter: ListFilter;
  kindFilter: KindFilter;
  visitDateFrom: string;
  visitDateTo: string;
  insuranceOnly: boolean;
}): boolean {
  return (
    args.search.trim() !== "" ||
    args.listFilter !== "all" ||
    args.kindFilter !== "" ||
    args.visitDateFrom !== "" ||
    args.visitDateTo !== "" ||
    args.insuranceOnly
  );
}

export default function AdminBillingPage() {
  const { runWithFeedback, toast } = useAppFeedback();
  const [invoices, setInvoices] = useState<BillingInvoiceRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState({ total: 0, open: 0, overdue: 0, paid: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<BillingInvoiceRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "card" | "online" | "manual">("cash");
  const [payRef, setPayRef] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [creditBusy, setCreditBusy] = useState(false);
  const [creditTopUpAmount, setCreditTopUpAmount] = useState("0");
  const [creditTerminalCheckoutId, setCreditTerminalCheckoutId] = useState<string | null>(null);
  const [printBusy, setPrintBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [patientBillModal, setPatientBillModal] = useState<PatientBillPayload | null>(null);
  const billEmail = usePatientBillEmail(emailPatientBillAdmin);
  const [billingEditAppointmentId, setBillingEditAppointmentId] = useState<number | null>(null);
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("");
  const [visitDateFrom, setVisitDateFrom] = useState("");
  const [visitDateTo, setVisitDateTo] = useState("");
  const [insuranceOnly, setInsuranceOnly] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(searchQuery), 350);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [listFilter, kindFilter, searchDebounced, visitDateFrom, visitDateTo, insuranceOnly]);

  const totalPages = Math.max(1, Math.ceil(totalCount / BILLING_PAGE_SIZE));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * BILLING_PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * BILLING_PAGE_SIZE, totalCount);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const filtersActive = hasActiveBillingFilters({
    search: searchQuery,
    listFilter,
    kindFilter,
    visitDateFrom,
    visitDateTo,
    insuranceOnly,
  });

  const clearFilters = () => {
    setSearchQuery("");
    setListFilter("all");
    setKindFilter("");
    setVisitDateFrom("");
    setVisitDateTo("");
    setInsuranceOnly(false);
  };

  const printBill = async (invoiceId: number) => {
    setPrintBusy(true);
    try {
      const bill = await apiGetAuth<PatientBillPayload>(`/admin/invoice_bill/?invoice_id=${invoiceId}`);
      setPatientBillModal(bill);
      toast.success("Patient bill opened — tap Print or Email when ready.");
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? e.message
          : "Could not print bill — make sure the invoice is paid first.",
      );
    } finally {
      setPrintBusy(false);
    }
  };

  const previewBill = async (invoiceId: number) => {
    setPreviewBusy(true);
    try {
      const bill = await apiGetAuth<PatientBillPayload>(
        `/admin/invoice_bill/?invoice_id=${invoiceId}&preview=1`,
        { cache: "no-store" },
      );
      setPatientBillModal(bill);
      toast.success("Preview opened — use Print patient bill after payment is recorded.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not load bill preview.");
    } finally {
      setPreviewBusy(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(BILLING_PAGE_SIZE));
      params.set("list_filter", listFilter);
      if (kindFilter) params.set("kind", kindFilter);
      if (searchDebounced.trim()) params.set("search", searchDebounced.trim());
      if (visitDateFrom) params.set("visit_date_from", visitDateFrom);
      if (visitDateTo) params.set("visit_date_to", visitDateTo);
      if (insuranceOnly) params.set("insurance_only", "1");

      const data = await apiGetAuth<BillingInvoicesResponse>(`/admin/billing_invoices/?${params}`);
      setInvoices(Array.isArray(data.results) ? data.results : []);
      setTotalCount(data.count ?? 0);
      setSummary(
        data.summary ?? { total: data.count ?? 0, open: 0, overdue: 0, paid: 0 },
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load invoices.");
      setInvoices([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, listFilter, kindFilter, searchDebounced, visitDateFrom, visitDateTo, insuranceOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const openInvoice = (inv: BillingInvoiceRow) => {
    setSelectedSnapshot(inv);
    setSelectedId(inv.id);
  };

  const selected =
    selectedId != null
      ? invoices.find((i) => i.id === selectedId) ?? selectedSnapshot
      : null;

  useEffect(() => {
    if (selected) {
      setPayAmount(selected.total_amount);
      setCreditTopUpAmount("0");
      setPayRef("");
      setCreditTerminalCheckoutId(null);
    }
  }, [selected?.id, selected?.total_amount]);

  const canRecordPayment =
    selected &&
    (selected.status === "issued" || selected.status === "overdue" || selected.status === "draft");

  /** Same rules as /admin/revise_visit_billing/ — normal visit invoices (open or already paid). */
  const canEditVisitBilling =
    selected &&
    selected.kind === "visit" &&
    selected.status !== "void" &&
    (selected.appointment_status === "awaiting_payment" || selected.appointment_status === "completed");

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

  const applyInvoiceCredit = async () => {
    if (!selected || !canRecordPayment) return;
    setCreditBusy(true);
    await runWithFeedback(
      async () => {
        await apiPost(`/invoices/${selected.id}/apply_credit/`, {});
        await load();
        setSelectedId(selected.id);
      },
      {
        loadingMessage: "Applying patient credit…",
        successMessage: "Patient credit applied.",
        errorFallback: "Could not apply credit.",
      },
    );
    setCreditBusy(false);
  };

  const topUpPatientCredit = async () => {
    if (!selected) return;
    const amt = parseFloat(creditTopUpAmount);
    if (Number.isNaN(amt) || amt <= 0) {
      toast.error("Enter a valid top-up amount.");
      return;
    }
    setCreditBusy(true);
    await runWithFeedback(
      async () => {
        await apiPost("/admin/patient_credit_topup/", {
          patient_id: selected.patient_id,
          amount: creditTopUpAmount,
        });
        await load();
        setSelectedId(selected.id);
      },
      {
        loadingMessage: "Adding patient credit…",
        successMessage: "Credit added to patient wallet.",
        errorFallback: "Could not add credit.",
      },
    );
    setCreditBusy(false);
  };

  const topUpPatientCreditByTerminal = async () => {
    if (!selected) return;
    const amt = parseFloat(creditTopUpAmount);
    if (Number.isNaN(amt) || amt <= 0) {
      toast.error("Enter a valid top-up amount.");
      return;
    }
    setCreditBusy(true);
    await runWithFeedback(
      async () => {
        const out = await apiPost<{ checkout_id: string }>("/admin/patient_credit_topup_terminal/", {
          patient_id: selected.patient_id,
          amount: creditTopUpAmount,
        });
        setCreditTerminalCheckoutId(out.checkout_id);
      },
      {
        loadingMessage: "Sending payment to terminal…",
        successMessage: "Terminal is ready — complete payment on device.",
        errorFallback: "Could not start terminal top-up.",
      },
    );
    setCreditBusy(false);
  };

  const billingEditRow =
    billingEditAppointmentId != null
      ? invoices.find((i) => i.appointment_id === billingEditAppointmentId) ??
        (selectedSnapshot?.appointment_id === billingEditAppointmentId ? selectedSnapshot : null)
      : null;

  return (
    <div className="space-y-6">
      <AdminPageIntro
        title="Invoices & billing"
        description="Browse invoices with dates and status at a glance. Open any row to record payment, apply credit, or print a bill."
        pageHelp="Search by patient or invoice #, filter by status, visit date, or bills with insurance lines. Open a row for payment, credit, or print."
      />

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>
      )}

      <section className="admin-panel">
        <div className="mb-4 space-y-4">
          <AdminSectionLabel help="Each row is an invoice. Open one to see totals, dates, and record payment if it is still open.">
            Invoice list
          </AdminSectionLabel>

          <div className="flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-slate-50/50 p-3 sm:p-4">
            <label className="block text-sm">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Search
              </span>
              <input
                type="search"
                className="admin-input w-full"
                placeholder="Patient name, invoice #, or patient ID…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
              />
            </label>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm">
                  {(
                    [
                      ["all", `All (${summary.total})`],
                      ["open", `Open (${summary.open})`],
                      ["overdue", `Overdue (${summary.overdue})`],
                      ["paid", `Paid (${summary.paid})`],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setListFilter(key)}
                      className={`rounded-lg px-3 py-1.5 font-medium transition ${
                        listFilter === key
                          ? "bg-[#ecfdf5] text-[#0d5c2e] shadow-sm ring-1 ring-[#16a349]/25"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="min-w-[10rem] flex-1 text-sm sm:max-w-[12rem]">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Invoice type
                </span>
                <select
                  className="admin-input w-full"
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value as KindFilter)}
                >
                  {KIND_FILTER_OPTIONS.map((o) => (
                    <option key={o.value || "all"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Visit date from
                </span>
                <input
                  type="date"
                  className="admin-input"
                  value={visitDateFrom}
                  onChange={(e) => setVisitDateFrom(e.target.value)}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Visit date to
                </span>
                <input
                  type="date"
                  className="admin-input"
                  value={visitDateTo}
                  onChange={(e) => setVisitDateTo(e.target.value)}
                />
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-[#16a349] focus:ring-[#16a349]/30"
                  checked={insuranceOnly}
                  onChange={(e) => setInsuranceOnly(e.target.checked)}
                />
                <span>Has insurance lines only</span>
                <HelpTip label="Insurance lines">
                  Shows invoices where part of the bill is documented for insurance (not charged to the patient at the
                  desk).
                </HelpTip>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-3 text-sm">
              <p className="text-slate-600">
                {totalCount === 0 ? (
                  "No invoices match"
                ) : (
                  <>
                    Showing{" "}
                    <span className="font-semibold tabular-nums text-slate-900">
                      {rangeStart}&ndash;{rangeEnd}
                    </span>{" "}
                    of <span className="font-semibold tabular-nums text-slate-900">{totalCount}</span>{" "}
                    invoice{totalCount === 1 ? "" : "s"}
                  </>
                )}
              </p>
              {filtersActive ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Clear all filters
                </button>
              ) : null}
            </div>
          </div>
        </div>
        {loading ? (
          <Loader variant="page" label="Loading invoices" sublabel="Fetching billing data…" />
        ) : summary.total === 0 && !filtersActive ? (
          <p className="py-8 text-center text-sm text-slate-500">No invoices yet. They appear when visits are completed.</p>
        ) : totalCount === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            <p>No invoices match your filters.</p>
            {filtersActive ? (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 text-sm font-semibold text-[#16a349] hover:underline"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100/80">
              <div className="max-h-[min(520px,65vh)] overflow-y-auto overscroll-contain">
            <table className="w-full min-w-[1020px] text-sm">
              <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50/95 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80">
                <tr className="text-left text-slate-500">
                  <th className="pb-2 pr-3 font-semibold">Issued</th>
                  <th className="pb-2 pr-3 font-semibold">Visit date</th>
                  <th className="pb-2 pr-3 font-semibold">Type</th>
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
                  <th className="pb-2 pr-3 font-semibold text-right">
                    <span className="inline-flex items-center gap-1">
                      Patient Payments
                      <HelpTip label="Patient Payments">Amount the client pays at the clinic.</HelpTip>
                    </span>
                  </th>
                  <th className="pb-2 pr-3 font-semibold text-right">
                    <span className="inline-flex items-center gap-1">
                      Insurance
                      <HelpTip label="Insurance">Portion documented for insurance (not charged to patient).</HelpTip>
                    </span>
                  </th>
                  <th className="pb-2 font-semibold text-right"> </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50/80"
                    onClick={() => openInvoice(inv)}
                  >
                    <td className="py-2.5 pr-3 whitespace-nowrap text-slate-700">
                      {formatInstantAsMonthDayYear(inv.issued_at)}
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap text-slate-600">
                      {formatMonthDayYear(inv.appointment_date)}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600">{invoiceKindLabel(inv.kind)}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-slate-800">{inv.invoice_number}</td>
                    <td className="py-2.5 pr-3 font-medium text-slate-900">
                      <PatientNameWithProfile name={inv.patient_name} profile={inv.patient_payment_profile} compactBadge />
                    </td>
                    <td className="py-2.5 pr-3">
                      <StatusChipView status={inv.status} />
                    </td>
                    <td className="py-2.5 pr-3 text-right font-medium tabular-nums text-[#0d5c2e]">
                      {formatMoney(inv.patient_charge_total ?? inv.total_amount)}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600">
                      {parseMoneyNum(inv.insurance_remaining_total) > 0.009
                        ? formatMoney(inv.insurance_remaining_total!)
                        : "—"}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openInvoice(inv);
                        }}
                        className="rounded-lg border border-[#16a349]/30 bg-[#ecfdf5] px-3 py-1.5 text-xs font-semibold text-[#0d5c2e] hover:bg-[#d1fae5]"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
              </div>
            </div>

            {totalPages > 1 ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  Page <span className="font-semibold tabular-nums text-slate-700">{page}</span> of{" "}
                  <span className="tabular-nums">{totalPages}</span>
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="text-slate-400">{BILLING_PAGE_SIZE} per page</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-lg border-slate-200 px-4 text-xs font-semibold"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-lg border-slate-200 px-4 text-xs font-semibold"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    aria-label="Next page"
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <Dialog
        open={selectedId != null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            setSelectedSnapshot(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl sm:max-h-[min(calc(100dvh-2rem),52rem)]">
          {!selected ? null : (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle className="font-semibold text-slate-900">Invoice details</DialogTitle>
                <DialogDescription className="font-mono text-xs text-slate-600">{selected.invoice_number}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <StatusChipView status={selected.status} />
                <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {invoiceKindLabel(selected.kind)}
                </span>
              </div>

              <div className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  <PatientNameWithProfile name={selected.patient_name} profile={selected.patient_payment_profile} />
                </p>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Issued</dt>
                    <dd className="text-slate-800">{formatWhen(selected.issued_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Visit date</dt>
                    <dd className="text-slate-800">{formatMonthDayYear(selected.appointment_date)}</dd>
                  </div>
                  {selected.paid_at ? (
                    <div>
                      <dt className="text-xs font-medium text-slate-500">Paid</dt>
                      <dd className="text-slate-800">{formatWhen(selected.paid_at)}</dd>
                    </div>
                  ) : null}
                  {selected.appointment_id ? (
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-medium text-slate-500">Linked appointment</dt>
                      <dd>
                        <Link
                          href={`/admin/schedule?appointment=${selected.appointment_id}`}
                          className="text-sm font-medium text-[#16a349] hover:underline"
                          onClick={() => setSelectedId(null)}
                        >
                          Open on schedule →
                        </Link>
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <dl className="mt-3 space-y-1 border-t border-slate-200/80 pt-3 text-sm">
                  <p className="pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Bill breakdown
                  </p>
                  {selected.bill_charges_total ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Total documented (all lines)</dt>
                      <dd className="font-medium tabular-nums">{formatMoney(selected.bill_charges_total)}</dd>
                    </div>
                  ) : null}
                  {selected.patient_charge_total ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Patient Payments</dt>
                      <dd className="font-medium tabular-nums text-[#0d5c2e]">
                        {formatMoney(selected.patient_charge_total)}
                      </dd>
                    </div>
                  ) : null}
                  {selected.insurance_remaining_total &&
                  parseFloat(selected.insurance_remaining_total) > 0 ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Remaining balance</dt>
                      <dd className="font-medium tabular-nums text-slate-800">
                        {formatMoney(selected.insurance_remaining_total)}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Payments received</dt>
                    <dd className="font-medium tabular-nums">
                      {formatMoney(selected.payments_received_total ?? "0")}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 font-semibold text-slate-900">
                    <dt className="text-slate-700">Remaining Client Responsibility</dt>
                    <dd className="tabular-nums">
                      {formatMoney(
                        selected.remaining_client_responsibility_total ??
                          String(
                            Math.max(
                              0,
                              parseMoneyNum(selected.patient_charge_total ?? selected.total_amount) -
                                parseMoneyNum(selected.payments_received_total),
                            ),
                          ),
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-slate-200/60 pt-2">
                    <dt className="text-slate-500">Patient credit balance</dt>
                    <dd className="font-medium tabular-nums text-emerald-700">{formatMoney(selected.patient_credit_balance)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Patient portion (before discount)</dt>
                    <dd className="font-medium tabular-nums">{formatMoney(selected.subtotal)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Professional discount (internal)</dt>
                    <dd className="font-medium tabular-nums text-emerald-700">-{formatMoney(selected.discount)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Credit applied (wallet)</dt>
                    <dd className="font-medium tabular-nums text-emerald-700">-{formatMoney(selected.credit_applied_total)}</dd>
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
                {parseFloat(selected.discount || "0") > 0 ? (
                  <div className="mt-2 space-y-1 text-[11px] leading-relaxed text-slate-500">
                    <p>
                      Internal adjustment only. This discount is tracked for clinic records and workflow history, but it is
                      not shown as a separate line on the patient-facing printed bill.
                    </p>
                    {selected.professional_discount_reason?.trim() ? (
                      <p>
                        Reason: <span className="font-medium text-slate-700">{selected.professional_discount_reason}</span>
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {(selected.status === "issued" || selected.status === "overdue" || selected.status === "draft") && (
                <div className="flex flex-col gap-2">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Patient credit wallet</p>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="admin-input"
                        placeholder="Top-up amount"
                        value={creditTopUpAmount}
                        onChange={(e) => setCreditTopUpAmount(e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={creditBusy}
                        onClick={() => void topUpPatientCredit()}
                        className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        Top up
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={creditBusy}
                      onClick={() => void topUpPatientCreditByTerminal()}
                      className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      Top up via Square Terminal
                    </button>
                    <button
                      type="button"
                      disabled={creditBusy}
                      onClick={() => void applyInvoiceCredit()}
                      className="mt-2 w-full rounded-xl border border-emerald-400 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Apply available credit to this invoice
                    </button>
                    {creditTerminalCheckoutId && (
                      <div className="mt-2">
                        <SquareTerminalCheckoutPoller
                          checkoutId={creditTerminalCheckoutId}
                          statusPath="/admin/terminal_checkout_status/"
                          onComplete={() => {
                            setCreditTerminalCheckoutId(null);
                            toast.success("Terminal top-up completed — patient credit was added.");
                            void load();
                            if (selected) setSelectedId(selected.id);
                          }}
                          onTerminalError={(msg) => {
                            setCreditTerminalCheckoutId(null);
                            toast.error(msg);
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={previewBusy}
                    onClick={() => void previewBill(selected.id)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    {previewBusy ? "Loading…" : "Preview patient bill (before payment)"}
                  </button>
                  {canEditVisitBilling && (
                    <button
                      type="button"
                      onClick={() => setBillingEditAppointmentId(selected.appointment_id)}
                      className="w-full rounded-xl border border-[#16a349]/40 bg-[#ecfdf5] px-4 py-2.5 text-sm font-semibold text-[#0d5c2e] shadow-sm hover:bg-[#d1fae5]"
                    >
                      Edit billing (lines &amp; diagnosis)
                    </button>
                  )}
                </div>
              )}

              {selected.status === "paid" && (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <EmailBillButton
                      onClick={() => void billEmail.send(selected.id)}
                      sending={billEmail.isSending(selected.id)}
                      sentTo={billEmail.sentFor(selected.id)}
                      className="w-full sm:flex-1"
                    />
                    <button
                      type="button"
                      disabled={printBusy}
                      onClick={() => void printBill(selected.id)}
                      className="w-full rounded-xl bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50 sm:flex-1"
                    >
                      {printBusy ? "Loading…" : "Print patient bill"}
                    </button>
                  </div>
                  {canEditVisitBilling ? (
                    <button
                      type="button"
                      onClick={() => setBillingEditAppointmentId(selected.appointment_id)}
                      className="w-full rounded-xl border border-[#16a349]/40 bg-[#ecfdf5] px-4 py-2.5 text-sm font-semibold text-[#0d5c2e] shadow-sm hover:bg-[#d1fae5]"
                    >
                      Edit billing (lines &amp; diagnosis)
                    </button>
                  ) : null}
                </div>
              )}

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
        </DialogContent>
      </Dialog>

      <PatientBillPortalModal
        bill={patientBillModal}
        onClose={() => {
          setPatientBillModal(null);
          billEmail.clearSent();
        }}
        emailingBill={
          patientBillModal?.invoice_id ? billEmail.isSending(patientBillModal.invoice_id) : false
        }
        emailSentTo={
          patientBillModal?.invoice_id ? billEmail.sentFor(patientBillModal.invoice_id) : null
        }
        onEmailBill={
          patientBillModal?.invoice_id
            ? () => void billEmail.send(patientBillModal.invoice_id!)
            : undefined
        }
      />
      {billingEditRow ? (
        <AdminVisitBillingModal
          open
          appointmentId={billingEditRow.appointment_id}
          appointmentDate={billingEditRow.appointment_date ?? ""}
          bookedServiceId={billingEditRow.booked_service_id}
          patientLabel={billingEditRow.patient_name}
          onClose={() => setBillingEditAppointmentId(null)}
          onSaved={() => {
            void load();
            setBillingEditAppointmentId(null);
          }}
        />
      ) : null}
    </div>
  );
}
