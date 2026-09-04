"use client";

import { ApiError, apiGetAuth, apiPost } from "@/lib/api";
import { orderedIntakeAnswerRows, printIntakeSubmission, type IntakeSubmissionRow } from "@/lib/digital-intake";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

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
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!selected || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [selected]);

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

  const answerRows = selected ? orderedIntakeAnswerRows(selected.answers) : [];

  const detailModal =
    selected && portalReady
      ? createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-6"
            role="dialog"
            aria-modal="true"
            onClick={() => setSelected(null)}
          >
            <div
              className="flex max-h-[min(92dvh,900px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900">{selected.form_label}</h3>
                  {selected.signature_name ? (
                    <p className="mt-0.5 text-xs text-slate-500">Signed: {selected.signature_name}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                    onClick={() => printIntakeSubmission(selected)}
                  >
                    Print
                  </button>
                  <button
                    type="button"
                    className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                    onClick={() => setSelected(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {answerRows.length === 0 ? (
                  <p className="text-sm text-slate-500">No answers recorded.</p>
                ) : (
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="w-[38%] py-2 pr-3 font-semibold sm:w-48">Question</th>
                        <th className="py-2 font-semibold">Answer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {answerRows.map((row) => (
                        <tr key={row.key} className="border-b border-slate-100 align-top">
                          <td className="py-2.5 pr-3 text-xs font-semibold text-slate-600 sm:text-sm">
                            {row.label}
                          </td>
                          <td className="py-2.5 whitespace-pre-wrap text-slate-900">{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="space-y-4">
      <div>
        <button
          type="button"
          disabled={sending}
          onClick={() => void sendLink()}
          className="rounded-xl bg-[#0d5c2e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4a25] disabled:opacity-60"
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

      {detailModal}
    </div>
  );
}
