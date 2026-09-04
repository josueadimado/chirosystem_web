"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageIntro } from "@/components/admin-shell";
import { DoctorPageIntro } from "@/components/doctor-shell";
import { Loader } from "@/components/loader";
import { Button } from "@/components/ui/button";
import { ApiError, apiGetAuth, apiPost } from "@/lib/api";

type DirectoryPatient = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  visit_count: number;
  last_visit: string | null;
};

type MergeSummary = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  date_of_birth: string;
  address_line1: string;
  city_state_zip: string;
  credit_balance: string;
  has_saved_card: boolean;
  card_brand: string;
  card_last4: string;
  payment_profile: string;
};

type MergePreview = {
  keep: MergeSummary;
  discard: MergeSummary;
  counts: {
    keep: Record<string, number>;
    discard: Record<string, number>;
    will_move: Record<string, number>;
    move_total: number;
  };
  field_plan: Array<{
    field: string;
    keep_value: string;
    discard_value: string;
    action: string;
  }>;
  warnings: string[];
  detail: string;
};

type Props = {
  /** API prefix for merge endpoints: /admin or /doctor */
  apiBase: "/admin" | "/doctor";
  backHref: string;
  variant: "admin" | "doctor";
};

function patientLabel(p: { first_name: string; last_name: string; id: number; phone?: string }) {
  return `${p.last_name}, ${p.first_name} (#${p.id})${p.phone ? ` · ${p.phone}` : ""}`;
}

function PatientCard({
  title,
  patient,
  tone,
}: {
  title: string;
  patient: MergeSummary;
  tone: "keep" | "discard";
}) {
  return (
    <div
      className={
        tone === "keep"
          ? "rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4"
          : "rounded-2xl border border-amber-200 bg-amber-50/70 p-4"
      }
    >
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">
        {patient.last_name}, {patient.first_name}{" "}
        <span className="text-sm font-medium text-slate-500">#{patient.id}</span>
      </p>
      <dl className="mt-3 space-y-1 text-sm text-slate-700">
        <div>
          <dt className="inline text-slate-500">Phone: </dt>
          <dd className="inline">{patient.phone || "—"}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">Email: </dt>
          <dd className="inline">{patient.email || "—"}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">DOB: </dt>
          <dd className="inline">{patient.date_of_birth || "—"}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">Address: </dt>
          <dd className="inline">
            {[patient.address_line1, patient.city_state_zip].filter(Boolean).join(", ") || "—"}
          </dd>
        </div>
        <div>
          <dt className="inline text-slate-500">Credit: </dt>
          <dd className="inline">${patient.credit_balance}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">Card: </dt>
          <dd className="inline">
            {patient.has_saved_card
              ? `${(patient.card_brand || "Card").toUpperCase()} •••• ${patient.card_last4}`
              : "None"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Shared Admin / Doctor UI to merge duplicate patient charts.
 */
export function StaffMergePatients({ apiBase, backHref, variant }: Props) {
  const [patients, setPatients] = useState<DirectoryPatient[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState("");
  const [keepQuery, setKeepQuery] = useState("");
  const [discardQuery, setDiscardQuery] = useState("");
  const [keepId, setKeepId] = useState<number | null>(null);
  const [discardId, setDiscardId] = useState<number | null>(null);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [merging, setMerging] = useState(false);
  const [resultMsg, setResultMsg] = useState("");
  const [resultError, setResultError] = useState("");

  const loadPatients = useCallback(async () => {
    setLoadingList(true);
    setListError("");
    try {
      if (apiBase === "/admin") {
        const data = await apiGetAuth<DirectoryPatient[]>("/admin/patients/");
        setPatients(data || []);
      } else {
        // Doctors use the shared patient directory (same as Patients page).
        const data = await apiGetAuth<{
          results?: Array<{
            id: number;
            first_name: string;
            last_name: string;
            phone: string;
            email?: string;
            visit_count: number;
            last_visit: string | null;
          }>;
        }>("/patients/?page_size=500");
        const rows = Array.isArray(data.results) ? data.results : [];
        setPatients(
          rows.map((p) => ({
            id: p.id,
            first_name: p.first_name,
            last_name: p.last_name,
            phone: p.phone || "",
            email: p.email || "",
            visit_count: p.visit_count || 0,
            last_visit: p.last_visit,
          })),
        );
      }
    } catch (e) {
      setListError(e instanceof ApiError ? e.message : "Could not load patients.");
      setPatients([]);
    } finally {
      setLoadingList(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void loadPatients();
  }, [loadPatients]);

  const filterPatients = (q: string) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return patients.slice(0, 40);
    return patients
      .filter((p) => {
        const hay = `${p.last_name} ${p.first_name} ${p.phone} ${p.email} #${p.id}`.toLowerCase();
        return needle.split(/\s+/).every((part) => hay.includes(part));
      })
      .slice(0, 40);
  };

  const keepMatches = useMemo(() => filterPatients(keepQuery), [patients, keepQuery]);
  const discardMatches = useMemo(() => filterPatients(discardQuery), [patients, discardQuery]);

  const runPreview = async () => {
    if (!keepId || !discardId) {
      setPreviewError("Pick both the chart to keep and the duplicate to remove.");
      return;
    }
    setPreviewing(true);
    setPreviewError("");
    setResultMsg("");
    setResultError("");
    setPreview(null);
    setConfirmText("");
    try {
      const data = await apiPost<MergePreview>(`${apiBase}/patients/merge_preview/`, {
        keep_patient_id: keepId,
        discard_patient_id: discardId,
      });
      setPreview(data);
    } catch (e) {
      setPreviewError(e instanceof ApiError ? e.message : "Could not build merge preview.");
    } finally {
      setPreviewing(false);
    }
  };

  const runMerge = async () => {
    if (!keepId || !discardId || !preview) return;
    if (confirmText.trim().toLowerCase() !== "merge") {
      setResultError("Type MERGE in the box to confirm (this cannot be undone).");
      return;
    }
    setMerging(true);
    setResultError("");
    setResultMsg("");
    try {
      const res = await apiPost<{ detail: string }>(`${apiBase}/patients/merge_confirm/`, {
        keep_patient_id: keepId,
        discard_patient_id: discardId,
        confirm: "merge",
      });
      setResultMsg(res.detail || "Merge complete.");
      setPreview(null);
      setDiscardId(null);
      setDiscardQuery("");
      setConfirmText("");
      await loadPatients();
    } catch (e) {
      setResultError(e instanceof ApiError ? e.message : "Merge failed.");
    } finally {
      setMerging(false);
    }
  };

  const countRows = preview
    ? Object.entries(preview.counts.will_move).filter(([, n]) => n > 0)
    : [];

  const intro =
    variant === "admin" ? (
      <AdminPageIntro
        title="Merge patients"
        description="Combine two charts that belong to the same person. Visits, notes, bills, and documents move to the chart you keep."
        pageHelp={
          <>
            Choose the <strong>correct chart to keep</strong> (usually the one with the doctor notes), then the{" "}
            <strong>duplicate to remove</strong>. Preview first. Do not merge two different family members who
            share a phone.
          </>
        }
      />
    ) : (
      <DoctorPageIntro
        eyebrow="Charts"
        title="Merge patients"
        description="Combine two charts that belong to the same person so notes and new bookings stay together."
        pageHelp={
          <>
            Keep the chart that already has your notes. Remove the empty/wrong duplicate created when someone
            booked under a slightly different name. Preview first — this cannot be undone.
          </>
        }
      />
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {intro}
        <Link
          href={backHref}
          className="mt-1 inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:mt-8"
        >
          Back to patients
        </Link>
      </div>

      {listError ? (
        <p className="rounded-lg bg-rose-100 p-3 text-sm font-medium text-rose-800">{listError}</p>
      ) : null}
      {loadingList ? <Loader label="Loading patient list…" /> : null}

      {!loadingList ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-emerald-900">1. Chart to keep</h2>
            <p className="mt-1 text-xs text-slate-500">This chart stays. Notes and visits from the other move here.</p>
            <input
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              placeholder="Search name, phone, or #id"
              value={keepQuery}
              onChange={(e) => setKeepQuery(e.target.value)}
            />
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {keepMatches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setKeepId(p.id);
                      setKeepQuery(patientLabel(p));
                      setPreview(null);
                    }}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                      keepId === p.id ? "bg-emerald-100 font-semibold text-emerald-950" : "hover:bg-slate-50"
                    }`}
                  >
                    {patientLabel(p)}
                    <span className="block text-xs font-normal text-slate-500">
                      {p.visit_count} visits
                      {p.last_visit ? ` · last ${p.last_visit}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-amber-900">2. Duplicate to remove</h2>
            <p className="mt-1 text-xs text-slate-500">This chart is deleted after its history moves over.</p>
            <input
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              placeholder="Search name, phone, or #id"
              value={discardQuery}
              onChange={(e) => setDiscardQuery(e.target.value)}
            />
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {discardMatches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={p.id === keepId}
                    onClick={() => {
                      setDiscardId(p.id);
                      setDiscardQuery(patientLabel(p));
                      setPreview(null);
                    }}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm disabled:opacity-40 ${
                      discardId === p.id ? "bg-amber-100 font-semibold text-amber-950" : "hover:bg-slate-50"
                    }`}
                  >
                    {patientLabel(p)}
                    <span className="block text-xs font-normal text-slate-500">
                      {p.visit_count} visits
                      {p.last_visit ? ` · last ${p.last_visit}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={previewing || !keepId || !discardId}
          onClick={() => void runPreview()}
          className="h-10 rounded-xl bg-[#0d5c2e] px-4 text-sm font-semibold text-white hover:bg-[#0a4a25]"
        >
          {previewing ? "Previewing…" : "Preview merge"}
        </Button>
        {keepId && discardId ? (
          <button
            type="button"
            className="h-10 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            onClick={() => {
              const a = keepId;
              const b = discardId;
              setKeepId(b);
              setDiscardId(a);
              setPreview(null);
              const ka = patients.find((p) => p.id === b);
              const da = patients.find((p) => p.id === a);
              setKeepQuery(ka ? patientLabel(ka) : "");
              setDiscardQuery(da ? patientLabel(da) : "");
            }}
          >
            Swap keep ↔ duplicate
          </button>
        ) : null}
      </div>

      {previewError ? <p className="text-sm font-medium text-rose-700">{previewError}</p> : null}
      {resultMsg ? <p className="rounded-lg bg-emerald-100 p-3 text-sm font-medium text-emerald-900">{resultMsg}</p> : null}
      {resultError ? <p className="rounded-lg bg-rose-100 p-3 text-sm font-medium text-rose-800">{resultError}</p> : null}

      {preview ? (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-700">{preview.detail}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <PatientCard title="Keep" patient={preview.keep} tone="keep" />
            <PatientCard title="Remove after merge" patient={preview.discard} tone="discard" />
          </div>

          {preview.warnings.length > 0 ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-950">Please check</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-950">
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <p className="text-sm font-semibold text-slate-900">
              Records that will move ({preview.counts.move_total})
            </p>
            {countRows.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">No history on the duplicate — only contact fields may fill in.</p>
            ) : (
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {countRows.map(([key, n]) => (
                  <li key={key} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <span className="font-medium capitalize">{key.replace(/_/g, " ")}</span>: {n}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-900">Fields that will change on the keep chart</p>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
              {preview.field_plan
                .filter((f) => f.action !== "keep")
                .map((f) => (
                  <li key={f.field} className="rounded-lg border border-slate-100 px-3 py-2">
                    <span className="font-medium">{f.field.replace(/_/g, " ")}</span>
                    <span className="text-slate-500"> — {f.action.replace(/_/g, " ")}</span>
                    <span className="block text-xs text-slate-600">
                      keep: {f.keep_value || "—"} → from duplicate: {f.discard_value || "—"}
                    </span>
                  </li>
                ))}
              {preview.field_plan.every((f) => f.action === "keep") ? (
                <li className="text-slate-500">No contact-field changes (keep chart already has the info).</li>
              ) : null}
            </ul>
          </div>

          <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
            <p className="text-sm font-semibold text-rose-900">Confirm merge</p>
            <p className="mt-1 text-xs text-rose-800">
              Type <strong>MERGE</strong> then click the button. The duplicate chart is permanently removed.
            </p>
            <input
              className="mt-3 w-full max-w-xs rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-sm uppercase tracking-wide"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="MERGE"
              autoComplete="off"
            />
            <Button
              type="button"
              disabled={merging || confirmText.trim().toLowerCase() !== "merge"}
              onClick={() => void runMerge()}
              className="mt-3 h-10 rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
            >
              {merging ? "Merging…" : "Merge charts now"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
