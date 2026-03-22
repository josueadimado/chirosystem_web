"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { HelpTip } from "@/components/help-tip";
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

export default function AdminPatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailPatientId, setDetailPatientId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const loadPatients = useCallback(() => {
    setError("");
    return apiGetAuth<Patient[]>("/admin/patients/")
      .then(setPatients)
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : "Failed to load patients.");
        setPatients([]);
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadPatients().finally(() => setLoading(false));
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
                  <th className="pb-3 font-semibold">Patient</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Last Visit</th>
                  <th className="pb-3 font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className="cursor-pointer border-t border-slate-200 transition hover:bg-slate-50"
                    onClick={() => setDetailPatientId(p.id)}
                  >
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#16a349]/20 text-sm font-semibold text-[#0d5c2e]">
                          {p.first_name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">
                            {p.first_name} {p.last_name}
                          </p>
                          <p className="text-xs text-slate-500">#PT-{String(p.id).padStart(4, "0")}</p>
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
                ))}
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
