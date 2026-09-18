"use client";

import { IconMoreVertical } from "@/components/icons";
import { PatientNoShowBadge } from "@/components/status-chip";
import {
  PatientIrisBadge,
  PatientPaymentProfileBadge,
} from "@/components/patient-payment-profile";
import { Loader } from "@/components/loader";
import { ApiError, apiGetAuth } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatMonthDayYear } from "@/lib/format-date";
import { isNewNavBadgeActive } from "@/lib/staff-announcements";
import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Matches `PatientListSerializer` on `GET /patients/` */
type PatientApi = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  date_of_birth: string | null;
  visit_count: number;
  last_visit: string | null;
  last_service: string | null;
  next_appointment_date: string | null;
  next_appointment_time: string | null;
  no_show_count?: number;
  payment_profile?: string;
  iris_tag?: boolean;
};

type PaginatedPatients = {
  count: number;
  next: string | null;
  previous: string | null;
  results: PatientApi[];
};

/** Must match `apply_patient_directory_list_filter` on the API */
type DirectoryFilter =
  | ""
  | "upcoming"
  | "no_upcoming"
  | "seen_recent"
  | "recall_due"
  | "never_seen"
  | "new_patients";

const PAGE_SIZE = 25;

/** Clinical directory filters (same options as before, shown like admin’s dropdown). */
const DIRECTORY_FILTER_OPTIONS: { value: DirectoryFilter; label: string }[] = [
  { value: "", label: "All patients" },
  { value: "no_upcoming", label: "No upcoming visit" },
  { value: "recall_due", label: "Not seen 6+ months" },
  { value: "upcoming", label: "Future booking" },
  { value: "seen_recent", label: "Seen last 30 days" },
  { value: "never_seen", label: "No visit yet" },
  { value: "new_patients", label: "0 visits" },
];

function patientDirectoryName(p: PatientApi): { last: string; first: string } {
  const last = (p.last_name || "").trim() || "—";
  const first = (p.first_name || "").trim() || "—";
  return { last, first };
}

function patientInitials(p: PatientApi): string {
  const { last, first } = patientDirectoryName(p);
  const a = first.charAt(0);
  const b = last.charAt(0);
  const s = `${a}${b}`.trim().toUpperCase();
  return s || "?";
}

function formatPhoneCompact(raw: string): string | null {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  const t = (raw || "").trim();
  return t || null;
}

function lastVisitLabel(p: PatientApi): string {
  if (p.last_visit == null || String(p.last_visit).trim() === "") return "No visit yet";
  return formatMonthDayYear(p.last_visit);
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

function nextAppointmentLabel(p: PatientApi): string | null {
  if (!p.next_appointment_date) return null;
  const date = formatMonthDayYear(p.next_appointment_date);
  const time = formatApiTime12h(p.next_appointment_time);
  return time ? `${date} · ${time}` : date;
}

function filterLabel(value: DirectoryFilter): string {
  return DIRECTORY_FILTER_OPTIONS.find((f) => f.value === value)?.label ?? "All patients";
}

type PatientRowStatus = "new" | "upcoming" | "no_upcoming" | "recall";

function monthsSinceIso(dateIso: string | null | undefined): number | null {
  if (!dateIso || !String(dateIso).trim()) return null;
  const d = new Date(`${String(dateIso).trim()}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

/** Simple clinical status for the Status column. */
function patientRowStatus(p: PatientApi): PatientRowStatus {
  if (!p.last_visit || !String(p.last_visit).trim()) return "new";
  if (p.next_appointment_date) return "upcoming";
  const months = monthsSinceIso(p.last_visit);
  if (months != null && months >= 6) return "recall";
  return "no_upcoming";
}

const STATUS_STYLES: Record<PatientRowStatus, { label: string; className: string }> = {
  new: {
    label: "New",
    className: "bg-[#e8e8e8] text-[#949494]",
  },
  upcoming: {
    label: "Upcoming",
    className: "bg-[#ecfdf5] text-[#0d5c2e]",
  },
  no_upcoming: {
    label: "No upcoming",
    className: "bg-[#fef3c7] text-[#92400e]",
  },
  recall: {
    label: "Recall due",
    className: "bg-[#fee2e2] text-[#991b1b]",
  },
};

async function fetchDirectoryCount(directory: DirectoryFilter): Promise<number> {
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("page_size", "1");
  if (directory) params.set("directory", directory);
  const data = await apiGetAuth<PaginatedPatients>(`/patients/?${params.toString()}`);
  return typeof data.count === "number" ? data.count : 0;
}

export default function DoctorPatientsPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<PatientApi[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [directoryFilter, setDirectoryFilter] = useState<DirectoryFilter>("");
  const [attentionCounts, setAttentionCounts] = useState({
    noUpcoming: 0,
    recallDue: 0,
    neverSeen: 0,
    total: 0,
  });
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; openUp: boolean } | null>(null);
  const [menuLinks, setMenuLinks] = useState<{ chart: string; history: string; label: string } | null>(
    null,
  );
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const closeMenu = useCallback(() => {
    setMenuOpenId(null);
    setMenuPos(null);
    setMenuLinks(null);
  }, []);

  const openRowMenu = useCallback(
    (p: PatientApi, displayName: string) => {
      if (menuOpenId === p.id) {
        closeMenu();
        return;
      }
      const btn = menuButtonRefs.current.get(p.id);
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const menuHeight = 100;
      const openUp = rect.bottom + menuHeight > window.innerHeight - 12;
      setMenuPos({
        top: openUp ? rect.top - 4 : rect.bottom + 4,
        left: Math.min(window.innerWidth - 168, Math.max(8, rect.right - 160)),
        openUp,
      });
      setMenuLinks({
        chart: `/doctor/patients/${p.id}/record`,
        history: `/doctor/patients/${p.id}/history`,
        label: displayName,
      });
      setMenuOpenId(p.id);
    },
    [menuOpenId, closeMenu],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (menuOpenId == null) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      const btn = menuButtonRefs.current.get(menuOpenId);
      if (btn?.contains(target)) return;
      closeMenu();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    const onScroll = () => closeMenu();
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menuOpenId, closeMenu]);

  /* eslint-disable react-hooks/set-state-in-effect -- reset pagination when search/filter changes */
  useEffect(() => {
    setPage(1);
    closeMenu();
  }, [debouncedSearch, directoryFilter, closeMenu]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const loadAttentionCounts = useCallback(async () => {
    try {
      const [noUpcoming, recallDue, neverSeen, total] = await Promise.all([
        fetchDirectoryCount("no_upcoming"),
        fetchDirectoryCount("recall_due"),
        fetchDirectoryCount("never_seen"),
        fetchDirectoryCount(""),
      ]);
      setAttentionCounts({ noUpcoming, recallDue, neverSeen, total });
    } catch {
      /* Keep last known counts — list load will still surface errors. */
    }
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("page_size", String(PAGE_SIZE));
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (directoryFilter) params.set("directory", directoryFilter);
    void apiGetAuth<PaginatedPatients>(`/patients/?${params.toString()}`)
      .then((data) => {
        setPatients(Array.isArray(data.results) ? data.results : []);
        setTotalCount(typeof data.count === "number" ? data.count : 0);
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : "Could not load patients.");
        setPatients([]);
        setTotalCount(0);
      })
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, directoryFilter]);

  /* eslint-disable react-hooks/set-state-in-effect -- load when page/search/filter changes */
  useEffect(() => {
    void load();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect -- load attention badge counts once */
  useEffect(() => {
    void loadAttentionCounts();
  }, [loadAttentionCounts]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    [totalCount],
  );

  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalCount);

  const searching = debouncedSearch.length > 0;
  const filtering = directoryFilter !== "";
  const hasActiveFilters = searching || filtering;
  const showPagination = !loading && totalCount > 0 && totalPages > 1;

  const refreshAll = () => {
    void load();
    void loadAttentionCounts();
  };

  const clearFilters = () => {
    setDirectoryFilter("");
    setSearchInput("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      {/* Toolbar — Banani Doctor Patients */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[14rem] max-w-md flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#949494]"
              aria-hidden
            />
            <input
              type="search"
              placeholder="Search by name, phone, or ID…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full rounded-lg border border-[#e8e8e8] bg-white py-2.5 pl-10 pr-10 text-sm text-[#0d1f14] placeholder:text-[#949494] focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
              aria-label="Search patients"
            />
            {searchInput.trim() ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[#949494] hover:bg-[#f5f5f5] hover:text-[#0d1f14]"
                aria-label="Clear search"
                onClick={() => setSearchInput("")}
              >
                <span aria-hidden className="text-lg leading-none">
                  ×
                </span>
              </button>
            ) : null}
          </div>

          <select
            id="doctor-patient-directory-filter"
            value={directoryFilter}
            onChange={(e) => setDirectoryFilter(e.target.value as DirectoryFilter)}
            className="min-w-[11rem] rounded-lg border border-[#e8e8e8] bg-white px-3 py-2.5 text-sm text-[#949494] focus:border-[#16a349]/40 focus:text-[#0d1f14] focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
            aria-label="Filter patients"
          >
            {DIRECTORY_FILTER_OPTIONS.map((o) => {
              const count =
                o.value === "no_upcoming"
                  ? attentionCounts.noUpcoming
                  : o.value === "recall_due"
                    ? attentionCounts.recallDue
                    : o.value === "never_seen"
                      ? attentionCounts.neverSeen
                      : null;
              return (
                <option key={o.value || "all"} value={o.value}>
                  {count != null && count > 0 ? `${o.label} (${count})` : o.label}
                </option>
              );
            })}
          </select>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-medium text-[#16a349] hover:underline"
            >
              Clear
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/doctor/patients/merge"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#e8e8e8] bg-white px-4 text-sm font-medium text-[#0d1f14] hover:bg-[#f5f5f5]"
          >
            Merge
            {isNewNavBadgeActive("/doctor/patients/merge") ? (
              <span className="rounded-full bg-[#dbe7fb] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#277eff]">
                New
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            onClick={refreshAll}
            disabled={loading}
            className="inline-flex h-10 items-center rounded-lg border border-[#e8e8e8] bg-white px-4 text-sm font-medium text-[#0d1f14] hover:bg-[#f5f5f5] disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>
      ) : null}

      {(attentionCounts.noUpcoming > 0 || attentionCounts.recallDue > 0 || attentionCounts.neverSeen > 0) && (
        <section className="flex flex-wrap gap-2" aria-label="Needs attention">
          {attentionCounts.noUpcoming > 0 ? (
            <button
              type="button"
              onClick={() => setDirectoryFilter("no_upcoming")}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                directoryFilter === "no_upcoming"
                  ? "border-amber-400 bg-amber-100 text-amber-950"
                  : "border-[#e8e8e8] bg-white text-[#92400e] hover:bg-[#f5f5f5]",
              )}
            >
              No upcoming visit ({attentionCounts.noUpcoming})
            </button>
          ) : null}
          {attentionCounts.recallDue > 0 ? (
            <button
              type="button"
              onClick={() => setDirectoryFilter("recall_due")}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                directoryFilter === "recall_due"
                  ? "border-rose-400 bg-rose-100 text-rose-900"
                  : "border-[#e8e8e8] bg-white text-[#991b1b] hover:bg-[#f5f5f5]",
              )}
            >
              Not seen 6+ months ({attentionCounts.recallDue})
            </button>
          ) : null}
          {attentionCounts.neverSeen > 0 ? (
            <button
              type="button"
              onClick={() => setDirectoryFilter("never_seen")}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                directoryFilter === "never_seen"
                  ? "border-[#e8e8e8] bg-[#f5f5f5] text-[#0d1f14]"
                  : "border-[#e8e8e8] bg-white text-[#0d1f14] hover:bg-[#f5f5f5]",
              )}
            >
              No visit yet ({attentionCounts.neverSeen})
            </button>
          ) : null}
        </section>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {loading ? (
          <div className="rounded-xl border border-[#e8e8e8] bg-white p-6">
            <Loader variant="page" label="Loading patients" sublabel="Gathering patient records…" />
          </div>
        ) : patients.length === 0 ? (
          <div className="rounded-xl border border-[#e8e8e8] bg-white py-12 text-center">
            <p className="text-[#949494]">
              {hasActiveFilters ? "No matching patients." : "No patients yet."}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                className="mt-4 text-sm font-semibold text-[#16a349] hover:underline"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <p className="text-sm text-[#949494]">
              Showing{" "}
              <span className="tabular-nums text-[#0d1f14]">
                {rangeStart}–{rangeEnd}
              </span>{" "}
              of <span className="tabular-nums text-[#0d1f14]">{totalCount}</span>
              {filtering ? (
                <>
                  {" "}
                  · <span className="font-medium text-[#0d1f14]">{filterLabel(directoryFilter)}</span>
                </>
              ) : null}
            </p>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#e8e8e8] bg-white">
              {/* Banani header row */}
              <div className="hidden items-center gap-4 border-b border-[#e8e8e8] bg-[#f5f5f5] px-5 py-3 sm:flex">
                <div className="min-w-0 flex-1 text-xs font-semibold text-[#949494]">Patient</div>
                <div className="w-36 shrink-0 text-xs font-semibold text-[#949494]">Phone</div>
                <div className="w-36 shrink-0 text-xs font-semibold text-[#949494]">Last visit</div>
                <div className="w-16 shrink-0 text-center text-xs font-semibold text-[#949494]">Visits</div>
                <div className="w-40 shrink-0 text-xs font-semibold text-[#949494]">Status</div>
                <div className="w-16 shrink-0 text-right text-xs font-semibold text-[#949494]">Actions</div>
              </div>

              <ul className="min-h-0 flex-1 divide-y divide-[#e8e8e8] overflow-auto">
                {patients.map((p) => {
                  const { last, first } = patientDirectoryName(p);
                  const displayName =
                    first !== "—" && last !== "—"
                      ? `${first} ${last}`
                      : first !== "—"
                        ? first
                        : last;
                  const phoneLine = formatPhoneCompact(p.phone);
                  const visits = typeof p.visit_count === "number" ? p.visit_count : 0;
                  const nextAppt = nextAppointmentLabel(p);
                  const noShows = typeof p.no_show_count === "number" ? p.no_show_count : 0;
                  const recordHref = `/doctor/patients/${p.id}/record`;
                  const status = patientRowStatus(p);
                  const statusUi = STATUS_STYLES[status];

                  return (
                    <li
                      key={p.id}
                      tabIndex={0}
                      className={cn(
                        "flex cursor-pointer flex-col gap-3 px-5 py-3.5 transition hover:bg-[#f8f8f7] sm:flex-row sm:items-center sm:gap-4",
                        "focus-visible:bg-[#dbe7fb]/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#16a349]",
                      )}
                      onClick={() => router.push(recordHref)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(recordHref);
                        }
                      }}
                      aria-label={`Open chart for ${displayName}`}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e8e8e8] text-[11px] font-semibold uppercase text-[#0d1f14]"
                          aria-hidden
                        >
                          {patientInitials(p)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-[#0d1f14]">{displayName}</span>
                            <PatientPaymentProfileBadge profile={p.payment_profile} />
                            <PatientIrisBadge irisTag={p.iris_tag} />
                            <PatientNoShowBadge count={noShows} />
                          </div>
                          <p className="mt-0.5 text-xs text-[#949494]">
                            {p.date_of_birth
                              ? `DOB: ${formatMonthDayYear(p.date_of_birth)}`
                              : `ID: #${p.id}`}
                          </p>
                        </div>
                      </div>

                      <div className="w-full text-sm text-[#949494] sm:w-36 sm:shrink-0">
                        <span className="sm:hidden text-xs font-semibold text-[#949494]">Phone · </span>
                        {phoneLine ? (
                          <span className="tabular-nums">{phoneLine}</span>
                        ) : (
                          <span>—</span>
                        )}
                      </div>

                      <div className="w-full text-sm text-[#949494] sm:w-36 sm:shrink-0">
                        <span className="sm:hidden text-xs font-semibold text-[#949494]">Last visit · </span>
                        <span className={cn(!p.last_visit && "italic")}>{lastVisitLabel(p)}</span>
                      </div>

                      <div className="hidden w-16 shrink-0 text-center sm:block">
                        <span className="text-sm font-semibold tabular-nums text-[#0d1f14]">{visits}</span>
                      </div>

                      <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:shrink-0">
                        <div className="w-40 shrink-0">
                          <span
                            className={cn(
                              "inline-flex rounded px-2 py-0.5 text-xs font-semibold",
                              statusUi.className,
                            )}
                          >
                            {statusUi.label}
                          </span>
                          {status === "upcoming" && nextAppt ? (
                            <p className="mt-0.5 text-[11px] leading-snug text-[#949494]">{nextAppt}</p>
                          ) : null}
                        </div>

                        <div
                          className="flex w-16 shrink-0 justify-end"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            ref={(el) => {
                              if (el) menuButtonRefs.current.set(p.id, el);
                              else menuButtonRefs.current.delete(p.id);
                            }}
                            aria-haspopup="menu"
                            aria-expanded={menuOpenId === p.id}
                            aria-label={`Actions for ${displayName}`}
                            onClick={() => openRowMenu(p, displayName)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e8e8e8] bg-white text-[#949494] hover:bg-[#f5f5f5] hover:text-[#0d1f14]"
                          >
                            <IconMoreVertical className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {showPagination ? (
                <div className="flex flex-col gap-3 border-t border-[#e8e8e8] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-[#949494]">
                    Page <span className="font-semibold tabular-nums text-[#0d1f14]">{page}</span> of{" "}
                    <span className="tabular-nums">{totalPages}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="h-9 rounded-lg border border-[#e8e8e8] bg-white px-4 text-xs font-semibold text-[#0d1f14] hover:bg-[#f5f5f5] disabled:opacity-40"
                      disabled={loading || page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-label="Previous page"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="h-9 rounded-lg border border-[#e8e8e8] bg-white px-4 text-xs font-semibold text-[#0d1f14] hover:bg-[#f5f5f5] disabled:opacity-40"
                      disabled={loading || page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      aria-label="Next page"
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      {menuOpenId != null && menuPos && menuLinks
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={`Actions for ${menuLinks.label}`}
              className="fixed z-[200] w-40 overflow-hidden rounded-lg border border-[#e8e8e8] bg-white py-1 shadow-lg"
              style={{
                top: menuPos.openUp ? undefined : menuPos.top,
                bottom: menuPos.openUp ? window.innerHeight - menuPos.top : undefined,
                left: menuPos.left,
              }}
            >
              <Link
                href={menuLinks.chart}
                role="menuitem"
                className="flex w-full items-center px-3.5 py-2.5 text-left text-sm font-medium text-[#16a349] hover:bg-[#f5f5f5]"
                onClick={closeMenu}
              >
                Chart
              </Link>
              <Link
                href={menuLinks.history}
                role="menuitem"
                className="flex w-full items-center px-3.5 py-2.5 text-left text-sm font-medium text-[#0d1f14] hover:bg-[#f5f5f5]"
                onClick={closeMenu}
              >
                History
              </Link>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
