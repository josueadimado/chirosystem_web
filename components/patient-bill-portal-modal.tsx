"use client";

import { getPatientBillDocumentHtml, patientBillContentSignature, type PatientBillPayload } from "@/lib/patient-bill-print";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type PatientBillPortalModalProps = {
  bill: PatientBillPayload | null;
  onClose: () => void;
};

/**
 * Full-screen overlay + scrollable bill preview in an iframe (portal → document.body).
 * Official (non-preview) bills trigger the print dialog once after the iframe loads.
 */
export function PatientBillPortalModal({ bill, onClose }: PatientBillPortalModalProps) {
  const [portalReady, setPortalReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const autoPrintDoneRef = useRef(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined" || !bill) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [bill]);

  useEffect(() => {
    autoPrintDoneRef.current = false;
  }, [bill]);

  const triggerPrint = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.focus();
      iframeRef.current?.contentWindow?.print();
    } catch {
      /* non-fatal */
    }
  }, []);

  const onIframeLoad = useCallback(() => {
    if (!bill || bill.is_preview) return;
    if (autoPrintDoneRef.current) return;
    autoPrintDoneRef.current = true;
    window.setTimeout(() => triggerPrint(), 150);
  }, [bill, triggerPrint]);

  useEffect(() => {
    if (!bill) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bill, onClose]);

  if (bill == null || !portalReady) return null;

  const docHtml = getPatientBillDocumentHtml(bill);
  const modalKey = `${bill.invoice_number}-${bill.status ?? ""}-${bill.is_preview ? "p" : "f"}-${patientBillContentSignature(bill)}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex flex-col bg-slate-950/60 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="patient-bill-modal-title"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/90 bg-white px-4 py-3 shadow-sm sm:px-5">
        <div className="min-w-0">
          <h2 id="patient-bill-modal-title" className="truncate text-base font-bold text-slate-900 sm:text-lg">
            {bill.bill_title || "Patient Bill"}
          </h2>
          <p className="truncate text-xs text-slate-500 sm:text-sm">
            {bill.invoice_number}
            {bill.patient_name ? ` · ${bill.patient_name}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {bill.is_preview && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-900">
              Preview
            </span>
          )}
          <button
            type="button"
            onClick={triggerPrint}
            className="rounded-xl bg-[#16a349] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d]"
          >
            Print
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
      <div
        className="min-h-0 flex-1 overflow-hidden bg-slate-100 p-2 sm:p-4"
        onClick={onClose}
        role="presentation"
      >
        <div className="h-full min-h-[50dvh] w-full" onClick={(e) => e.stopPropagation()}>
          <iframe
            key={modalKey}
            ref={iframeRef}
            title="Patient bill"
            className="h-full min-h-[50dvh] w-full rounded-lg border border-slate-200 bg-white shadow-inner"
            srcDoc={docHtml}
            onLoad={onIframeLoad}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
