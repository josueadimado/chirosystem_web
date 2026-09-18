"use client";

import {
  FORM_TYPE_OPTIONS,
  orderedIntakeAnswerRows,
  printIntakeSubmission,
  type IntakeSubmissionRow,
} from "@/lib/digital-intake";
import { ApiError, apiGetAuth, apiPost } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Eye, MessageSquare, Search, Send, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

const PAGE_SIZE = 30;

type Props = {
  /** "/admin" or "/doctor" */
  basePath: "/admin" | "/doctor";
};

function formTypeBadgeClass(formType: string): string {
  switch (formType) {
    case "massage":
      return "bg-blue-50 text-blue-700";
    case "pediatric":
      return "bg-purple-50 text-purple-700";
    case "adult_chiropractic":
      return "bg-green-50 text-green-700";
    default:
      return "bg-[#e6f4ea] text-[#5a7a62]";
  }
}

function intakeStatusBadgeClass(status: string): string {
  switch (status) {
    case "submitted":
      return "bg-[#f0fdf4] text-[#166534]";
    case "draft":
    case "in_progress":
      return "bg-[#fef3c7] text-[#92400e]";
    case "not_started":
      return "bg-[#f3f4f6] text-[#4b5563]";
    default:
      return "bg-[#e6f4ea] text-[#5a7a62]";
  }
}

function intakeStatusLabel(status: string): string {
  if (status === "draft") return "In Progress";
  if (status === "not_started") return "Not Started";
  if (status === "submitted") return "Submitted";
  return status.replaceAll("_", " ");
}

function shortFormLabel(label: string, formType: string): string {
  if (formType === "massage") return "Massage";
  if (formType === "pediatric") return "Pediatric";
  if (formType === "adult_chiropractic") return "Adult Chiropractic";
  return label;
}

type PatientSearchHit = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
};

function normalizePatientHits(data: unknown): PatientSearchHit[] {
  const raw = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { results?: unknown }).results)
      ? (data as { results: unknown[] }).results
      : [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const id = Number(r.id);
      if (!Number.isFinite(id) || id <= 0) return null;
      return {
        id,
        first_name: String(r.first_name || "").trim(),
        last_name: String(r.last_name || "").trim(),
        phone: String(r.phone || "").trim(),
      };
    })
    .filter((x): x is PatientSearchHit => x != null);
}

function patientHitLabel(p: PatientSearchHit): string {
  const name = `${p.first_name} ${p.last_name}`.trim() || `Patient #${p.id}`;
  return p.phone ? `${name} · ${p.phone}` : name;
}

export function StaffIntakeBrowser({ basePath }: Props) {
  const [q, setQ] = useState("");
  const [formType, setFormType] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [rows, setRows] = useState<IntakeSubmissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<IntakeSubmissionRow | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendPatientQuery, setSendPatientQuery] = useState("");
  const [sendPatientHits, setSendPatientHits] = useState<PatientSearchHit[]>([]);
  const [sendPatientLoading, setSendPatientLoading] = useState(false);
  const [sendSelectedPatient, setSendSelectedPatient] = useState<PatientSearchHit | null>(null);
  const [sendTypes, setSendTypes] = useState<string[]>([]);
  const [sendMsg, setSendMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [rowSmsBusyId, setRowSmsBusyId] = useState<number | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  /** When false, list every historical submission (can look duplicated). */
  const [latestOnly, setLatestOnly] = useState(true);

  const resetSendModal = useCallback(() => {
    setSendPatientQuery("");
    setSendPatientHits([]);
    setSendPatientLoading(false);
    setSendSelectedPatient(null);
    setSendTypes([]);
    setSendMsg("");
  }, []);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if ((!selected && !showSendModal) || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [selected, showSendModal]);

  useEffect(() => {
    if (!showSendModal) return;
    const query = sendPatientQuery.trim();
    if (query.length < 2) {
      setSendPatientHits([]);
      setSendPatientLoading(false);
      return;
    }
    let cancelled = false;
    setSendPatientLoading(true);
    const t = window.setTimeout(() => {
      void apiGetAuth<unknown>(`/patients/?search=${encodeURIComponent(query)}&page_size=20`)
        .then((data) => {
          if (!cancelled) setSendPatientHits(normalizePatientHits(data));
        })
        .catch(() => {
          if (!cancelled) setSendPatientHits([]);
        })
        .finally(() => {
          if (!cancelled) setSendPatientLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [showSendModal, sendPatientQuery]);

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
      params.set("latest_only", latestOnly ? "1" : "0");
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
  }, [basePath, formType, q, page, latestOnly]);

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

  const sendLink = async (patientId: number, formTypes?: string[]) => {
    const payload: Record<string, unknown> = {
      patient_id: patientId,
      send_sms: true,
    };
    if (formTypes?.length) payload.form_types = formTypes;
    return apiPost<{
      detail: string;
      url: string;
      sms_sent: boolean;
      sms_detail: string;
    }>(`${basePath}/intake_send_link/`, payload);
  };

  const submitSendModal = async () => {
    setSendMsg("");
    if (!sendSelectedPatient) {
      setSendMsg("Search and select a patient first.");
      return;
    }
    setSending(true);
    try {
      const res = await sendLink(sendSelectedPatient.id, sendTypes);
      setSendMsg(
        `${res.detail}` +
          (res.sms_sent ? " SMS sent." : res.sms_detail ? ` SMS: ${res.sms_detail}` : ""),
      );
    } catch (e) {
      setSendMsg(e instanceof ApiError ? e.message : "Could not send link.");
    } finally {
      setSending(false);
    }
  };

  const sendSmsForRow = async (row: IntakeSubmissionRow) => {
    setRowSmsBusyId(row.id);
    setError("");
    try {
      const res = await sendLink(row.patient_id, [String(row.form_type)]);
      if (!res.sms_sent && res.sms_detail) {
        setError(res.sms_detail);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send SMS.");
    } finally {
      setRowSmsBusyId(null);
    }
  };

  const answerRows = selected ? orderedIntakeAnswerRows(selected.answers) : [];

  const detailModal =
    selected && portalReady
      ? createPortal(
          <div
            className="fixed inset-0 z-[450] flex items-end justify-center bg-[#0d1f14]/50 p-0 sm:items-center sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="intake-detail-title"
            onClick={() => setSelected(null)}
          >
            <div
              className="flex max-h-[min(92dvh,900px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-xl border border-[#d1e8d8] bg-white shadow-2xl sm:rounded-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#d1e8d8] bg-[#f8fdf9] px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <h2 id="intake-detail-title" className="text-lg font-semibold text-[#0d1f14]">
                    {selected.form_label}
                  </h2>
                  <p className="mt-0.5 text-sm text-[#5a7a62]">
                    {selected.patient_name}
                    {selected.signature_name ? ` · Signed: ${selected.signature_name}` : ""}
                  </p>
                  {selected.submitted_at ? (
                    <p className="mt-0.5 text-xs text-[#5a7a62]">
                      Submitted {new Date(selected.submitted_at).toLocaleString()}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-[#d1e8d8] bg-white px-3 py-1.5 text-sm font-semibold text-[#0d1f14] hover:bg-[#f8fdf9]"
                    onClick={() => printIntakeSubmission(selected)}
                  >
                    Print
                  </button>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-[#5a7a62] hover:bg-white hover:text-[#0d1f14]"
                    onClick={() => setSelected(null)}
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                {answerRows.length === 0 ? (
                  <p className="text-sm text-[#5a7a62]">No answers recorded on this form.</p>
                ) : (
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#d1e8d8] text-[11px] uppercase tracking-wide text-[#5a7a62]">
                        <th className="w-[38%] py-2 pr-3 font-semibold sm:w-48">Question</th>
                        <th className="py-2 font-semibold">Answer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {answerRows.map((row) => (
                        <tr key={row.key} className="border-b border-[#d1e8d8]/70 align-top">
                          <td className="py-2.5 pr-3 text-xs font-semibold text-[#5a7a62] sm:text-sm">
                            {row.label}
                          </td>
                          <td className="py-2.5 whitespace-pre-wrap text-[#0d1f14]">{row.value}</td>
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

  const sendModal =
    showSendModal && portalReady
      ? createPortal(
          <div
            className="fixed inset-0 z-[450] flex items-center justify-center bg-[#0d1f14]/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-intake-title"
            onClick={() => {
              if (!sending) {
                setShowSendModal(false);
                resetSendModal();
              }
            }}
          >
            <div
              className="w-full max-w-md overflow-hidden rounded-xl border border-[#e8e8e8] bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-[#e8e8e8] bg-[#f5f5f5] px-6 py-5">
                <div>
                  <h2 id="send-intake-title" className="text-lg font-bold text-[#0d1f14]">
                    Send New Intake Link
                  </h2>
                  <p className="mt-0.5 text-xs text-[#949494]">
                    Search a patient by name or phone, then pick a form type.
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-[#949494] hover:bg-white hover:text-[#0d1f14]"
                  onClick={() => {
                    setShowSendModal(false);
                    resetSendModal();
                  }}
                  aria-label="Close"
                  disabled={sending}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-5 p-6">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#0d1f14]" htmlFor="send-intake-patient-search">
                    Search patient
                  </label>
                  {sendSelectedPatient ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-[#16a349]/40 bg-[#ecfdf5] px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#0d1f14]">
                          {patientHitLabel(sendSelectedPatient)}
                        </p>
                        <p className="text-xs text-[#949494]">ID #{sendSelectedPatient.id}</p>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 text-xs font-semibold text-[#16a349] hover:underline"
                        onClick={() => {
                          setSendSelectedPatient(null);
                          setSendPatientQuery("");
                          setSendPatientHits([]);
                        }}
                        disabled={sending}
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search
                          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#949494]"
                          aria-hidden
                        />
                        <input
                          id="send-intake-patient-search"
                          className="w-full rounded-lg border border-[#e8e8e8] bg-[#f8f8f7] py-2.5 pl-9 pr-3 text-sm text-[#0d1f14] placeholder:text-[#949494] focus:border-[#16a349]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
                          value={sendPatientQuery}
                          onChange={(e) => setSendPatientQuery(e.target.value)}
                          placeholder="Enter name or phone…"
                          autoComplete="off"
                          autoFocus
                        />
                      </div>
                      {sendPatientQuery.trim().length >= 2 ? (
                        <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-[#e8e8e8] bg-[#f5f5f5] p-1.5">
                          {sendPatientLoading ? (
                            <p className="px-3 py-2 text-sm text-[#949494]">Searching…</p>
                          ) : sendPatientHits.length === 0 ? (
                            <p className="px-3 py-2 text-sm text-[#949494]">No patients found.</p>
                          ) : (
                            sendPatientHits.map((hit) => (
                              <button
                                key={hit.id}
                                type="button"
                                className="flex w-full flex-col rounded-md px-3 py-2 text-left hover:bg-white"
                                onClick={() => {
                                  setSendSelectedPatient(hit);
                                  setSendPatientHits([]);
                                  setSendPatientQuery("");
                                }}
                              >
                                <span className="text-sm font-medium text-[#0d1f14]">
                                  {`${hit.first_name} ${hit.last_name}`.trim() || `Patient #${hit.id}`}
                                </span>
                                <span className="text-xs text-[#949494]">
                                  {hit.phone || "No phone"} · ID #{hit.id}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      ) : (
                        <p className="mt-1.5 text-xs text-[#949494]">Type at least 2 characters to search.</p>
                      )}
                    </>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-[#0d1f14]">Form type</p>
                  <div className="flex flex-col gap-2">
                    {FORM_TYPE_OPTIONS.map((opt) => {
                      const on = sendTypes.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            setSendTypes((prev) =>
                              on ? prev.filter((x) => x !== opt.value) : [...prev, opt.value],
                            )
                          }
                          className={cn(
                            "flex items-start gap-3 rounded-lg border-2 p-3 text-left transition",
                            on
                              ? "border-[#16a349] bg-[#ecfdf5]"
                              : "border-[#e8e8e8] bg-white hover:border-[#16a349]/50",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                              on ? "border-[#16a349] bg-[#16a349]" : "border-[#e8e8e8]",
                            )}
                            aria-hidden
                          >
                            {on ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-[#0d1f14]">{opt.label}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {sendMsg ? <p className="break-all text-sm text-[#0d1f14]">{sendMsg}</p> : null}
              </div>

              <div className="flex gap-3 border-t border-[#e8e8e8] p-6">
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => {
                    setShowSendModal(false);
                    resetSendModal();
                  }}
                  className="flex-1 rounded-lg border border-[#e8e8e8] bg-[#f5f5f5] py-2.5 text-sm font-medium text-[#0d1f14] hover:bg-white disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={sending || !sendSelectedPatient}
                  onClick={() => void submitSendModal()}
                  className="flex-1 rounded-lg bg-[#16a349] py-2.5 text-sm font-semibold text-white hover:bg-[#13823d] disabled:opacity-60"
                >
                  {sending ? "Sending…" : "Send Link"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight text-[#0d1f14]">Patient Intake Submissions</h2>
        <button
          type="button"
          onClick={() => {
            resetSendModal();
            setShowSendModal(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#13823d]"
        >
          <Send className="h-3.5 w-3.5" />
          Send New Intake Link
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
      ) : null}

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#e8e8e8] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8e8e8] px-5 py-4">
          <p className="text-base font-semibold text-[#0d1f14]">Submissions</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[14rem] flex-1 sm:flex-none sm:w-64">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#949494]"
                aria-hidden
              />
              <input
                className="w-full rounded-lg border border-[#e8e8e8] bg-[#f8f8f7] py-2 pl-9 pr-3 text-xs text-[#0d1f14] placeholder:text-[#949494] focus:border-[#16a349]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
                placeholder="Search patient name, phone…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void load();
                }}
                aria-label="Search intake forms"
              />
            </div>
            <select
              className="rounded-lg border border-[#e8e8e8] bg-white px-3 py-2 text-xs font-medium text-[#949494] focus:border-[#16a349]/40 focus:text-[#0d1f14] focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
              value={formType}
              onChange={(e) => {
                setFormType(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by form type"
            >
              <option value="">All form types</option>
              {FORM_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {shortFormLabel(opt.label, opt.value)}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-[#e8e8e8] bg-white px-3 py-2 text-xs font-medium text-[#949494] focus:border-[#16a349]/40 focus:text-[#0d1f14] focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
              value={latestOnly ? "latest" : "all"}
              onChange={(e) => {
                setLatestOnly(e.target.value === "latest");
                setPage(1);
              }}
              aria-label="Submission history"
            >
              <option value="latest">Latest only</option>
              <option value="all">All history</option>
            </select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead className="sticky top-0 z-[1] border-b border-[#e8e8e8] bg-[#f5f5f5]">
              <tr className="text-xs font-semibold text-[#949494]">
                <th className="px-5 py-2.5 font-semibold">Patient</th>
                <th className="w-40 px-4 py-2.5 font-semibold">Form type</th>
                <th className="w-36 px-4 py-2.5 font-semibold">Date sent</th>
                <th className="w-32 px-4 py-2.5 font-semibold">Status</th>
                <th className="w-52 px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-[#949494]">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-[#949494]">
                    No submitted forms yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const busy = rowSmsBusyId === row.id;
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-[#e8e8e8] last:border-b-0 hover:bg-[#f8f8f7]"
                    >
                      <td className="px-5 py-3.5 align-middle">
                        <p className="truncate text-sm font-semibold text-[#0d1f14]">{row.patient_name}</p>
                        <p className="truncate text-xs text-[#949494]">
                          {row.patient_phone || "—"}
                          {row.patient_email ? ` · ${row.patient_email}` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <span
                          className={cn(
                            "inline-flex items-center rounded px-2.5 py-1 text-xs font-medium",
                            formTypeBadgeClass(String(row.form_type)),
                          )}
                        >
                          {shortFormLabel(row.form_label, String(row.form_type))}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 align-middle text-sm text-[#949494]">
                        {row.submitted_at
                          ? new Date(row.submitted_at).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <span
                          className={cn(
                            "inline-flex items-center rounded px-2.5 py-1 text-xs font-medium capitalize",
                            intakeStatusBadgeClass(row.status),
                          )}
                        >
                          {intakeStatusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void sendSmsForRow(row)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e8] bg-white px-3 py-2 text-xs font-medium text-[#949494] hover:text-[#0d1f14] disabled:opacity-50"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            {busy ? "Sending…" : "Send SMS"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void openDetail(row.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#16a349] bg-[#dbe7fb]/40 px-3 py-2 text-xs font-medium text-[#16a349] hover:bg-[#ecfdf5]"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-2 border-t border-[#e8e8e8] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[#949494]">
            {totalCount === 0 ? (
              "0 forms"
            ) : (
              <>
                <span className="tabular-nums text-[#0d1f14]">
                  {rangeStart}–{rangeEnd}
                </span>{" "}
                of <span className="tabular-nums text-[#0d1f14]">{totalCount}</span>
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-[#e8e8e8] bg-white px-3 py-1.5 text-xs font-semibold text-[#0d1f14] hover:bg-[#f5f5f5] disabled:opacity-40"
              aria-label="Previous page"
            >
              Previous
            </button>
            <span className="text-xs text-[#949494]">
              <span className="font-semibold tabular-nums text-[#0d1f14]">{page}</span> /{" "}
              <span className="tabular-nums">{totalPages}</span>
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-[#e8e8e8] bg-white px-3 py-1.5 text-xs font-semibold text-[#0d1f14] hover:bg-[#f5f5f5] disabled:opacity-40"
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {detailModal}
      {sendModal}
    </div>
  );
}
