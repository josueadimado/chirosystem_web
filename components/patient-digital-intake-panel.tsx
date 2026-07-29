"use client";

import { ApiError, apiGetAuth, apiPost } from "@/lib/api";
import { formatAnswerValue, type IntakeSubmissionRow } from "@/lib/digital-intake";
import { useCallback, useEffect, useState } from "react";

type Props = {
  patientId: number;
  basePath: "/admin" | "/doctor";
};

export function PatientDigitalIntakePanel({ patientId, basePath }: Props) {
  const [forms, setForms] = useState<IntakeSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<IntakeSubmissionRow | null>(null);
  const [linkMsg, setLinkMsg] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiGetAuth<{ forms: IntakeSubmissionRow[] }>(
        `${basePath}/patient_intake_forms/?patient_id=${patientId}`,
      );
      setForms(data.forms || []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load intake forms.");
      setForms([]);
    } finally {
      setLoading(false);
    }
  }, [basePath, patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sendLink = async () => {
    setSending(true);
    setLinkMsg("");
    try {
      const res = await apiPost<{ detail: string; url: string; sms_sent: boolean; sms_detail: string }>(
        `${basePath}/intake_send_link/`,
        { patient_id: patientId, send_sms: true },
      );
      setLinkMsg(
        `${res.detail} ${res.url}` +
          (res.sms_sent ? "" : res.sms_detail ? ` (SMS note: ${res.sms_detail})` : ""),
      );
    } catch (e) {
      setLinkMsg(e instanceof ApiError ? e.message : "Could not send link.");
    } finally {
      setSending(false);
    }
  };

  const openForm = async (id: number) => {
    try {
      const row = await apiGetAuth<IntakeSubmissionRow>(`${basePath}/intake_form_detail/?id=${id}`);
      setSelected(row);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open form.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
        <p className="text-sm text-slate-700">
          Send a personal link so this client can complete intake online. Existing chart info is prefilled;
          they can edit anything.
        </p>
        <button
          type="button"
          disabled={sending}
          onClick={() => void sendLink()}
          className="mt-3 rounded-xl bg-[#0d5c2e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4a25] disabled:opacity-60"
        >
          {sending ? "Sending…" : "Text intake link"}
        </button>
        {linkMsg ? <p className="mt-2 break-all text-xs text-slate-600">{linkMsg}</p> : null}
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading forms…</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {!loading && forms.length === 0 ? (
        <p className="text-sm text-slate-500">No digital intake forms on file yet.</p>
      ) : (
        <ul className="space-y-2">
          {forms.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <div>
                <p className="font-medium text-slate-900">{f.form_label}</p>
                <p className="text-xs text-slate-500">
                  {f.status}
                  {f.submitted_at ? ` · ${new Date(f.submitted_at).toLocaleString()}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void openForm(f.id)}
                className="text-sm font-semibold text-[#0d5c2e] hover:underline"
              >
                View answers
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900">{selected.form_label}</h3>
            <button type="button" className="text-sm text-slate-500" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          {selected.signature_name ? (
            <p className="mt-1 text-xs text-slate-500">Signed: {selected.signature_name}</p>
          ) : null}
          <dl className="mt-3 max-h-80 space-y-2 overflow-y-auto">
            {Object.entries(selected.answers || {}).map(([key, value]) => (
              <div key={key}>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {key.replace(/_/g, " ")}
                </dt>
                <dd className="text-sm text-slate-800 whitespace-pre-wrap">{formatAnswerValue(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
