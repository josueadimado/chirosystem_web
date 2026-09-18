"use client";

import { Loader } from "@/components/loader";
import { PatientNoShowBadge } from "@/components/status-chip";
import { PatientDetailModal } from "@/components/patient-detail-modal";
import { PatientNameWithProfile } from "@/components/patient-payment-profile";
import { UsDateInput } from "@/components/us-date-input";
import { Button } from "@/components/ui/button";
import { ApiError, apiGetAuth, apiPost, apiUploadAuth } from "@/lib/api";
import { formatMonthDayYear } from "@/lib/format-date";
import { isNewNavBadgeActive } from "@/lib/staff-announcements";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";

/** Must sit above admin chrome (`sticky` header ~ z-30). Portaling to `document.body` avoids ancestor stacking contexts. */
const ADD_PATIENT_MODAL_Z = "z-[400]";

type LegacyImportCounts = {
  total_rows: number;
  skip_existing: number;
  skip_bad_row: number;
  would_add: number;
  added: number;
  no_phone_add: number;
  errors: number;
};

type LegacyImportResult = {
  dry_run: boolean;
  provider_id: number;
  provider_name: string;
  counts: LegacyImportCounts;
  sample_rows?: Array<{
    row: string;
    first_name: string;
    last_name: string;
    action: string;
    detail: string;
  }>;
  sample_note?: string;
};

type Patient = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  visit_count: number;
  last_visit: string | null;
  last_service: string | null;
  next_appointment_date: string | null;
  next_appointment_time: string | null;
  date_established: string | null;
  no_show_count?: number;
  balance: string;
  balance_visit?: string;
  balance_no_show_fee?: string;
  balance_late_cancel_fee?: string;
  has_overdue?: boolean;
  payment_profile?: string;
  iris_tag?: boolean;
};

type SortMode = "name_asc" | "visit_desc" | "visit_asc" | "balance_desc" | "balance_asc";

/** Who shows up in the list — matches unpaid invoice kinds and no-show history. */
type PatientListFilter =
  | ""
  | "balance_due"
  | "overdue"
  | "no_show_fee"
  | "late_cancel_fee"
  | "penalty_fees"
  | "no_show_history"
  | "no_phone";

/** Filters for the patient list dropdown. */
const PATIENT_FILTER_OPTIONS: { value: PatientListFilter; label: string }[] = [
  { value: "", label: "All patients" },
  { value: "balance_due", label: "Balance due" },
  { value: "overdue", label: "Overdue" },
  { value: "penalty_fees", label: "Penalty fees" },
  { value: "no_phone", label: "No phone" },
  { value: "no_show_fee", label: "Owes no-show fee" },
  { value: "late_cancel_fee", label: "Owes cancellation fee" },
  { value: "no_show_history", label: "Has no-show on record" },
];

function patientHasNoPhone(p: Patient): boolean {
  // Fewer than 10 digits = missing / incomplete (imports may store blank).
  const digits = String(p.phone || "").replace(/\D/g, "");
  return digits.length < 10;
}

function penaltyBalanceDue(p: Patient): number {
  return parseBalanceNum(p.balance_no_show_fee) + parseBalanceNum(p.balance_late_cancel_fee);
}

function matchesPatientListFilter(p: Patient, filter: PatientListFilter): boolean {
  if (!filter) return true;
  switch (filter) {
    case "balance_due":
      return parseBalanceNum(p.balance) > 0.009;
    case "overdue":
      return !!p.has_overdue;
    case "no_show_fee":
      return parseBalanceNum(p.balance_no_show_fee) > 0.009;
    case "late_cancel_fee":
      return parseBalanceNum(p.balance_late_cancel_fee) > 0.009;
    case "penalty_fees":
      return penaltyBalanceDue(p) > 0.009;
    case "no_show_history":
      return (p.no_show_count ?? 0) > 0;
    case "no_phone":
      return patientHasNoPhone(p);
    default:
      return true;
  }
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Download the current filtered list as a CSV Excel can open. */
function downloadPatientsSpreadsheet(rows: Patient[], filename: string) {
  const headers = [
    "Patient ID",
    "First Name",
    "Last Name",
    "Phone",
    "Email",
    "Last Visit",
    "Visits",
    "Next Appointment",
    "Balance",
  ];
  const lines = [headers.join(",")];
  for (const p of rows) {
    lines.push(
      [
        String(p.id),
        csvEscape(p.first_name || ""),
        csvEscape(p.last_name || ""),
        csvEscape(p.phone || ""),
        csvEscape(p.email || ""),
        csvEscape(p.last_visit || ""),
        String(typeof p.visit_count === "number" ? p.visit_count : 0),
        csvEscape(nextAppointmentLabel(p) || ""),
        csvEscape(p.balance || "0"),
      ].join(","),
    );
  }
  // BOM helps Excel open UTF-8 names correctly
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function balanceDueHints(p: Patient): string[] {
  const hints: string[] = [];
  const visit = parseBalanceNum(p.balance_visit);
  const ns = parseBalanceNum(p.balance_no_show_fee);
  const lc = parseBalanceNum(p.balance_late_cancel_fee);
  if (p.has_overdue) hints.push("Overdue");
  if (visit > 0.009) hints.push(`Visit ${formatBalance(p.balance_visit ?? "0")}`);
  if (ns > 0.009) hints.push(`No-show ${formatBalance(p.balance_no_show_fee ?? "0")}`);
  if (lc > 0.009) hints.push(`Cancel ${formatBalance(p.balance_late_cancel_fee ?? "0")}`);
  return hints;
}

function parseBalanceNum(balanceStr: string | null | undefined): number {
  if (balanceStr == null || String(balanceStr).trim() === "") return 0;
  const n = parseFloat(balanceStr);
  return Number.isFinite(n) ? n : 0;
}

/** Plain-language label when we have no completed visit on file. */
function lastVisitLabel(p: Patient): string {
  if (p.last_visit == null || String(p.last_visit).trim() === "") return "No visit yet";
  return formatMonthDayYear(p.last_visit);
}

function establishedLabel(p: Patient): string {
  if (p.date_established == null || String(p.date_established).trim() === "") return "—";
  return formatMonthDayYear(p.date_established);
}

function formatApiTime12h(raw: string | null | undefined): string | null {
  if (raw == null || String(raw).trim() === "") return null;
  const s = String(raw).trim();
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return s;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${min} ${ampm}`;
}

function nextAppointmentLabel(p: Patient): string | null {
  if (!p.next_appointment_date) return null;
  const date = formatMonthDayYear(p.next_appointment_date);
  const time = formatApiTime12h(p.next_appointment_time);
  return time ? `${date} · ${time}` : date;
}

function formatBalance(balanceStr: string): string {
  const num = parseFloat(balanceStr);
  if (isNaN(num)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

/** US-style display for list rows; returns null if nothing useful to show */
function formatPhoneCompact(raw: string): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  const d = trimmed.replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return trimmed;
}

/** Two letters for avatar — common in healthcare and office directories */
function patientInitials(p: Patient): string {
  const f = p.first_name.trim();
  const l = p.last_name.trim();
  if (f && l) return `${f[0]}${l[0]}`.toUpperCase();
  const one = f || l;
  if (one.length >= 2) return one.slice(0, 2).toUpperCase();
  if (one.length === 1) return `${one[0]}${one[0]}`.toUpperCase();
  return "?";
}

/** "Last, First" — easy to scan and matches many practice-management rosters */
function patientDirectoryName(p: Patient): { last: string; first: string } {
  return { last: p.last_name.trim() || "—", first: p.first_name.trim() || "—" };
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm transition focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15";

/** Rows per page options for the large patient directory */
const PAGE_SIZE_OPTIONS = [50, 100, 200] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
const DEFAULT_PAGE_SIZE: PageSize = 50;
const PAGE_SIZE_STORAGE_KEY = "admin_patients_page_size";

function readStoredPageSize(): PageSize {
  if (typeof window === "undefined") return DEFAULT_PAGE_SIZE;
  try {
    const raw = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
    if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(raw)) return raw as PageSize;
  } catch {
    /* ignore */
  }
  return DEFAULT_PAGE_SIZE;
}

function compareName(a: Patient, b: Patient): number {
  const ln = a.last_name.trim().localeCompare(b.last_name.trim(), undefined, { sensitivity: "base" });
  if (ln !== 0) return ln;
  return a.first_name.trim().localeCompare(b.first_name.trim(), undefined, { sensitivity: "base" });
}

function visitSortKey(iso: string | null): number {
  if (iso == null || String(iso).trim() === "") return 0;
  const t = new Date(`${String(iso).trim()}T12:00:00`).getTime();
  return Number.isFinite(t) ? t : 0;
}

export default function AdminPatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailPatientId, setDetailPatientId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addFirstName, setAddFirstName] = useState("");
  const [addLastName, setAddLastName] = useState("");
  const [addPhone, setAddPhone] = useState<string | undefined>(undefined);
  const [addEmail, setAddEmail] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState("");
  /** Optional fields also shown on the patient chart (intake / demographics). */
  const [addDob, setAddDob] = useState("");
  const [addAddress1, setAddAddress1] = useState("");
  const [addAddress2, setAddAddress2] = useState("");
  const [addCityStateZip, setAddCityStateZip] = useState("");
  const [addEmergName, setAddEmergName] = useState("");
  const [addEmergPhone, setAddEmergPhone] = useState<string | undefined>(undefined);
  const [addShowExtras, setAddShowExtras] = useState(false);
  const [addOnlineChiroWaived, setAddOnlineChiroWaived] = useState(false);
  const [documentBodyReady, setDocumentBodyReady] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  // Legacy Excel import (Admin → Patients → Import Excel)
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [importPreview, setImportPreview] = useState<LegacyImportResult | null>(null);
  const [importDone, setImportDone] = useState<LegacyImportResult | null>(null);

  useEffect(() => {
    setDocumentBodyReady(true);
    setPageSize(readStoredPageSize());
  }, []);
  const [sortMode, setSortMode] = useState<SortMode>("name_asc");
  const [listFilter, setListFilter] = useState<PatientListFilter>("");

  const loadPatients = useCallback(() => {
    return apiGetAuth<Patient[]>("/admin/patients/")
      .then((data) => {
        setPatients(
          data.map((row) => ({
            ...row,
            visit_count: row.visit_count ?? 0,
            last_service: row.last_service ?? null,
            next_appointment_date: row.next_appointment_date ?? null,
            next_appointment_time: row.next_appointment_time ?? null,
            date_established: row.date_established ?? null,
            no_show_count: row.no_show_count ?? 0,
            balance_visit: row.balance_visit ?? "0",
            balance_no_show_fee: row.balance_no_show_fee ?? "0",
            balance_late_cancel_fee: row.balance_late_cancel_fee ?? "0",
            has_overdue: row.has_overdue ?? false,
          })),
        );
        setError("");
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : "Failed to load patients.");
        setPatients([]);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadPatients().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadPatients]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return patients.filter((p) => {
      const matchesSearch =
        !q ||
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
        p.phone.includes(search.trim()) ||
        (p.email && p.email.toLowerCase().includes(q));
      return matchesSearch && matchesPatientListFilter(p, listFilter);
    });
  }, [patients, search, listFilter]);

  /** Roster-wide counts (not limited by current search) so money problems stay visible. */
  const attentionCounts = useMemo(() => {
    let overdue = 0;
    let balanceDue = 0;
    let penaltyFees = 0;
    let noShowHistory = 0;
    let noPhone = 0;
    for (const p of patients) {
      if (p.has_overdue) overdue += 1;
      if (parseBalanceNum(p.balance) > 0.009) balanceDue += 1;
      if (penaltyBalanceDue(p) > 0.009) penaltyFees += 1;
      if ((p.no_show_count ?? 0) > 0) noShowHistory += 1;
      if (patientHasNoPhone(p)) noPhone += 1;
    }
    return { overdue, balanceDue, penaltyFees, noShowHistory, noPhone, total: patients.length };
  }, [patients]);

  const exportCurrentList = () => {
    if (sortedList.length === 0) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const tag =
      listFilter === "no_phone"
        ? "no-phone"
        : listFilter
          ? listFilter.replace(/_/g, "-")
          : "all";
    downloadPatientsSpreadsheet(sortedList, `patients-${tag}-${stamp}.csv`);
  };

  const sortedList = useMemo(() => {
    const list = [...filtered];
    switch (sortMode) {
      case "name_asc":
        list.sort(compareName);
        break;
      case "visit_desc":
        list.sort((a, b) => visitSortKey(b.last_visit) - visitSortKey(a.last_visit));
        break;
      case "visit_asc":
        list.sort((a, b) => visitSortKey(a.last_visit) - visitSortKey(b.last_visit));
        break;
      case "balance_desc":
        list.sort((a, b) => parseBalanceNum(b.balance) - parseBalanceNum(a.balance));
        break;
      case "balance_asc":
        list.sort((a, b) => parseBalanceNum(a.balance) - parseBalanceNum(b.balance));
        break;
      default:
        list.sort(compareName);
    }
    return list;
  }, [filtered, sortMode]);

  const totalFiltered = sortedList.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));

  useEffect(() => {
    setPage(1);
  }, [search, sortMode, listFilter, pageSize]);

  const hasActiveFilters = search.trim().length > 0 || listFilter !== "";

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const pagePatients = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedList.slice(start, start + pageSize);
  }, [sortedList, page, pageSize]);

  const rangeStart = totalFiltered === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalFiltered);

  const setPageSizeAndRemember = (next: PageSize) => {
    setPageSize(next);
    try {
      localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  const resetAddForm = useCallback(() => {
    setAddFirstName("");
    setAddLastName("");
    setAddPhone(undefined);
    setAddEmail("");
    setAddError("");
    setAddDob("");
    setAddAddress1("");
    setAddAddress2("");
    setAddCityStateZip("");
    setAddEmergName("");
    setAddEmergPhone(undefined);
    setAddShowExtras(false);
    setAddOnlineChiroWaived(false);
  }, []);

  useEffect(() => {
    if (!showAddModal || addSubmitting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setShowAddModal(false);
        resetAddForm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAddModal, addSubmitting, resetAddForm]);

  const openAddModal = () => {
    resetAddForm();
    setShowAddModal(true);
  };

  const resetImportModal = useCallback(() => {
    setImportFile(null);
    setImportError("");
    setImportPreview(null);
    setImportDone(null);
    setImportBusy(false);
  }, []);

  const openImportModal = () => {
    resetImportModal();
    setShowImportModal(true);
  };

  useEffect(() => {
    if (!showImportModal || importBusy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setShowImportModal(false);
        resetImportModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showImportModal, importBusy, resetImportModal]);

  const runLegacyImport = async (dryRun: boolean) => {
    setImportError("");
    if (!importFile) {
      setImportError("Choose your Excel .xlsx file first.");
      return;
    }
    if (!importFile.name.toLowerCase().endsWith(".xlsx")) {
      setImportError("Please upload an .xlsx Excel file (not .xls or CSV).");
      return;
    }
    setImportBusy(true);
    try {
      const form = new FormData();
      form.append("file", importFile);
      form.append("dry_run", dryRun ? "1" : "0");
      const result = await apiUploadAuth<LegacyImportResult>("/admin/patients/import_legacy/", form);
      if (dryRun) {
        setImportPreview(result);
        setImportDone(null);
      } else {
        setImportDone(result);
        setImportPreview(null);
        await loadPatients();
      }
    } catch (e) {
      setImportError(e instanceof ApiError ? e.message : "Import failed. Please try again.");
    } finally {
      setImportBusy(false);
    }
  };

  const openChart = (id: number) => {
    setDetailPatientId(id);
  };

  const submitNewPatient = async () => {
    setAddError("");
    const fn = addFirstName.trim();
    const ln = addLastName.trim();
    if (!fn || !ln) {
      setAddError("First and last name are required.");
      return;
    }
    if (!addPhone || !isValidPhoneNumber(addPhone)) {
      setAddError("Enter a valid phone number.");
      return;
    }
    if (!addDob.trim()) {
      setAddError("Date of birth is required so we can avoid duplicate patient records.");
      return;
    }
    if (addEmergPhone && !isValidPhoneNumber(addEmergPhone)) {
      setAddError("Emergency contact phone doesn’t look valid. Clear it or enter a full number.");
      return;
    }
    setAddSubmitting(true);
    try {
      const payload: Record<string, string | boolean> = {
        first_name: fn,
        last_name: ln,
        phone: addPhone,
        email: addEmail.trim(),
      };
      payload.date_of_birth = addDob.trim();
      if (addAddress1.trim()) payload.address_line1 = addAddress1.trim();
      if (addAddress2.trim()) payload.address_line2 = addAddress2.trim();
      if (addCityStateZip.trim()) payload.city_state_zip = addCityStateZip.trim();
      if (addEmergName.trim()) payload.emergency_contact_name = addEmergName.trim();
      if (addEmergPhone?.trim()) payload.emergency_contact_phone = addEmergPhone.trim();
      if (addOnlineChiroWaived) payload.online_chiro_intake_waived = true;

      const created = await apiPost<{ id: number }>("/patients/", payload);
      setShowAddModal(false);
      resetAddForm();
      await loadPatients();
      setDetailPatientId(created.id);
    } catch (e) {
      setAddError(e instanceof ApiError ? e.message : "Could not create patient.");
    } finally {
      setAddSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Toolbar: search + filter + sort | actions */}
      <div className="grid w-full gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-6">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <div className="relative min-w-[12rem] flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a7a62]"
              aria-hidden
            />
            <input
              type="search"
              placeholder="Search by name, phone, or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-[#d1e8d8] bg-[#f4fbf7] py-2.5 pl-10 pr-10 text-sm text-[#0d1f14] placeholder:text-[#5a7a62] focus:border-[#16a349]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
              aria-label="Search patients"
            />
            {search.trim() ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[#5a7a62] hover:bg-white hover:text-[#0d1f14]"
                aria-label="Clear search"
                onClick={() => setSearch("")}
              >
                <span aria-hidden className="text-lg leading-none">
                  ×
                </span>
              </button>
            ) : null}
          </div>

          <select
            id="patient-list-filter"
            value={listFilter}
            onChange={(e) => setListFilter(e.target.value as PatientListFilter)}
            className="min-w-[10.5rem] rounded-lg border border-[#d1e8d8] bg-white px-3 py-2.5 text-sm font-medium text-[#0d1f14] focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
            aria-label="Filter patients"
          >
            {PATIENT_FILTER_OPTIONS.map((o) => {
              const count =
                o.value === "overdue"
                  ? attentionCounts.overdue
                  : o.value === "balance_due"
                    ? attentionCounts.balanceDue
                    : o.value === "penalty_fees"
                      ? attentionCounts.penaltyFees
                      : o.value === "no_phone"
                        ? attentionCounts.noPhone
                        : o.value === "no_show_history"
                          ? attentionCounts.noShowHistory
                          : null;
              return (
                <option key={o.value || "all"} value={o.value}>
                  {count != null && count > 0 ? `${o.label} (${count})` : o.label}
                </option>
              );
            })}
          </select>

          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="min-w-[10.5rem] rounded-lg border border-[#d1e8d8] bg-white px-3 py-2.5 text-sm font-medium text-[#0d1f14] focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
            aria-label="Sort patients"
          >
            <option value="name_asc">Last name (A–Z)</option>
            <option value="visit_desc">Last visit (newest)</option>
            <option value="visit_asc">Last visit (oldest)</option>
            <option value="balance_desc">Balance (high–low)</option>
            <option value="balance_asc">Balance (low–high)</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
          <Link
            href="/admin/patients/merge"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d1e8d8] bg-white px-4 text-sm font-semibold text-[#0d1f14] hover:bg-[#f8fdf9]"
          >
            Merge
            {isNewNavBadgeActive("/admin/patients/merge") ? (
              <span className="rounded-full bg-[#dbeafe] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1d4ed8]">
                New
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            onClick={openImportModal}
            className="inline-flex h-10 items-center rounded-lg border border-[#d1e8d8] bg-white px-4 text-sm font-semibold text-[#0d1f14] hover:bg-[#f8fdf9]"
          >
            Import
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex h-10 items-center rounded-lg bg-[#16a349] px-4 text-sm font-semibold text-white hover:bg-[#13823d]"
          >
            Add patient
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>
      )}

      {/* Results toolbar + table */}
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {loading ? (
          <div className="rounded-lg border border-[#d1e8d8] bg-white p-6">
            <Loader variant="page" label="Loading patients" sublabel="Gathering patient records…" />
          </div>
        ) : sortedList.length === 0 ? (
          <div className="rounded-lg border border-[#d1e8d8] bg-white py-12 text-center">
            <p className="text-[#5a7a62]">
              {hasActiveFilters ? "No matching patients." : "No patients yet."}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                className="mt-4 text-sm font-semibold text-[#16a349] hover:underline"
                onClick={() => {
                  setSearch("");
                  setListFilter("");
                }}
              >
                Clear filters
              </button>
            ) : (
              <button
                type="button"
                onClick={openAddModal}
                className="mt-5 inline-flex h-10 items-center rounded-lg bg-[#16a349] px-5 text-sm font-semibold text-white hover:bg-[#13823d]"
              >
                Add your first patient
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[#5a7a62]">
                <span className="tabular-nums text-[#0d1f14]">
                  {rangeStart}–{rangeEnd}
                </span>{" "}
                of <span className="tabular-nums text-[#0d1f14]">{totalFiltered}</span>
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={sortedList.length === 0}
                  onClick={exportCurrentList}
                  className="text-sm font-medium text-[#16a349] hover:underline disabled:opacity-50"
                >
                  Export
                </button>
                <label className="flex items-center gap-2 text-xs text-[#5a7a62]">
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSizeAndRemember(Number(e.target.value) as PageSize)}
                    className="h-9 rounded-lg border border-[#d1e8d8] bg-white px-2.5 text-sm font-semibold text-[#0d1f14] focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15"
                    aria-label="Rows per page"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} rows
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[#d1e8d8] bg-white">
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-[920px] border-collapse text-sm">
                  <thead className="sticky top-0 z-[1] border-b border-[#d1e8d8] bg-[#f8fdf9]">
                    <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-[#5a7a62]">
                      <th className="px-5 py-3.5">Patient</th>
                      <th className="hidden px-4 py-3.5 xl:table-cell">Established</th>
                      <th className="px-4 py-3.5">Last visit</th>
                      <th className="px-4 py-3.5 text-center">Visits</th>
                      <th className="hidden px-4 py-3.5 xl:table-cell">Last service</th>
                      <th className="hidden px-4 py-3.5 lg:table-cell">Next appointment</th>
                      <th className="px-4 py-3.5 text-right">Balance</th>
                      <th className="w-20 px-4 py-3.5 text-right" scope="col">
                        <span className="sr-only">Open</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagePatients.map((p) => {
                      const { last, first } = patientDirectoryName(p);
                      const phoneLine = formatPhoneCompact(p.phone);
                      const owed = parseBalanceNum(p.balance);
                      const hasBalance = owed > 0.009;
                      const isOverdue = !!p.has_overdue;
                      const dueHints = hasBalance ? balanceDueHints(p).filter((h) => h !== "Overdue") : [];
                      const visits = typeof p.visit_count === "number" ? p.visit_count : 0;
                      const nextAppt = nextAppointmentLabel(p);
                      const service = (p.last_service || "").trim();
                      const noShows = typeof p.no_show_count === "number" ? p.no_show_count : 0;
                      return (
                        <tr
                          key={p.id}
                          tabIndex={0}
                          className={cn(
                            "group cursor-pointer border-b border-[#d1e8d8] transition last:border-b-0",
                            isOverdue
                              ? "bg-rose-50/70 hover:bg-rose-50 focus-visible:bg-rose-50"
                              : hasBalance
                                ? "bg-amber-50/40 hover:bg-[#f8fdf9] focus-visible:bg-[#f8fdf9]"
                                : "hover:bg-[#f8fdf9] focus-visible:bg-[#f8fdf9]",
                            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#16a349]",
                          )}
                          onClick={() => openChart(p.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openChart(p.id);
                            }
                          }}
                          aria-label={`Open chart for ${last}, ${first}`}
                        >
                          <td className="px-5 py-4 align-middle">
                            <div className="flex items-center gap-3">
                              <div
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#16a349] text-[11px] font-bold uppercase tracking-wide text-white"
                                aria-hidden
                              >
                                {patientInitials(p)}
                              </div>
                              <div className="min-w-0">
                                <p className="flex flex-wrap items-center gap-2 leading-snug text-[#0d1f14]">
                                  <PatientNameWithProfile
                                    name={
                                      <span>
                                        <span className="font-semibold tracking-tight">{last}</span>
                                        <span className="font-normal text-[#5a7a62]/70">, </span>
                                        <span className="font-medium text-[#0d1f14]/90">{first}</span>
                                      </span>
                                    }
                                    profile={p.payment_profile}
                                    irisTag={p.iris_tag}
                                    compactBadge
                                  />
                                  <PatientNoShowBadge count={noShows} />
                                </p>
                                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[#5a7a62]">
                                  <span className="font-mono tabular-nums">
                                    PT-{String(p.id).padStart(4, "0")}
                                  </span>
                                  {phoneLine ? (
                                    <>
                                      <span aria-hidden>·</span>
                                      <span className="tabular-nums">{phoneLine}</span>
                                    </>
                                  ) : null}
                                </p>
                                {nextAppt ? (
                                  <p className="mt-1 text-xs font-medium text-[#16a349] lg:hidden">
                                    Next: {nextAppt}
                                  </p>
                                ) : null}
                                {service ? (
                                  <p className="mt-0.5 truncate text-xs text-[#5a7a62] xl:hidden">{service}</p>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="hidden whitespace-nowrap px-4 py-4 align-middle tabular-nums text-[#0d1f14] xl:table-cell">
                            {establishedLabel(p)}
                          </td>
                          <td className="max-w-[11rem] whitespace-normal px-4 py-4 align-middle text-[#0d1f14]">
                            <span
                              className={cn(
                                "text-sm tabular-nums leading-snug",
                                !p.last_visit && "italic text-[#5a7a62]",
                              )}
                            >
                              {lastVisitLabel(p)}
                            </span>
                          </td>
                          <td className="px-4 py-4 align-middle text-center">
                            <span className="text-sm font-semibold tabular-nums text-[#0d1f14]">{visits}</span>
                          </td>
                          <td className="hidden max-w-[12rem] truncate px-4 py-4 align-middle text-[#0d1f14] xl:table-cell">
                            {service || <span className="text-[#5a7a62]">—</span>}
                          </td>
                          <td className="hidden px-4 py-4 align-middle lg:table-cell">
                            {nextAppt ? (
                              <span className="text-sm font-medium text-[#16a349]">{nextAppt}</span>
                            ) : (
                              <span className="text-[#5a7a62]">—</span>
                            )}
                          </td>
                          <td
                            className={cn(
                              "px-4 py-4 text-right align-middle text-sm font-medium tabular-nums",
                              isOverdue
                                ? "font-semibold text-rose-700"
                                : hasBalance
                                  ? "font-semibold text-orange-600"
                                  : "text-[#0d1f14]",
                            )}
                          >
                            {hasBalance ? (
                              <span className="inline-flex flex-col items-end gap-0.5">
                                <span>{formatBalance(p.balance)}</span>
                                <span
                                  className={cn(
                                    "text-[10px] font-bold uppercase tracking-wide",
                                    isOverdue ? "text-rose-700" : "text-orange-600",
                                  )}
                                >
                                  {isOverdue ? "Overdue" : "Due"}
                                </span>
                                {dueHints.length > 0 ? (
                                  <span className="max-w-[8.5rem] text-right text-[10px] font-medium leading-tight text-[#5a7a62]">
                                    {dueHints.join(" · ")}
                                  </span>
                                ) : null}
                              </span>
                            ) : (
                              formatBalance(p.balance)
                            )}
                          </td>
                          <td className="px-4 py-4 text-right align-middle">
                            <button
                              type="button"
                              className="text-sm font-medium text-[#16a349] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16a349]"
                              onClick={(e) => {
                                e.stopPropagation();
                                openChart(p.id);
                              }}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {(totalPages > 1 || totalFiltered > PAGE_SIZE_OPTIONS[0]) && (
                <div className="flex flex-col gap-3 border-t border-[#d1e8d8] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-[#5a7a62]">
                    Page <span className="font-semibold tabular-nums text-[#0d1f14]">{page}</span> of{" "}
                    <span className="tabular-nums">{totalPages}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="h-9 rounded-lg border border-[#d1e8d8] bg-white px-4 text-xs font-semibold text-[#0d1f14] hover:bg-[#f8fdf9] disabled:opacity-40"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-label="Previous page"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="h-9 rounded-lg border border-[#d1e8d8] bg-white px-4 text-xs font-semibold text-[#0d1f14] hover:bg-[#f8fdf9] disabled:opacity-40"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      aria-label="Next page"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {detailPatientId && (
        <PatientDetailModal
          patientId={detailPatientId}
          onClose={() => setDetailPatientId(null)}
          detailPath="/admin/patient_detail"
          onPatientDeleted={() => void loadPatients()}
        />
      )}

      {documentBodyReady &&
        showAddModal &&
        createPortal(
          <div
            className={`fixed inset-0 ${ADD_PATIENT_MODAL_Z} flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-patient-title"
            aria-describedby="add-patient-hint"
            onClick={() => {
              if (!addSubmitting) {
                setShowAddModal(false);
                resetAddForm();
              }
            }}
          >
            <div
              className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-y-auto rounded-2xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-200/60"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="border-b border-slate-100 px-5 pb-4 pt-5">
              <h2 id="add-patient-title" className="text-lg font-semibold tracking-tight text-slate-900">
                Add patient
              </h2>
              <p id="add-patient-hint" className="mt-1 text-xs leading-relaxed text-slate-500">
                Same phone for family is OK—each person needs a different name. Anything below “Optional” can be added
                later in the chart.
              </p>
            </div>

            <div className="space-y-4 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Required</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block min-w-0">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">First name</span>
                  <input
                    className={inputClass}
                    value={addFirstName}
                    onChange={(e) => setAddFirstName(e.target.value)}
                    autoComplete="given-name"
                    autoFocus
                  />
                </label>
                <label className="block min-w-0">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Last name</span>
                  <input
                    className={inputClass}
                    value={addLastName}
                    onChange={(e) => setAddLastName(e.target.value)}
                    autoComplete="family-name"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Phone</span>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm focus-within:border-[#16a349]/40 focus-within:ring-2 focus-within:ring-[#16a349]/15">
                  <PhoneInput
                    international
                    defaultCountry="US"
                    countryCallingCodeEditable={false}
                    value={addPhone}
                    onChange={setAddPhone}
                    placeholder="(555) 555-0100"
                    className="phone-field text-sm"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Date of birth <span className="text-rose-600">*</span>
                </span>
                <UsDateInput
                  className={`${inputClass} max-w-xs`}
                  value={addDob}
                  onChange={setAddDob}
                  aria-label="Date of birth"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Type numbers only — slashes added automatically. Paste OK. Used with name and phone to block duplicate profiles.
                </p>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Email <span className="font-normal text-slate-400">· optional</span>
                </span>
                <input
                  type="email"
                  className={inputClass}
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="name@example.com"
                />
              </label>

              <div className="border-t border-slate-100 pt-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-xl py-2 text-left text-sm font-semibold text-[#0d5c2e] transition hover:bg-emerald-50/60"
                  aria-expanded={addShowExtras}
                  onClick={() => setAddShowExtras((v) => !v)}
                >
                  <span>Optional: address, emergency contact</span>
                  <span className={cn("text-slate-400 transition", addShowExtras && "rotate-180")} aria-hidden>
                    ▼
                  </span>
                </button>

                {addShowExtras ? (
                  <div className="mt-3 space-y-4 border-t border-slate-100 pt-4">
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Home address</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block sm:col-span-2">
                          <span className="mb-1.5 block text-sm font-medium text-slate-700">Street</span>
                          <input
                            className={inputClass}
                            value={addAddress1}
                            onChange={(e) => setAddAddress1(e.target.value)}
                            autoComplete="street-address"
                          />
                        </label>
                        <label className="block sm:col-span-2">
                          <span className="mb-1.5 block text-sm font-medium text-slate-700">
                            Apt / suite <span className="font-normal text-slate-400">· optional</span>
                          </span>
                          <input
                            className={inputClass}
                            value={addAddress2}
                            onChange={(e) => setAddAddress2(e.target.value)}
                            autoComplete="address-line2"
                          />
                        </label>
                        <label className="block sm:col-span-2">
                          <span className="mb-1.5 block text-sm font-medium text-slate-700">City, state, ZIP</span>
                          <input
                            className={inputClass}
                            placeholder="St Joseph, MI 49085"
                            value={addCityStateZip}
                            onChange={(e) => setAddCityStateZip(e.target.value)}
                            autoComplete="address-level2"
                          />
                        </label>
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Emergency contact
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block sm:col-span-1">
                          <span className="mb-1.5 block text-sm font-medium text-slate-700">Name</span>
                          <input
                            className={inputClass}
                            value={addEmergName}
                            onChange={(e) => setAddEmergName(e.target.value)}
                            autoComplete="name"
                          />
                        </label>
                        <label className="block sm:col-span-1">
                          <span className="mb-1.5 block text-sm font-medium text-slate-700">Phone</span>
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm focus-within:border-[#16a349]/40 focus-within:ring-2 focus-within:ring-[#16a349]/15">
                            <PhoneInput
                              international
                              defaultCountry="US"
                              countryCallingCodeEditable={false}
                              value={addEmergPhone}
                              onChange={setAddEmergPhone}
                              placeholder="Same or different number"
                              className="phone-field text-sm"
                            />
                          </div>
                        </label>
                      </div>
                    </div>

                    <label className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-[#16a349] focus:ring-[#16a349]/30"
                        checked={addOnlineChiroWaived}
                        onChange={(e) => setAddOnlineChiroWaived(e.target.checked)}
                      />
                      <span className="text-sm leading-snug text-slate-700">
                        <span className="font-semibold text-slate-900">Established chiropractic patient</span>
                        <span className="mt-0.5 block text-xs font-normal text-slate-600">
                          Allow booking regular (non-intake) chiropractic online before a completed chiro visit exists in
                          this system—use for imports or long-time patients.
                        </span>
                      </span>
                    </label>
                  </div>
                ) : null}
              </div>
            </div>

            {addError ? (
              <div className="px-5 pb-2">
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">{addError}</p>
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
              <Button
                type="button"
                variant="outline"
                disabled={addSubmitting}
                onClick={() => {
                  setShowAddModal(false);
                  resetAddForm();
                }}
                className="rounded-xl border-slate-200"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={addSubmitting}
                onClick={() => void submitNewPatient()}
                className="rounded-xl bg-[#16a349] px-5 font-semibold text-white hover:bg-[#13823d]"
              >
                {addSubmitting ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {documentBodyReady &&
        showImportModal &&
        createPortal(
          <div
            className={`fixed inset-0 ${ADD_PATIENT_MODAL_Z} flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-patients-title"
            onClick={() => {
              if (!importBusy) {
                setShowImportModal(false);
                resetImportModal();
              }
            }}
          >
            <div
              className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-200/60"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-slate-100 px-5 pb-4 pt-5">
                <h2 id="import-patients-title" className="text-lg font-semibold tracking-tight text-slate-900">
                  Import Excel patient list
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Upload your spreadsheet (.xlsx). People already in the system are skipped. New people are added with
                  their last visit date (time set to 9:00 AM). Always run <strong>Preview</strong> first.
                </p>
              </div>

              <div className="space-y-4 px-5 py-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Excel file (.xlsx)</span>
                  <input
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    disabled={importBusy}
                    className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-emerald-800 hover:file:bg-emerald-100"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setImportFile(f);
                      setImportPreview(null);
                      setImportDone(null);
                      setImportError("");
                    }}
                  />
                  {importFile ? (
                    <p className="mt-1.5 text-xs text-slate-500">Selected: {importFile.name}</p>
                  ) : null}
                </label>

                {importError ? (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">{importError}</p>
                ) : null}

                {importPreview ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-3 text-sm text-amber-950">
                    <p className="font-semibold">Preview (nothing saved yet)</p>
                    <ul className="mt-2 space-y-1 text-xs leading-relaxed">
                      <li>Rows in file: {importPreview.counts.total_rows}</li>
                      <li>Already in system (skip): {importPreview.counts.skip_existing}</li>
                      <li>Would add as new: {importPreview.counts.would_add}</li>
                      <li>Of those, no phone number: {importPreview.counts.no_phone_add}</li>
                      <li>Bad / skipped rows: {importPreview.counts.skip_bad_row}</li>
                      <li>
                        Historical visits → {importPreview.provider_name} (#{importPreview.provider_id})
                      </li>
                    </ul>
                    <p className="mt-2 text-xs text-amber-900/80">
                      If these numbers look right, click <strong>Import now</strong>.
                    </p>
                  </div>
                ) : null}

                {importDone ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3.5 py-3 text-sm text-emerald-950">
                    <p className="font-semibold">Import finished</p>
                    <ul className="mt-2 space-y-1 text-xs leading-relaxed">
                      <li>Added: {importDone.counts.added}</li>
                      <li>Skipped (already existed): {importDone.counts.skip_existing}</li>
                      <li>Bad rows skipped: {importDone.counts.skip_bad_row}</li>
                      <li>Errors: {importDone.counts.errors}</li>
                      <li>Added without phone: {importDone.counts.no_phone_add}</li>
                    </ul>
                  </div>
                ) : null}

                {importBusy ? (
                  <p className="flex items-center gap-2 text-sm text-slate-600">
                    <Loader className="h-4 w-4" />
                    Working… large files can take up to a minute.
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={importBusy}
                  onClick={() => {
                    setShowImportModal(false);
                    resetImportModal();
                  }}
                  className="rounded-xl border-slate-200"
                >
                  {importDone ? "Close" : "Cancel"}
                </Button>
                {!importDone ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={importBusy || !importFile}
                      onClick={() => void runLegacyImport(true)}
                      className="rounded-xl border-slate-200 font-semibold"
                    >
                      {importBusy ? "Working…" : "Preview"}
                    </Button>
                    <Button
                      type="button"
                      disabled={importBusy || !importFile || !importPreview}
                      onClick={() => void runLegacyImport(false)}
                      className="rounded-xl bg-[#16a349] px-5 font-semibold text-white hover:bg-[#13823d] disabled:opacity-50"
                    >
                      Import now
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
