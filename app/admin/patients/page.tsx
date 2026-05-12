"use client";

import { Loader } from "@/components/loader";
import { PatientDetailModal } from "@/components/patient-detail-modal";
import { Button } from "@/components/ui/button";
import { ApiError, apiGetAuth, apiPost } from "@/lib/api";
import { formatMonthDayYear } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";

type Patient = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  last_visit: string | null;
  balance: string;
};

type SortMode = "name_asc" | "visit_desc" | "visit_asc" | "balance_desc" | "balance_asc";

function parseBalanceNum(balanceStr: string): number {
  const n = parseFloat(balanceStr);
  return Number.isFinite(n) ? n : 0;
}

/** Plain-language label when we have no completed appointment date on file. */
function lastVisitLabel(p: Patient): string {
  if (p.last_visit == null || String(p.last_visit).trim() === "") return "No visit yet";
  return formatMonthDayYear(p.last_visit);
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
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15";

/** Rows per page — keeps the list scannable instead of one endless page */
const PATIENTS_PAGE_SIZE = 25;

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
  const [page, setPage] = useState(1);
  const [sortMode, setSortMode] = useState<SortMode>("name_asc");
  const [balanceOnly, setBalanceOnly] = useState(false);

  const loadPatients = useCallback(() => {
    return apiGetAuth<Patient[]>("/admin/patients/")
      .then((data) => {
        setPatients(data);
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
      const matchesBalance = !balanceOnly || parseBalanceNum(p.balance) > 0.009;
      return matchesSearch && matchesBalance;
    });
  }, [patients, search, balanceOnly]);

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
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PATIENTS_PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [search, sortMode, balanceOnly]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const pagePatients = useMemo(() => {
    const start = (page - 1) * PATIENTS_PAGE_SIZE;
    return sortedList.slice(start, start + PATIENTS_PAGE_SIZE);
  }, [sortedList, page]);

  const rangeStart = totalFiltered === 0 ? 0 : (page - 1) * PATIENTS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PATIENTS_PAGE_SIZE, totalFiltered);

  const resetAddForm = () => {
    setAddFirstName("");
    setAddLastName("");
    setAddPhone(undefined);
    setAddEmail("");
    setAddError("");
  };

  const openAddModal = () => {
    resetAddForm();
    setShowAddModal(true);
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
      setAddError("Enter a valid cell or primary phone number.");
      return;
    }
    setAddSubmitting(true);
    try {
      const created = await apiPost<{ id: number }>("/patients/", {
        first_name: fn,
        last_name: ln,
        phone: addPhone,
        email: addEmail.trim(),
      });
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
    <div className="space-y-4">
      <div className="card">
        <h1 className="mb-3 text-2xl font-bold">All Patients</h1>
        <p className="mb-4 text-sm text-slate-600">
          Click a row or <span className="font-medium text-slate-800">View</span> to open the chart. Press{" "}
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-700">
            Enter
          </kbd>{" "}
          on a highlighted row, or{" "}
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-700">
            Esc
          </kbd>{" "}
          to close the chart.
        </p>
        {error && (
          <p className="mb-3 rounded-lg bg-rose-100 p-3 text-sm font-medium text-rose-800">{error}</p>
        )}

        <div className="sticky top-0 z-20 -mx-5 mb-4 space-y-3 border-b border-slate-100 bg-card/95 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/85">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="relative w-full min-w-0 max-w-md">
              <input
                type="search"
                placeholder="Search by name, phone, or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 py-2 pl-3 pr-10 text-sm"
                aria-label="Search patients"
              />
              {search.trim() ? (
                <button
                  type="button"
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                >
                  <span aria-hidden className="text-lg leading-none">
                    ×
                  </span>
                </button>
              ) : null}
            </div>
            <Button
              type="button"
              onClick={openAddModal}
              className="h-10 w-full shrink-0 rounded-xl bg-[#16a349] px-4 text-sm font-semibold text-white hover:bg-[#13823d] sm:w-auto sm:min-w-[10.5rem]"
            >
              Add patient
            </Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={balanceOnly}
                onChange={(e) => setBalanceOnly(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#16a349] focus:ring-[#16a349]/30"
              />
              <span>Only show patients with a balance</span>
            </label>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sort</span>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="max-w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 shadow-sm focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15"
                aria-label="Sort patients"
              >
                <option value="name_asc">Last name (A–Z)</option>
                <option value="visit_desc">Last visit (newest first)</option>
                <option value="visit_asc">Last visit (oldest first)</option>
                <option value="balance_desc">Balance (high to low)</option>
                <option value="balance_asc">Balance (low to high)</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <Loader variant="page" label="Loading patients" sublabel="Gathering patient records…" />
        ) : sortedList.length === 0 ? (
          <div className="animate-fade-in py-8 text-center">
            <p className="text-slate-500">
              {search.trim() || balanceOnly
                ? "No patients match your filters. Try clearing search or the balance filter."
                : "No patients yet."}
            </p>
            {(search.trim() || balanceOnly) && (
              <Button
                type="button"
                variant="outline"
                className="mt-4 rounded-xl"
                onClick={() => {
                  setSearch("");
                  setBalanceOnly(false);
                }}
              >
                Clear filters
              </Button>
            )}
            {!search.trim() && !balanceOnly && (
              <Button
                type="button"
                onClick={openAddModal}
                className="mt-5 h-11 rounded-xl bg-[#16a349] px-6 text-sm font-semibold text-white hover:bg-[#13823d]"
              >
                Add your first patient
              </Button>
            )}
          </div>
        ) : (
          <div className="animate-fade-in space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Showing{" "}
              <span className="font-semibold tabular-nums text-slate-600">
                {rangeStart}&ndash;{rangeEnd}
              </span>{" "}
              of <span className="tabular-nums text-slate-600">{totalFiltered}</span>{" "}
              {search.trim() || balanceOnly ? "matching patients" : "patients"}
            </p>

            <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100/80">
              <div className="max-h-[min(520px,65vh)] overflow-y-auto overscroll-contain">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50/95 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80">
                    <tr className="text-left text-slate-500">
                      <th className="px-3 py-3 pl-4 text-left align-bottom font-semibold">Patient name</th>
                      <th className="px-3 py-3 align-bottom font-semibold">Last visit</th>
                      <th className="py-3 pr-2 text-right align-bottom font-semibold">Balance</th>
                      <th
                        className="w-[4.5rem] px-2 py-3 pr-4 text-right align-bottom font-semibold text-slate-500"
                        scope="col"
                      >
                        Open
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagePatients.map((p) => {
                      const { last, first } = patientDirectoryName(p);
                      const phoneLine = formatPhoneCompact(p.phone);
                      const owed = parseBalanceNum(p.balance);
                      const hasBalance = owed > 0.009;
                      return (
                        <tr
                          key={p.id}
                          tabIndex={0}
                          className={cn(
                            "group cursor-pointer border-t border-slate-100 transition hover:bg-emerald-50/50",
                            "focus-visible:bg-emerald-50/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#16a349]",
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
                          <td className="px-3 py-3 pl-4 align-middle">
                            <div className="flex items-center gap-3">
                              <div
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#ecfdf5] to-[#d1fae5] text-[10px] font-bold uppercase tracking-[0.08em] text-[#065f46] shadow-inner ring-1 ring-[#16a349]/15 md:h-10 md:w-10 md:rounded-xl md:text-[11px]"
                                aria-hidden
                              >
                                {patientInitials(p)}
                              </div>
                              <div className="min-w-0">
                                <p className="leading-snug text-slate-900">
                                  <span className="font-semibold tracking-tight">{last}</span>
                                  <span className="font-normal text-slate-400">, </span>
                                  <span className="font-medium text-slate-700">{first}</span>
                                </p>
                                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                                  <span className="font-mono tabular-nums text-slate-400">
                                    PT-{String(p.id).padStart(4, "0")}
                                  </span>
                                  {phoneLine ? (
                                    <>
                                      <span className="text-slate-300" aria-hidden>
                                        ·
                                      </span>
                                      <span className="tabular-nums text-slate-500">{phoneLine}</span>
                                    </>
                                  ) : null}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="max-w-[11rem] whitespace-normal px-3 py-3 align-middle text-slate-700">
                            <span
                              className={cn(
                                "text-sm tabular-nums leading-snug",
                                !p.last_visit && "italic text-slate-500",
                              )}
                            >
                              {lastVisitLabel(p)}
                            </span>
                          </td>
                          <td
                            className={cn(
                              "py-3 pr-2 text-right align-middle text-sm font-medium tabular-nums",
                              hasBalance ? "font-semibold text-amber-900" : "text-slate-700",
                            )}
                          >
                            {hasBalance ? (
                              <span className="inline-flex flex-col items-end gap-0.5 sm:inline-flex">
                                <span>{formatBalance(p.balance)}</span>
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                  Due
                                </span>
                              </span>
                            ) : (
                              formatBalance(p.balance)
                            )}
                          </td>
                          <td className="px-2 py-3 pr-4 text-right align-middle">
                            <button
                              type="button"
                              className="text-xs font-semibold text-[#16a349] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16a349]"
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
            </div>

            {totalPages > 1 && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  Page{" "}
                  <span className="font-semibold tabular-nums text-slate-700">{page}</span> of{" "}
                  <span className="tabular-nums">{totalPages}</span>
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="text-slate-400">{PATIENTS_PAGE_SIZE} per page</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-lg border-slate-200 px-4 text-xs font-semibold"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-lg border-slate-200 px-4 text-xs font-semibold"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    aria-label="Next page"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
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

      {showAddModal && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-patient-title"
          onClick={() => {
            if (!addSubmitting) {
              setShowAddModal(false);
              resetAddForm();
            }
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="add-patient-title" className="text-lg font-bold text-slate-900">
              Add patient
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Creates a chart record so they can be booked, checked in, and billed. Family members may share a phone—
              names must differ.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">First name</span>
                <input
                  className={inputClass}
                  value={addFirstName}
                  onChange={(e) => setAddFirstName(e.target.value)}
                  autoComplete="given-name"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Last name</span>
                <input
                  className={inputClass}
                  value={addLastName}
                  onChange={(e) => setAddLastName(e.target.value)}
                  autoComplete="family-name"
                />
              </label>
              <div>
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Phone</span>
                <div className="rounded-lg border border-slate-200 bg-white p-2">
                  <PhoneInput
                    international
                    defaultCountry="US"
                    countryCallingCodeEditable={false}
                    value={addPhone}
                    onChange={setAddPhone}
                    placeholder="Cell or primary number"
                    className="phone-field text-sm"
                  />
                </div>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Email <span className="font-normal normal-case text-slate-400">(optional)</span>
                </span>
                <input
                  type="email"
                  className={inputClass}
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  autoComplete="email"
                />
              </label>
            </div>
            {addError && (
              <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">{addError}</p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={addSubmitting}
                onClick={() => {
                  setShowAddModal(false);
                  resetAddForm();
                }}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={addSubmitting}
                onClick={() => void submitNewPatient()}
                className="rounded-xl bg-[#16a349] font-semibold text-white hover:bg-[#13823d]"
              >
                {addSubmitting ? "Saving…" : "Create patient"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
