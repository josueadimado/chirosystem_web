"use client";

import {
  FORM_TYPE_OPTIONS,
  orderedIntakeAnswerRows,
  printIntakeSubmission,
  type IntakeSubmissionRow,
} from "@/lib/digital-intake";
import { ApiError, apiGetAuth, apiPost } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

const PAGE_SIZE = 30;

type Props = {
  /** "/admin" or "/doctor" */
  basePath: "/admin" | "/doctor";
};

export function StaffIntakeBrowser({ basePath }: Props) {
  const [q, setQ] = useState("");
  const [formType, setFormType] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [rows, setRows] = useState<IntakeSubmissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<IntakeSubmissionRow | null>(null);
  const [sendPatientId, setSendPatientId] = useState("");
  const [sendTypes, setSendTypes] = useState<string[]>([]);
  const [sendMsg, setSendMsg] = useState("");
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
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (formType) params.set("form_type", formType);
      params.set("status", "submitted");
      params.set("page", String(page));
      params.set("page_size", String(PAGE_SIZE));
      const data = await apiGetAuth<{
        results: IntakeSubmissionRow[];
        count?: number;
        page?: number;
        page_size?: number;
      }>(`${basePath}/intake_forms/?${params.toString()}`);
      setRows(data.results || []);
      setTotalCount(typeof data.count === "number" ? data.count : (data.results || []).length);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load forms.");
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [basePath, formType, q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalCount);

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
      setSendMsg("Enter a valid patient ID.");
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

  const answerRows = selected ? orderedIntakeAnswerRows(selected.answers) : [];

  const detailModal =
    selected && portalReady
      ? createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="intake-detail-title"
            onClick={() => setSelected(null)}
          >
            <div
              className={cn(
                "flex max-h-[min(92dvh,900px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <h2 id="intake-detail-title" className="text-lg font-semibold text-slate-900">
                    {selected.form_label}
                  </h2>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {selected.patient_name}
                    {selected.signature_name ? ` · Signed: ${selected.signature_name}` : ""}
                  </p>
                  {selected.submitted_at ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      Submitted {new Date(selected.submitted_at).toLocaleString()}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
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

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                {answerRows.length === 0 ? (
                  <p className="text-sm text-slate-500">No answers recorded on this form.</p>
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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Intake forms</h1>
        <p className="mt-1 text-sm text-slate-600">
          Search submitted paperwork ({PAGE_SIZE} per page), open answers in a clear table, print a form, or text a
          patient their intake link.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900">Send intake link</h2>
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
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
          />
          <select
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            value={formType}
            onChange={(e) => {
              setFormType(e.target.value);
              setPage(1);
            }}
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
            onClick={() => {
              if (page !== 1) setPage(1);
              else void load();
            }}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Search
          </button>
        </div>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Patient</th>
                <th className="px-4 py-3 font-semibold">Phone</th>
                <th className="hidden px-4 py-3 font-semibold md:table-cell">Email</th>
                <th className="px-4 py-3 font-semibold">Form</th>
                <th className="px-4 py-3 font-semibold">Submitted</th>
                <th className="px-4 py-3 font-semibold text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No submitted forms yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50 hover:bg-emerald-50/40">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.patient_name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{row.patient_phone || "—"}</td>
                    <td className="hidden max-w-[14rem] truncate px-4 py-3 text-slate-600 md:table-cell">
                      {row.patient_email || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.form_label}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {row.submitted_at ? new Date(row.submitted_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => void openDetail(row.id)}
                          className="text-sm font-semibold text-[#0d5c2e] hover:underline"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void (async () => {
                              try {
                                const full = await apiGetAuth<IntakeSubmissionRow>(
                                  `${basePath}/intake_form_detail/?id=${row.id}`,
                                );
                                printIntakeSubmission(full);
                              } catch (e) {
                                setError(e instanceof ApiError ? e.message : "Could not print form.");
                              }
                            })();
                          }}
                          className="text-sm font-semibold text-slate-600 hover:underline"
                        >
                          Print
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            {totalCount === 0 ? (
              "No forms"
            ) : (
              <>
                Showing{" "}
                <span className="font-semibold tabular-nums text-slate-800">
                  {rangeStart}–{rangeEnd}
                </span>{" "}
                of <span className="font-semibold tabular-nums text-slate-800">{totalCount}</span>
                <span className="text-slate-400"> · {PAGE_SIZE} per page</span>
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">
              Page <span className="font-semibold tabular-nums text-slate-800">{page}</span> of{" "}
              <span className="font-semibold tabular-nums text-slate-800">{totalPages}</span>
            </span>
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
              aria-label="Previous page"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {detailModal}
    </div>
  );
}
