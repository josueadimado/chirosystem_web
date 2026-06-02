"use client";

import { getPatientBillDocumentHtml, patientBillContentSignature, type PatientBillPayload } from "@/lib/patient-bill-print";
import { PatientNameWithProfile } from "@/components/patient-payment-profile";
import { formatPatientBillEmailSentButtonLabel } from "@/lib/patient-bill-email";
import { CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type PatientBillPortalModalProps = {
  bill: PatientBillPayload | null;
  onClose: () => void;
  /** When set and bill is paid (not preview), shows Email bill button. */
  onEmailBill?: () => void | Promise<void>;
  emailingBill?: boolean;
  /** Set after a successful send — shows a green confirmation bar and updates the button. */
  emailSentTo?: string | null;
};

/**
 * Full-screen overlay + scrollable bill preview in an iframe (portal → document.body).
 * Print runs only when the user taps Print (not automatically after payment).
 */
export function PatientBillPortalModal({
  bill,
  onClose,
  onEmailBill,
  emailingBill,
  emailSentTo,
}: PatientBillPortalModalProps) {
  const [portalReady, setPortalReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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

  const triggerPrint = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.focus();
      iframeRef.current?.contentWindow?.print();
    } catch {
      /* non-fatal */
    }
  }, []);

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
            {bill.patient_name ? (
              <>
                {" · "}
                <PatientNameWithProfile
                  name={bill.patient_name}
                  profile={bill.patient_payment_profile}
                  compactBadge
                />
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {bill.is_preview && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-900">
              Preview
            </span>
          )}
          {!bill.is_preview && bill.status === "paid" && onEmailBill ? (
            <button
              type="button"
              disabled={emailingBill || !!emailSentTo}
              onClick={() => void onEmailBill()}
              title={emailSentTo ? `Bill emailed to ${emailSentTo}` : undefined}
              className={
                emailSentTo
                  ? "rounded-xl border border-emerald-400 bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-sm"
                  : "rounded-xl border border-[#0f766e]/40 bg-white px-4 py-2 text-sm font-semibold text-[#0d5c2e] shadow-sm hover:bg-emerald-50 disabled:opacity-50"
              }
            >
              {emailingBill
                ? "Sending…"
                : emailSentTo
                  ? formatPatientBillEmailSentButtonLabel(emailSentTo)
                  : "Email bill"}
            </button>
          ) : null}
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
      {emailSentTo ? (
        <div
          className="flex shrink-0 items-start gap-2.5 border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 sm:px-5"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
          <p className="min-w-0 leading-snug">
            <span className="font-bold">Email sent.</span> The patient bill was delivered to{" "}
            <span className="font-semibold break-all">{emailSentTo}</span>. You can email again from billing if needed
            after closing this preview.
          </p>
        </div>
      ) : null}
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
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
