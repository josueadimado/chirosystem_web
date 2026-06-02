"use client";

import { useAppFeedback } from "@/components/app-feedback";
import {
  formatPatientBillEmailSentMessage,
  type EmailPatientBillResult,
} from "@/lib/patient-bill-email";
import { useCallback, useState } from "react";

export type PatientBillEmailSent = {
  invoiceId: number;
  recipient: string;
};

/**
 * Shared send flow for admin/doctor bill email — loading state, toast, and per-invoice “sent” record.
 */
export function usePatientBillEmail(sendBill: (invoiceId: number) => Promise<EmailPatientBillResult>) {
  const { runWithFeedback } = useAppFeedback();
  const [sendingInvoiceId, setSendingInvoiceId] = useState<number | null>(null);
  const [lastSent, setLastSent] = useState<PatientBillEmailSent | null>(null);

  const clearSent = useCallback(() => setLastSent(null), []);

  const send = useCallback(
    async (invoiceId: number, opts?: { quietToast?: boolean }) => {
      setSendingInvoiceId(invoiceId);
      try {
        const out = await runWithFeedback(() => sendBill(invoiceId), {
          loadingMessage: "Sending patient bill by email…",
          successMessage: opts?.quietToast ? "" : (result) => formatPatientBillEmailSentMessage(result.recipient),
          errorFallback: "Could not email patient bill. Check that the patient has an email on file.",
        });
        if (!out) return undefined;
        setLastSent({ invoiceId, recipient: out.recipient });
        return out;
      } finally {
        setSendingInvoiceId(null);
      }
    },
    [runWithFeedback, sendBill],
  );

  const isSending = (invoiceId: number) => sendingInvoiceId === invoiceId;
  const sentFor = (invoiceId: number) =>
    lastSent?.invoiceId === invoiceId ? lastSent.recipient : null;

  return {
    send,
    clearSent,
    lastSent,
    sendingInvoiceId,
    isSending,
    sentFor,
  };
}
