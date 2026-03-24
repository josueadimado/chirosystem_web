"use client";

import { Loader } from "@/components/loader";
import { PatientDetailModal } from "@/components/patient-detail-modal";
import { ApiError, apiGetAuth } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";

type Patient = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  last_visit: string | null;
  balance: string;
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatBalance(balanceStr: string): string {
  const num = parseFloat(balanceStr);
  if (isNaN(num)) return "$0";
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

export default function AdminPatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailPatientId, setDetailPatientId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

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

  const filtered = patients.filter(
    (p) =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      p.phone.includes(search) ||
      (p.email && p.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="card">
        <h1 className="mb-4 text-2xl font-bold">All Patients</h1>
        {error && (
          <p className="mb-3 rounded-lg bg-rose-100 p-3 text-sm font-medium text-rose-800">{error}</p>
        )}
        <div className="mb-4">
          <input
            type="search"
            placeholder="Search by name, phone, or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        {loading ? (
          <Loader variant="page" label="Loading patients" sublabel="Gathering patient records…" />
        ) : filtered.length === 0 ? (
          <p className="animate-fade-in py-8 text-slate-500">
            {search ? "No patients match your search." : "No patients yet."}
          </p>
        ) : (
          <div className="animate-fade-in overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-3 font-semibold">Patient name</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Last Visit</th>
                  <th className="pb-3 font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const { last, first } = patientDirectoryName(p);
                  const phoneLine = formatPhoneCompact(p.phone);
                  return (
                  <tr
                    key={p.id}
                    className="cursor-pointer border-t border-slate-200 transition hover:bg-slate-50"
                    onClick={() => setDetailPatientId(p.id)}
                    aria-label={`Open chart for ${last}, ${first}`}
                  >
                    <td className="py-3.5">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#ecfdf5] to-[#d1fae5] text-[11px] font-bold uppercase tracking-[0.08em] text-[#065f46] shadow-inner ring-1 ring-[#16a349]/15"
                          aria-hidden
                        >
                          {patientInitials(p)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[15px] leading-snug text-slate-900">
                            <span className="font-semibold tracking-tight">{last}</span>
                            <span className="font-normal text-slate-400">, </span>
                            <span className="font-medium text-slate-700">{first}</span>
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                            <span className="font-mono tabular-nums text-slate-400">PT-{String(p.id).padStart(4, "0")}</span>
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
                    <td className="py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Active
                      </span>
                    </td>
                    <td className="py-3">{formatDate(p.last_visit)}</td>
                    <td className="py-3 font-medium">{formatBalance(p.balance)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
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
    </div>
  );
}
