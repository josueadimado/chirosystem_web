"use client";

import { DoctorPageIntro } from "@/components/doctor-shell";
import { Loader } from "@/components/loader";
import { ApiError, apiGetAuth } from "@/lib/api";
import { formatMonthDayYear } from "@/lib/format-date";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

/** Matches `PatientSerializer` — `GET /patients/` */
type PatientApi = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  date_of_birth: string | null;
};

function fullName(p: PatientApi): string {
  return `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Patient";
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function matchesSearch(p: PatientApi, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const name = fullName(p).toLowerCase();
  if (name.includes(t)) return true;
  const email = (p.email || "").toLowerCase();
  if (email.includes(t)) return true;
  const qd = digitsOnly(q);
  if (qd.length >= 3 && digitsOnly(p.phone || "").includes(qd)) return true;
  return false;
}

export default function DoctorPatientsPage() {
  const [patients, setPatients] = useState<PatientApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    void apiGetAuth<PatientApi[]>("/patients/")
      .then((rows) => setPatients(Array.isArray(rows) ? rows : []))
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : "Could not load patients.");
        setPatients([]);
      })
      .finally(() => setLoading(false));
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- mount / patient-id fetch lifecycle */
  useEffect(() => {
    void load();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filtered = useMemo(() => {
    return patients.filter((p) => matchesSearch(p, debouncedSearch));
  }, [patients, debouncedSearch]);

  const searching = debouncedSearch.length > 0;

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
        ) : filtered.length === 0 ? (
          <p className="mt-6 text-center text-slate-600">
            {patients.length === 0 ? "No patients are on file yet." : "No patients found matching your search."}
          </p>
        ) : (
          <ul className="mt-6 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
            {filtered.map((p) => (
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

        {!loading && patients.length > 0 && (
          <p className="mt-4 text-center text-xs text-slate-500">
            {searching
              ? `Showing ${filtered.length} of ${patients.length} patients`
              : `${patients.length} patient${patients.length === 1 ? "" : "s"} — use search to narrow`}
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
