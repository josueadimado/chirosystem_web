"use client";

import { Loader } from "@/components/loader";
import { PatientDetailModal } from "@/components/patient-detail-modal";
import { Button } from "@/components/ui/button";
import { ApiError, apiGetAuth, apiPost } from "@/lib/api";
import { formatMonthDayYear } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";

/** Must sit above admin chrome (`sticky` header ~ z-30). Portaling to `document.body` avoids ancestor stacking contexts. */
const ADD_PATIENT_MODAL_Z = "z-[400]";

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
  balance: string;
};

type SortMode = "name_asc" | "visit_desc" | "visit_asc" | "balance_desc" | "balance_asc";

function parseBalanceNum(balanceStr: string): number {
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

  useEffect(() => {
    setDocumentBodyReady(true);
  }, []);
  const [sortMode, setSortMode] = useState<SortMode>("name_asc");
  const [balanceOnly, setBalanceOnly] = useState(false);

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
                <table className="w-full min-w-[880px] border-collapse text-sm">
                  <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50/95 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80">
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-3 pl-4 align-bottom">Patient</th>
                      <th className="hidden px-3 py-3 align-bottom md:table-cell">Established</th>
                      <th className="px-3 py-3 align-bottom">Last visit</th>
                      <th className="px-3 py-3 text-center align-bottom">Visits</th>
                      <th className="hidden px-3 py-3 align-bottom lg:table-cell">Last service</th>
                      <th className="hidden px-3 py-3 align-bottom xl:table-cell">Next appointment</th>
                      <th className="py-3 pr-2 text-right align-bottom">Balance</th>
                      <th className="w-[4.5rem] px-2 py-3 pr-4 text-right align-bottom" scope="col">
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
                      const visits = typeof p.visit_count === "number" ? p.visit_count : 0;
                      const nextAppt = nextAppointmentLabel(p);
                      const service = (p.last_service || "").trim();
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
                                {nextAppt ? (
                                  <p className="mt-1 text-xs font-medium text-[#047857] xl:hidden">
                                    Next: {nextAppt}
                                  </p>
                                ) : null}
                                {service ? (
                                  <p className="mt-0.5 truncate text-xs text-slate-500 lg:hidden">{service}</p>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="hidden whitespace-nowrap px-3 py-3 align-middle tabular-nums text-slate-600 md:table-cell">
                            {establishedLabel(p)}
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
                          <td className="px-3 py-3 align-middle text-center">
                            <span
                              className={cn(
                                "inline-flex min-w-[2rem] justify-center rounded-lg px-2 py-0.5 text-sm font-semibold tabular-nums",
                                visits > 0 ? "bg-slate-100 text-slate-800" : "bg-slate-50 text-slate-400",
                              )}
                            >
                              {visits}
                            </span>
                          </td>
                          <td className="hidden max-w-[12rem] truncate px-3 py-3 align-middle text-slate-600 lg:table-cell">
                            {service || <span className="text-slate-400">—</span>}
                          </td>
                          <td className="hidden px-3 py-3 align-middle xl:table-cell">
                            {nextAppt ? (
                              <span className="text-sm font-medium text-[#047857]">{nextAppt}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
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
                <input
                  type="date"
                  className={`${inputClass} max-w-xs`}
                  value={addDob}
                  onChange={(e) => setAddDob(e.target.value)}
                  required
                />
                <p className="mt-1 text-xs text-slate-500">
                  Used with name and phone to block duplicate profiles.
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
    </div>
  );
}
