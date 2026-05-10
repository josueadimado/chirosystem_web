"use client";

import { DoctorPageIntro } from "@/components/doctor-shell";
import { Loader } from "@/components/loader";
import { ApiError, apiGetAuth } from "@/lib/api";
import { formatMonthDayYear } from "@/lib/format-date";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

/** Matches `PatientSerializer` — each item in `GET /patients/` `results` */
type PatientApi = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  date_of_birth: string | null;
};

/** DRF paginated list (`page` + `page_size` query params) */
type PaginatedPatients = {
  count: number;
  next: string | null;
  previous: string | null;
  results: PatientApi[];
};

const PAGE_SIZE = 25;

function fullName(p: PatientApi): string {
  return `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Patient";
}

export default function DoctorPatientsPage() {
  const [patients, setPatients] = useState<PatientApi[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // New search → start from page 1 (server filters + paginates)
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("page_size", String(PAGE_SIZE));
    if (debouncedSearch) params.set("search", debouncedSearch);
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
  }, [page, debouncedSearch]);

  /* eslint-disable react-hooks/set-state-in-effect -- load when page/search changes */
  useEffect(() => {
    void load();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
  const showPagination = !loading && totalCount > 0 && totalPages > 1;

  return (
    <div className="space-y-6">
      <DoctorPageIntro
        eyebrow="Directory"
        title="Patients"
        description="Search anyone in the clinic by name or phone and open their full medical record."
      />

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>
      ) : null}

      <div className="doctor-panel">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Search patients by name or phone
          </span>
          <input
            type="search"
            autoComplete="off"
            placeholder="Start typing…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm placeholder:text-slate-400 focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15"
            aria-label="Search patients by name or phone"
          />
        </label>

        {loading ? (
          <div className="py-12">
            <Loader variant="page" label="Loading patients" />
          </div>
        ) : patients.length === 0 ? (
          <p className="mt-6 text-center text-slate-600">
            {totalCount === 0 && !searching
              ? "No patients are on file yet."
              : "No patients found matching your search."}
          </p>
        ) : (
          <ul className="mt-6 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
            {patients.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/doctor/patients/${p.id}/record`}
                  className="flex flex-col gap-1 px-4 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{fullName(p)}</p>
                    <p className="text-sm text-slate-600">{p.phone || "—"}</p>
                  </div>
                  <div className="text-sm text-slate-500 sm:text-right">
                    {p.date_of_birth ? (
                      <>
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">DOB </span>
                        {formatMonthDayYear(p.date_of_birth)}
                      </>
                    ) : (
                      <span className="text-slate-400">DOB not on file</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {showPagination ? (
          <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
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

        {!loading && totalCount > 0 && (
          <p className="mt-4 text-center text-xs text-slate-500">
            {searching ? (
              <>
                {totalCount} match{totalCount === 1 ? "" : "es"}
                {totalPages > 1 ? " — use Previous / Next to see more" : ""}
              </>
            ) : (
              `${totalCount} patient${totalCount === 1 ? "" : "s"} — use search to narrow`
            )}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Refresh list
          </button>
        </div>
      </div>
    </div>
  );
}
