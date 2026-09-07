"use client";

import { DoctorPageIntro } from "@/components/doctor-shell";
import { PatientNoShowBadge } from "@/components/status-chip";
import { PatientNameWithProfile } from "@/components/patient-payment-profile";
import { Loader } from "@/components/loader";
import { ApiError, apiGetAuth } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatMonthDayYear } from "@/lib/format-date";
import { isNewNavBadgeActive } from "@/lib/staff-announcements";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

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

/** Primary one-click filters (less crowding than showing every option as a pill). */
const QUICK_FILTERS: { value: DirectoryFilter; label: string; hint: string }[] = [
  { value: "", label: "All", hint: "Everyone in your directory, most recent visit first" },
  { value: "no_upcoming", label: "No upcoming visit", hint: "No future appointment on the books" },
  { value: "recall_due", label: "Not seen 6+ months", hint: "Last completed visit was over six months ago" },
  { value: "upcoming", label: "Future booking", hint: "Has an upcoming appointment — soonest first" },
];

const MORE_FILTERS: { value: DirectoryFilter; label: string; hint: string }[] = [
  { value: "seen_recent", label: "Seen last 30 days", hint: "Completed a visit in the last month" },
  { value: "never_seen", label: "No visit yet", hint: "Never completed a visit (may still be booked)" },
  { value: "new_patients", label: "0 visits", hint: "No completed visits on file" },
];

const ALL_FILTERS = [...QUICK_FILTERS, ...MORE_FILTERS];

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

function filterMeta(value: DirectoryFilter) {
  return ALL_FILTERS.find((f) => f.value === value) ?? ALL_FILTERS[0];
}

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

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, directoryFilter]);

  const activeFilter = filterMeta(directoryFilter);

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

  useEffect(() => {
    void loadAttentionCounts();
  }, [loadAttentionCounts]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    [totalCount],
  );

  const rangeLabel = useMemo(() => {
    if (totalCount === 0) return null;
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, totalCount);
    return `${start}–${end}`;
  }, [page, totalCount]);

  const searching = debouncedSearch.length > 0;
  const filtering = directoryFilter !== "";
  const showPagination = !loading && totalCount > 0 && totalPages > 1;
  const moreFilterActive = MORE_FILTERS.some((f) => f.value === directoryFilter);

  const sortHint =
    directoryFilter === "upcoming"
      ? "sorted by next appointment"
      : directoryFilter === "recall_due"
        ? "sorted by oldest last visit"
        : "sorted by most recent visit";

  const refreshAll = () => {
    void load();
    void loadAttentionCounts();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <DoctorPageIntro
          eyebrow="Directory"
          title="Patients"
          description="Find charts quickly and spot who needs a next visit or a recall call."
          pageHelp={
            <>
              Your list shows chiropractic or massage patients for your role. You can open other charts read-only if
              needed. Admin can edit everyone. Use filters for patients with no upcoming visit or not seen in 6+ months.
              Click a row or <strong>Chart</strong> to open the chart.
            </>
          }
        />
        <div className="mt-1 flex shrink-0 flex-wrap gap-2 sm:mt-8">
          <Link
            href="/doctor/patients/merge"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Merge patients
            {isNewNavBadgeActive("/doctor/patients/merge") ? (
              <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                New
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            onClick={refreshAll}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>
      ) : null}

      {(attentionCounts.noUpcoming > 0 || attentionCounts.recallDue > 0 || attentionCounts.neverSeen > 0) && (
        <section
          className="rounded-2xl border border-amber-200/90 bg-amber-50/80 px-4 py-3.5 shadow-sm ring-1 ring-amber-100"
          aria-label="Needs attention"
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900/80">Needs attention</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {attentionCounts.noUpcoming > 0 ? (
              <button
                type="button"
                onClick={() => setDirectoryFilter("no_upcoming")}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                  directoryFilter === "no_upcoming"
                    ? "border-amber-400 bg-amber-100 text-amber-950"
                    : "border-amber-200 bg-white text-amber-900 hover:bg-amber-50",
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
                    : "border-rose-200 bg-white text-rose-800 hover:bg-rose-50",
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
                    ? "border-slate-400 bg-slate-100 text-slate-900"
                    : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
                )}
              >
                No visit yet ({attentionCounts.neverSeen})
              </button>
            ) : null}
          </div>
        </section>
      )}

      {!loading && attentionCounts.total > 0 ? (
        <p className="text-xs text-slate-500">
          <span className="font-semibold tabular-nums text-slate-700">{attentionCounts.total}</span> patients in your
          directory
          {attentionCounts.noUpcoming > 0 ? (
            <>
              {" "}
              · <span className="font-semibold tabular-nums text-amber-800">{attentionCounts.noUpcoming}</span> with no
              upcoming visit
            </>
          ) : null}
          {attentionCounts.recallDue > 0 ? (
            <>
              {" "}
              · <span className="font-semibold tabular-nums text-rose-700">{attentionCounts.recallDue}</span> not seen 6+
              months
            </>
          ) : null}
        </p>
      ) : null}

      <div className="doctor-panel space-y-4">
        <div className="sticky top-0 z-20 -mx-1 space-y-3 border-b border-slate-100 bg-[var(--card,white)]/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/90">
          <label className="block max-w-md">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Search by name or phone
            </span>
            <div className="relative">
              <input
                type="search"
                autoComplete="off"
                placeholder="Start typing…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-4 pr-10 text-sm shadow-sm placeholder:text-slate-400 focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15"
                aria-label="Search patients by name or phone"
              />
              {searchInput.trim() ? (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                  aria-label="Clear search"
                  onClick={() => setSearchInput("")}
                >
                  ×
                </button>
              ) : null}
            </div>
          </label>

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick filters">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Filter</span>
            {QUICK_FILTERS.map((f) => {
              const active = directoryFilter === f.value;
              const count =
                f.value === "no_upcoming"
                  ? attentionCounts.noUpcoming
                  : f.value === "recall_due"
                    ? attentionCounts.recallDue
                    : null;
              return (
                <button
                  key={f.value || "all"}
                  type="button"
                  title={f.hint}
                  onClick={() => setDirectoryFilter(f.value)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition",
                    active
                      ? "border-[#16a349]/50 bg-[#ecfdf5] text-[#0d5c2e]"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                >
                  {f.label}
                  {count != null && count > 0 ? (
                    <span className="ml-1 tabular-nums text-slate-500">({count})</span>
                  ) : null}
                </button>
              );
            })}
            <label className="sr-only" htmlFor="doctor-patient-more-filter">
              More filters
            </label>
            <select
              id="doctor-patient-more-filter"
              value={moreFilterActive ? directoryFilter : ""}
              onChange={(e) => {
                const v = e.target.value as DirectoryFilter;
                if (v) setDirectoryFilter(v);
              }}
              className="max-w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 shadow-sm focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15"
              aria-label="More patient filters"
            >
              <option value="">More…</option>
              {MORE_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            {filtering || searching ? (
              <button
                type="button"
                onClick={() => {
                  setDirectoryFilter("");
                  setSearchInput("");
                }}
                className="text-xs font-semibold text-[#0d5c2e] hover:underline"
              >
                Clear search & filters
              </button>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed text-slate-600">{activeFilter.hint}</p>
        </div>

        {loading ? (
          <div className="py-12">
            <Loader variant="page" label="Loading patients" />
          </div>
        ) : patients.length === 0 ? (
          <p className="py-8 text-center text-slate-600">
            {searching || filtering
              ? "No patients match your search or filter. Try clearing filters or widening your search."
              : "No patients are on file yet."}
          </p>
        ) : (
          <>
            {rangeLabel ? (
              <p className="text-sm text-slate-600">
                Showing <span className="tabular-nums font-medium text-slate-800">{rangeLabel}</span> of{" "}
                <span className="tabular-nums">{totalCount}</span>
                {filtering ? (
                  <>
                    {" "}
                    · <span className="font-medium text-[#0d5c2e]">{activeFilter.label}</span>
                  </>
                ) : null}
                {searching ? " (search)" : ""} — {sortHint}
              </p>
            ) : null}

            <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100/80">
              <div className="max-h-[min(520px,65vh)] overflow-y-auto overscroll-contain">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50/95 backdrop-blur">
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 pl-4">Patient</th>
                      <th className="px-3 py-3">Last visit</th>
                      <th className="px-3 py-3 text-center">Visits</th>
                      <th className="hidden px-3 py-3 xl:table-cell">Last service</th>
                      <th className="hidden px-3 py-3 lg:table-cell">Next appointment</th>
                      <th className="px-3 py-3 pr-4 text-right">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patients.map((p) => {
                      const { last, first } = patientDirectoryName(p);
                      const phoneLine = formatPhoneCompact(p.phone);
                      const visits = typeof p.visit_count === "number" ? p.visit_count : 0;
                      const nextAppt = nextAppointmentLabel(p);
                      const service = (p.last_service || "").trim();
                      const noShows = typeof p.no_show_count === "number" ? p.no_show_count : 0;
                      const recordHref = `/doctor/patients/${p.id}/record`;
                      const historyHref = `/doctor/patients/${p.id}/history`;
                      const noUpcoming = !nextAppt && !!p.last_visit;
                      const isNew = !p.last_visit;
                      let rowAlert: "recall" | "attention" | "soft" | "none" = "none";
                      if (directoryFilter === "recall_due") rowAlert = "recall";
                      else if (directoryFilter === "no_upcoming" || directoryFilter === "never_seen")
                        rowAlert = "attention";
                      else if (noUpcoming) rowAlert = "soft";

                      return (
                        <tr
                          key={p.id}
                          tabIndex={0}
                          className={cn(
                            "group cursor-pointer border-t border-slate-100 transition",
                            rowAlert === "recall" &&
                              "bg-rose-50/50 hover:bg-rose-50 focus-visible:bg-rose-50",
                            rowAlert === "attention" &&
                              "bg-amber-50/40 hover:bg-amber-50/70 focus-visible:bg-amber-50/70",
                            rowAlert === "soft" && "hover:bg-amber-50/30 focus-visible:bg-amber-50/40",
                            rowAlert === "none" && "hover:bg-emerald-50/40 focus-visible:bg-emerald-50/50",
                            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#16a349]",
                          )}
                          onClick={() => router.push(recordHref)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              router.push(recordHref);
                            }
                          }}
                          aria-label={`Open chart for ${last}, ${first}`}
                        >
                          <td className="px-4 py-3.5 pl-4 align-middle">
                            <div className="flex items-center gap-3">
                              <div
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#ecfdf5] to-[#d1fae5] text-[11px] font-bold uppercase tracking-[0.08em] text-[#065f46] ring-1 ring-[#16a349]/15"
                                aria-hidden
                              >
                                {patientInitials(p)}
                              </div>
                              <div className="min-w-0">
                                <p className="flex flex-wrap items-center gap-2 leading-snug text-slate-900">
                                  <PatientNameWithProfile
                                    name={
                                      <span>
                                        <span className="font-semibold tracking-tight">{last}</span>
                                        <span className="font-normal text-slate-400">, </span>
                                        <span className="font-medium text-slate-700">{first}</span>
                                      </span>
                                    }
                                    profile={p.payment_profile}
                                    compactBadge
                                  />
                                  <PatientNoShowBadge count={noShows} />
                                  {noUpcoming ? (
                                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                                      No upcoming
                                    </span>
                                  ) : null}
                                  {isNew ? (
                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                                      New
                                    </span>
                                  ) : null}
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
                                      <span className="tabular-nums">{phoneLine}</span>
                                    </>
                                  ) : null}
                                  {p.date_of_birth ? (
                                    <>
                                      <span className="text-slate-300" aria-hidden>
                                        ·
                                      </span>
                                      <span>DOB {formatMonthDayYear(p.date_of_birth)}</span>
                                    </>
                                  ) : null}
                                </p>
                                {nextAppt ? (
                                  <p className="mt-1 text-xs font-medium text-[#047857] lg:hidden">
                                    Next: {nextAppt}
                                  </p>
                                ) : null}
                                {service ? (
                                  <p className="mt-0.5 truncate text-xs text-slate-500 xl:hidden">{service}</p>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3.5 align-middle text-slate-700">
                            <span className={cn("tabular-nums", !p.last_visit && "italic text-slate-500")}>
                              {lastVisitLabel(p)}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 align-middle text-center">
                            <span
                              className={cn(
                                "inline-flex min-w-[2rem] justify-center rounded-lg px-2 py-0.5 text-sm font-semibold tabular-nums",
                                visits > 0 ? "bg-slate-100 text-slate-800" : "bg-slate-50 text-slate-400",
                              )}
                            >
                              {visits}
                            </span>
                          </td>
                          <td className="hidden max-w-[12rem] truncate px-3 py-3.5 align-middle text-slate-600 xl:table-cell">
                            {service || <span className="text-slate-400">—</span>}
                          </td>
                          <td className="hidden px-3 py-3.5 align-middle lg:table-cell">
                            {nextAppt ? (
                              <span className="text-sm font-medium text-[#047857]">{nextAppt}</span>
                            ) : (
                              <span className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                                None
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3.5 pr-4 align-middle text-right">
                            <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end sm:gap-3">
                              <Link
                                href={recordHref}
                                className="text-xs font-semibold text-[#16a349] underline-offset-2 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Chart
                              </Link>
                              <Link
                                href={historyHref}
                                className="text-xs font-semibold text-slate-600 underline-offset-2 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                History
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {showPagination ? (
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-center text-sm text-slate-600 sm:text-left">
              Page {page} of {totalPages}
              {rangeLabel ? (
                <>
                  {" "}
                  <span className="text-slate-400">·</span> Showing {rangeLabel} of {totalCount}
                </>
              ) : null}
            </p>
            <div className="flex justify-center gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={loading || page <= 1}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={loading || page >= totalPages}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
