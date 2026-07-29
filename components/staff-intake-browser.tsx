"use client";

import { formatAnswerValue, FORM_TYPE_OPTIONS, type IntakeSubmissionRow } from "@/lib/digital-intake";
import { ApiError, apiGetAuth, apiPost } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** "/admin" or "/doctor" */
  basePath: "/admin" | "/doctor";
};

export function StaffIntakeBrowser({ basePath }: Props) {
  const [q, setQ] = useState("");
  const [formType, setFormType] = useState("");
  const [rows, setRows] = useState<IntakeSubmissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<IntakeSubmissionRow | null>(null);
  const [sendPatientId, setSendPatientId] = useState("");
  const [sendTypes, setSendTypes] = useState<string[]>([]);
  const [sendMsg, setSendMsg] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (formType) params.set("form_type", formType);
      params.set("status", "submitted");
      const data = await apiGetAuth<{ results: IntakeSubmissionRow[] }>(
        `${basePath}/intake_forms/?${params.toString()}`,
      );
      setRows(data.results || []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load forms.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [basePath, formType, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (id: number) => {
    try {
      const row = await apiGetAuth<IntakeSubmissionRow>(`${basePath}/intake_form_detail/?id=${id}`);
      setSelected(row);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open form.");
    }
  };

  const sendLink = async () => {
    setSendMsg("");
    const patientId = Number(sendPatientId);
    if (!Number.isFinite(patientId) || patientId <= 0) {
      setSendMsg("Enter a valid patient ID (open the patient chart to find it, or search forms after they submit).");
      return;
    }
    setSending(true);
    try {
      const payload: Record<string, unknown> = {
        patient_id: patientId,
        send_sms: true,
      };
      if (sendTypes.length) payload.form_types = sendTypes;
      const res = await apiPost<{
        detail: string;
        url: string;
        sms_sent: boolean;
        sms_detail: string;
      }>(`${basePath}/intake_send_link/`, payload);
      setSendMsg(
        `${res.detail} Link: ${res.url}` +
          (res.sms_sent ? "" : res.sms_detail ? ` (SMS: ${res.sms_detail})` : ""),
      );
    } catch (e) {
      setSendMsg(e instanceof ApiError ? e.message : "Could not send link.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Intake forms</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Search forms clients completed online. Send a personal link so they can fill paperwork before
          their visit (info we already have is prefilled; they can edit it).
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900">Send intake link</h2>
        <p className="mt-1 text-xs text-slate-500">
          Uses the patient&apos;s phone on file. Leave form types empty to auto-pick from age and upcoming
          appointments.
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 space-y-1">
            <span className="text-xs font-medium text-slate-600">Patient ID</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={sendPatientId}
              onChange={(e) => setSendPatientId(e.target.value)}
              placeholder="e.g. 42"
            />
          </label>
          <button
            type="button"
            disabled={sending}
            onClick={() => void sendLink()}
            className="rounded-xl bg-[#0d5c2e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4a25] disabled:opacity-60"
          >
            {sending ? "Sending…" : "Create & text link"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {FORM_TYPE_OPTIONS.map((opt) => {
            const on = sendTypes.includes(opt.value);
            return (
              <label key={opt.value} className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setSendTypes((prev) =>
                      on ? prev.filter((x) => x !== opt.value) : [...prev, opt.value],
                    )
                  }
                />
                {opt.label}
              </label>
            );
          })}
        </div>
        {sendMsg ? <p className="mt-3 break-all text-sm text-slate-700">{sendMsg}</p> : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            className="w-full flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            placeholder="Search name, phone, or email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
          />
          <select
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            value={formType}
            onChange={(e) => setFormType(e.target.value)}
          >
            <option value="">All form types</option>
            {FORM_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Search
          </button>
        </div>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Patient</th>
                <th className="px-4 py-3 font-semibold">Form</th>
                <th className="px-4 py-3 font-semibold">Submitted</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    No submitted forms yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50 hover:bg-emerald-50/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{row.patient_name}</div>
                      <div className="text-xs text-slate-500">
                        {row.patient_phone}
                        {row.patient_email ? ` · ${row.patient_email}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.form_label}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.submitted_at ? new Date(row.submitted_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void openDetail(row.id)}
                        className="text-sm font-semibold text-[#0d5c2e] hover:underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-6"
          onClick={() => setSelected(null)}
        >
          <div
            className={cn(
              "max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl sm:p-6",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selected.form_label}</h2>
                <p className="text-sm text-slate-600">
                  {selected.patient_name}
                  {selected.signature_name ? ` · Signed: ${selected.signature_name}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
            <dl className="mt-4 space-y-3">
              {Object.entries(selected.answers || {}).map(([key, value]) => (
                <div key={key} className="grid gap-1 border-b border-slate-100 pb-2 sm:grid-cols-[180px_1fr]">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {key.replace(/_/g, " ")}
                  </dt>
                  <dd className="text-sm text-slate-800 whitespace-pre-wrap">{formatAnswerValue(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  );
}
