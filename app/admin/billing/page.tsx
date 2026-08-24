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
import type { Cms1500ClaimPayload } from "@/lib/cms1500-print";
import { AdminVisitBillingModal } from "@/components/admin-visit-billing-modal";
import { PatientBillPortalModal } from "@/components/patient-bill-portal-modal";
import { Cms1500PortalModal } from "@/components/cms1500-portal-modal";
import { PatientNameWithProfile } from "@/components/patient-payment-profile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatInstantMonthDayYearTime,
  formatMonthDayYear,
} from "@/lib/format-date";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

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

/** What the patient still owes at the desk (preferred field, else charge − payments). */
function amountDueStr(inv: BillingInvoiceRow): string {
  if (inv.remaining_client_responsibility_total != null && String(inv.remaining_client_responsibility_total).trim() !== "") {
    return inv.remaining_client_responsibility_total;
  }
  const due = Math.max(
    0,
    parseMoneyNum(inv.patient_charge_total ?? inv.total_amount) - parseMoneyNum(inv.payments_received_total),
  );
  return due.toFixed(2);
}

function amountDueNum(inv: BillingInvoiceRow): number {
  return parseMoneyNum(amountDueStr(inv));
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

function BillingCollapsible({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {summary ? <p className="mt-0.5 text-xs text-slate-500">{summary}</p> : null}
        </div>
        <span className="shrink-0 text-xs font-semibold text-[#0d5c2e]">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? <div className="border-t border-slate-100 px-4 py-3">{children}</div> : null}
    </div>
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
  const [claimBusy, setClaimBusy] = useState(false);
  const [patientBillModal, setPatientBillModal] = useState<PatientBillPayload | null>(null);
  const [insuranceClaimModal, setInsuranceClaimModal] = useState<Cms1500ClaimPayload | null>(null);
  const billEmail = usePatientBillEmail(emailPatientBillAdmin);
  const [billingEditAppointmentId, setBillingEditAppointmentId] = useState<number | null>(null);
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("");
  const [visitDateFrom, setVisitDateFrom] = useState("");
  const [visitDateTo, setVisitDateTo] = useState("");
  const [insuranceOnly, setInsuranceOnly] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{
    ready: boolean;
    summary: string;
  } | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(searchQuery), 350);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    let cancelled = false;
    apiGetAuth<{ ready: boolean; summary: string }>("/admin/email_status/")
      .then((data) => {
        if (!cancelled) setEmailStatus({ ready: !!data.ready, summary: data.summary || "" });
      })
      .catch(() => {
        if (!cancelled) setEmailStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [listFilter, kindFilter, searchDebounced, visitDateFrom, visitDateTo, insuranceOnly]);

  useEffect(() => {
    if (kindFilter || visitDateFrom || visitDateTo || insuranceOnly) {
      setShowMoreFilters(true);
    }
  }, [kindFilter, visitDateFrom, visitDateTo, insuranceOnly]);

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

  const openInsuranceClaim = async (invoiceId: number) => {
    setClaimBusy(true);
    try {
      const claim = await apiGetAuth<Cms1500ClaimPayload>(
        `/admin/insurance_claim/?invoice_id=${invoiceId}`,
      );
      setInsuranceClaimModal(claim);
      toast.success("Insurance claim opened — print or email when ready.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not build insurance claim.");
    } finally {
      setClaimBusy(false);
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
      setPayAmount(amountDueStr(selected));
      setCreditTopUpAmount("0");
      setPayRef("");
      setCreditTerminalCheckoutId(null);
    }
  }, [selected?.id, selected?.remaining_client_responsibility_total, selected?.total_amount, selected?.patient_charge_total, selected?.payments_received_total]);

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
        description="Collect what patients owe, clear overdue invoices, and open any row to record payment or print a bill."
        pageHelp="Search by patient or invoice #. Use status chips for open or overdue. More filters cover invoice type, visit dates, and insurance lines."
      />

      {emailStatus && !emailStatus.ready ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
          <span className="font-bold">Bill email is not ready. </span>
          {emailStatus.summary}
        </p>
      ) : null}

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>
      )}

      {!loading && (summary.overdue > 0 || summary.open > 0) ? (
        <section
          className="rounded-2xl border border-amber-200/90 bg-amber-50/80 px-4 py-3.5 shadow-sm ring-1 ring-amber-100"
          aria-label="Needs attention"
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900/80">Needs attention</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {summary.overdue > 0 ? (
              <button
                type="button"
                onClick={() => setListFilter("overdue")}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                  listFilter === "overdue"
                    ? "border-rose-400 bg-rose-100 text-rose-900"
                    : "border-rose-200 bg-white text-rose-800 hover:bg-rose-50",
                )}
              >
                Overdue ({summary.overdue})
              </button>
            ) : null}
            {summary.open > 0 ? (
              <button
                type="button"
                onClick={() => setListFilter("open")}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                  listFilter === "open"
                    ? "border-amber-400 bg-amber-100 text-amber-950"
                    : "border-amber-200 bg-white text-amber-900 hover:bg-amber-50",
                )}
              >
                Open / unpaid ({summary.open})
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-amber-950/80">
            Tap a chip to filter the list, then open a row to record payment.
          </p>
        </section>
      ) : null}

      <section className="admin-panel">
        <div className="mb-4 space-y-3">
          <AdminSectionLabel help="Each row is an invoice. Open one to see amount due and record payment if it is still open.">
            Invoice list
          </AdminSectionLabel>

          <div className="space-y-3 rounded-xl border border-slate-200/90 bg-slate-50/40 p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <label className="block min-w-0 flex-1 text-sm sm:max-w-md">
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
              <p className="text-xs text-slate-500 sm:pb-2.5">
                {summary.total} total · {summary.open} open · {summary.overdue} overdue · {summary.paid} paid
              </p>
            </div>

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
                    className={cn(
                      "rounded-lg px-3 py-1.5 font-medium transition",
                      listFilter === key
                        ? "bg-[#ecfdf5] text-[#0d5c2e] shadow-sm ring-1 ring-[#16a349]/25"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowMoreFilters((v) => !v)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                aria-expanded={showMoreFilters}
              >
                {showMoreFilters ? "Hide filters" : "More filters"}
              </button>
              {filtersActive ? (
                <button
                  type="button"
                  onClick={() => {
                    clearFilters();
                    setShowMoreFilters(false);
                  }}
                  className="text-xs font-semibold text-[#0d5c2e] hover:underline"
                >
                  Clear all filters
                </button>
              ) : null}
            </div>

            {showMoreFilters ? (
              <div className="space-y-3 border-t border-slate-200/80 pt-3">
                <div className="flex flex-wrap items-end gap-3">
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
              </div>
            ) : null}

            <div className="border-t border-slate-200/80 pt-3 text-sm text-slate-600">
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
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50/95 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80">
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-3 pl-4">Patient</th>
                      <th className="hidden px-3 py-3 md:table-cell">Visit</th>
                      <th className="hidden px-3 py-3 lg:table-cell">Type</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-right">
                        <span className="inline-flex items-center justify-end gap-1">
                          Patient owes
                          <HelpTip label="Patient owes">
                            Amount still due from the patient at the desk (client responsibility remaining).
                          </HelpTip>
                        </span>
                      </th>
                      <th className="hidden px-3 py-3 text-right xl:table-cell">
                        <span className="inline-flex items-center justify-end gap-1">
                          Insurance
                          <HelpTip label="Insurance">Portion documented for insurance (not charged to patient).</HelpTip>
                        </span>
                      </th>
                      <th className="w-[4.5rem] px-2 py-3 pr-4 text-right">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => {
                      const due = amountDueNum(inv);
                      const isOverdue = inv.status === "overdue";
                      const isOpen = inv.status === "issued" || inv.status === "draft" || isOverdue;
                      const hasDue = isOpen && due > 0.009;
                      return (
                        <tr
                          key={inv.id}
                          className={cn(
                            "cursor-pointer border-t border-slate-100 transition",
                            isOverdue
                              ? "bg-rose-50/70 hover:bg-rose-50"
                              : hasDue
                                ? "bg-amber-50/40 hover:bg-amber-50/70"
                                : "hover:bg-slate-50/80",
                          )}
                          onClick={() => openInvoice(inv)}
                        >
                          <td className="px-3 py-3 pl-4 align-middle">
                            <p className="font-medium text-slate-900">
                              <PatientNameWithProfile
                                name={inv.patient_name}
                                profile={inv.patient_payment_profile}
                                compactBadge
                              />
                            </p>
                            <p className="mt-0.5 font-mono text-[11px] text-slate-400">{inv.invoice_number}</p>
                            <p className="mt-0.5 text-xs text-slate-500 md:hidden">
                              Visit {formatMonthDayYear(inv.appointment_date)}
                            </p>
                          </td>
                          <td className="hidden whitespace-nowrap px-3 py-3 align-middle text-slate-600 md:table-cell">
                            {formatMonthDayYear(inv.appointment_date)}
                          </td>
                          <td className="hidden px-3 py-3 align-middle text-slate-600 lg:table-cell">
                            {invoiceKindLabel(inv.kind)}
                          </td>
                          <td className="px-3 py-3 align-middle">
                            <StatusChipView status={inv.status} />
                          </td>
                          <td
                            className={cn(
                              "px-3 py-3 text-right align-middle font-semibold tabular-nums",
                              isOverdue
                                ? "text-rose-800"
                                : hasDue
                                  ? "text-amber-900"
                                  : "text-slate-700",
                            )}
                          >
                            {isOpen ? formatMoney(amountDueStr(inv)) : formatMoney("0")}
                            {isOverdue ? (
                              <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide text-rose-700">
                                Overdue
                              </span>
                            ) : hasDue ? (
                              <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide text-amber-700">
                                Due
                              </span>
                            ) : null}
                          </td>
                          <td className="hidden px-3 py-3 text-right align-middle tabular-nums text-slate-600 xl:table-cell">
                            {parseMoneyNum(inv.insurance_remaining_total) > 0.009
                              ? formatMoney(inv.insurance_remaining_total!)
                              : "—"}
                          </td>
                          <td className="px-2 py-3 pr-4 text-right align-middle">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openInvoice(inv);
                              }}
                              className="text-xs font-semibold text-[#16a349] underline-offset-2 hover:underline"
                            >
                              Open
                            </button>
                          </td>
                        </tr>
                      );
                    })}
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
                <DialogTitle className="font-semibold text-slate-900">
                  <PatientNameWithProfile name={selected.patient_name} profile={selected.patient_payment_profile} />
                </DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-2 text-slate-600">
                  <span className="font-mono text-xs">{selected.invoice_number}</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs">{invoiceKindLabel(selected.kind)}</span>
                  <span className="text-slate-300">·</span>
                  <StatusChipView status={selected.status} />
                </DialogDescription>
              </DialogHeader>

              <div
                className={cn(
                  "rounded-xl border px-4 py-3",
                  selected.status === "overdue"
                    ? "border-rose-200 bg-rose-50/80"
                    : canRecordPayment
                      ? "border-amber-200 bg-amber-50/70"
                      : "border-slate-200 bg-slate-50/80",
                )}
              >
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {canRecordPayment ? "Patient owes" : "Patient portion"}
                </p>
                <p
                  className={cn(
                    "mt-1 text-3xl font-bold tabular-nums tracking-tight",
                    selected.status === "overdue"
                      ? "text-rose-800"
                      : canRecordPayment
                        ? "text-amber-950"
                        : "text-slate-900",
                  )}
                >
                  {formatMoney(canRecordPayment ? amountDueStr(selected) : selected.patient_charge_total ?? selected.total_amount)}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Visit {formatMonthDayYear(selected.appointment_date)}
                  {selected.paid_at ? ` · Paid ${formatWhen(selected.paid_at)}` : null}
                </p>
                {selected.appointment_id ? (
                  <Link
                    href={`/admin/schedule?appointment=${selected.appointment_id}`}
                    className="mt-2 inline-block text-xs font-semibold text-[#16a349] hover:underline"
                    onClick={() => setSelectedId(null)}
                  >
                    Open on schedule →
                  </Link>
                ) : null}
              </div>

              {canRecordPayment ? (
                <div className="space-y-3 rounded-xl border border-[#16a349]/25 bg-[#ecfdf5]/40 p-4">
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

              {(selected.status === "issued" || selected.status === "overdue" || selected.status === "draft") && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={previewBusy}
                    onClick={() => void previewBill(selected.id)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    {previewBusy ? "Loading…" : "Preview patient bill (before payment)"}
                  </button>
                  <button
                    type="button"
                    disabled={claimBusy}
                    onClick={() => void openInsuranceClaim(selected.id)}
                    className="w-full rounded-xl border border-[#0d5c2e]/30 bg-[#ecfdf5] px-4 py-2.5 text-sm font-semibold text-[#0d5c2e] shadow-sm hover:bg-[#d1fae5] disabled:opacity-50"
                  >
                    {claimBusy ? "Loading…" : "Generate insurance claim (CMS-1500)"}
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
                  <BillingCollapsible
                    title="Patient credit wallet"
                    summary={`Available credit: ${formatMoney(selected.patient_credit_balance)}`}
                    defaultOpen={false}
                  >
                    <div className="flex gap-2">
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
                  </BillingCollapsible>
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
                  <button
                    type="button"
                    disabled={claimBusy}
                    onClick={() => void openInsuranceClaim(selected.id)}
                    className="w-full rounded-xl border border-[#0d5c2e]/30 bg-[#ecfdf5] px-4 py-2.5 text-sm font-semibold text-[#0d5c2e] shadow-sm hover:bg-[#d1fae5] disabled:opacity-50"
                  >
                    {claimBusy ? "Loading…" : "Generate insurance claim (CMS-1500)"}
                  </button>
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

              <BillingCollapsible
                title="Full bill breakdown"
                summary="Charges, insurance, discounts, and payments"
                defaultOpen={false}
              >
                <dl className="space-y-1 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Issued</dt>
                    <dd className="text-slate-800">{formatWhen(selected.issued_at)}</dd>
                  </div>
                  {selected.bill_charges_total ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Total documented (all lines)</dt>
                      <dd className="font-medium tabular-nums">{formatMoney(selected.bill_charges_total)}</dd>
                    </div>
                  ) : null}
                  {selected.patient_charge_total ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Patient charge</dt>
                      <dd className="font-medium tabular-nums text-[#0d5c2e]">
                        {formatMoney(selected.patient_charge_total)}
                      </dd>
                    </div>
                  ) : null}
                  {selected.insurance_remaining_total && parseFloat(selected.insurance_remaining_total) > 0 ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Insurance portion</dt>
                      <dd className="font-medium tabular-nums text-slate-800">
                        {formatMoney(selected.insurance_remaining_total)}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Already paid</dt>
                    <dd className="font-medium tabular-nums">
                      {formatMoney(selected.payments_received_total ?? "0")}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 font-semibold text-slate-900">
                    <dt className="text-slate-700">Patient still owes</dt>
                    <dd className="tabular-nums">{formatMoney(amountDueStr(selected))}</dd>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-slate-200/60 pt-2">
                    <dt className="text-slate-500">Patient credit balance</dt>
                    <dd className="font-medium tabular-nums text-emerald-700">
                      {formatMoney(selected.patient_credit_balance)}
                    </dd>
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
                    <dd className="font-medium tabular-nums text-emerald-700">
                      -{formatMoney(selected.credit_applied_total)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Tax</dt>
                    <dd className="font-medium tabular-nums">{formatMoney(selected.tax)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 font-semibold text-slate-900">
                    <dt>Invoice total</dt>
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
                        Reason:{" "}
                        <span className="font-medium text-slate-700">{selected.professional_discount_reason}</span>
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </BillingCollapsible>
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
      <Cms1500PortalModal
        claim={insuranceClaimModal}
        onClose={() => setInsuranceClaimModal(null)}
        basePath="/admin"
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
