/** Shared cash amount parsing and validation for partial invoice payments. */

export function parseMoneyAmount(amount: string | undefined): number {
  const n = Number.parseFloat(amount ?? "0");
  return Number.isFinite(n) ? n : 0;
}

export function formatMoneyUsd(amount: string | number): string {
  const n = typeof amount === "number" ? amount : parseMoneyAmount(amount);
  return `$${n.toFixed(2)}`;
}

export type RecordCashAmountContext = {
  invoiceTotal: string;
  amountPaid?: string;
  amountDue: string;
  /** e.g. "No-show fee" or patient name for the dialog title */
  subtitle?: string;
};

export function validateCashPaymentAmount(
  raw: string,
  amountDue: string,
): { ok: true; amount: string } | { ok: false; error: string } {
  const due = parseMoneyAmount(amountDue);
  const cleaned = raw.replace(/[$,\s]/g, "");
  const amount = Number.parseFloat(cleaned);
  if (Number.isNaN(amount) || amount <= 0 || amount > due + 0.009) {
    return {
      ok: false,
      error: `Enter an amount between $0.01 and $${due.toFixed(2)}.`,
    };
  }
  return { ok: true, amount: amount.toFixed(2) };
}

/** @deprecated Use useRecordCashPayment modal instead */
export function promptCashPaymentAmount(params: RecordCashAmountContext): string | null {
  const due = parseMoneyAmount(params.amountDue);
  if (due <= 0.009) {
    return null;
  }

  let message = `Invoice total: $${parseMoneyAmount(params.invoiceTotal).toFixed(2)}`;
  const paid = parseMoneyAmount(params.amountPaid ?? "0");
  if (paid > 0.009) {
    message += `\nAlready recorded: $${paid.toFixed(2)}`;
  }
  message += `\nStill due: $${due.toFixed(2)}`;
  message += "\n\nEnter the cash amount the patient paid now:";

  const raw = window.prompt(message, due.toFixed(2));
  if (raw === null) {
    return null;
  }
  const result = validateCashPaymentAmount(raw, params.amountDue);
  return result.ok ? result.amount : "";
}

/** @deprecated Prefer validateCashPaymentAmount error message */
export function cashAmountPromptError(params: { amountDue: string }): string {
  const due = parseMoneyAmount(params.amountDue);
  return `Enter a valid cash amount between $0.01 and $${due.toFixed(2)}.`;
}
