"use client";

import {
  cms1500ContentSignature,
  getCms1500DocumentHtml,
  type Cms1500ClaimPayload,
} from "@/lib/cms1500-print";
import { ApiError, apiPost } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  claim: Cms1500ClaimPayload | null;
  onClose: () => void;
  /** "/admin" or "/doctor" — used for email endpoint */
  basePath: "/admin" | "/doctor";
};

export function Cms1500PortalModal({ claim, onClose, basePath }: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailing, setEmailing] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!claim) return;
    setEmailTo((claim.payer_email || "").trim());
    setEmailMsg("");
  }, [claim?.invoice_id, claim?.payer_email]);

  useEffect(() => {
    if (typeof document === "undefined" || !claim) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [claim]);

  const triggerPrint = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.focus();
      iframeRef.current?.contentWindow?.print();
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    if (!claim) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [claim, onClose]);

  const sendEmail = async () => {
    if (!claim) return;
    setEmailing(true);
    setEmailMsg("");
    try {
      const res = await apiPost<{ detail: string; recipient: string }>(
        `${basePath}/email-insurance-claim/`,
        { invoice_id: claim.invoice_id, to_email: emailTo.trim() },
      );
      setEmailMsg(res.detail || `Sent to ${res.recipient}`);
    } catch (e) {
      setEmailMsg(e instanceof ApiError ? e.message : "Could not send email.");
    } finally {
      setEmailing(false);
    }
  };

  if (claim == null || !portalReady) return null;

  const docHtml = getCms1500DocumentHtml(claim);
  const modalKey = `${claim.invoice_id}-${cms1500ContentSignature(claim)}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex flex-col bg-slate-950/60 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cms1500-modal-title"
    >
      <div className="flex shrink-0 flex-col gap-4 border-b border-slate-200/90 bg-white px-5 py-4 shadow-sm sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 id="cms1500-modal-title" className="truncate text-base font-bold text-slate-900 sm:text-lg">
              Insurance claim (CMS-1500)
            </h2>
            <p className="mt-1 truncate text-xs text-slate-500">
              {claim.patient_name} · Invoice {claim.invoice_number}
              {claim.payer_name ? ` · ${claim.payer_name}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              onClick={triggerPrint}
              className="rounded-xl bg-[#0d5c2e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4a25]"
            >
              Print
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <input
            type="email"
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
            placeholder="Insurance company email"
            className="w-full flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
          />
          <button
            type="button"
            disabled={emailing || !emailTo.trim()}
            onClick={() => void sendEmail()}
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-[#0d5c2e] hover:bg-emerald-100 disabled:opacity-50"
          >
            {emailing ? "Sending…" : "Email claim PDF"}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Emails include the full CMS-1500 as a PDF attachment (same fields as this print preview), plus a short cover note.
        </p>
        {emailMsg ? <p className="text-xs text-slate-600">{emailMsg}</p> : null}
      </div>
      <div className="min-h-0 flex-1 bg-slate-200/80 p-3 sm:p-5">
        <iframe
          key={modalKey}
          ref={iframeRef}
          title="CMS-1500 claim preview"
          className="h-full min-h-[70vh] w-full rounded-lg border border-slate-300 bg-white shadow"
          srcDoc={docHtml}
        />
      </div>
    </div>,
    document.body,
  );
}
