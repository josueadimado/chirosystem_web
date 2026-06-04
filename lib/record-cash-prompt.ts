function parseMoneyAmount(amount: string | undefined): number {
  const n = Number.parseFloat(amount ?? "0");
  return Number.isFinite(n) ? n : 0;
}

/** Ask staff how much cash the patient paid (supports partial payments). Returns amount string or null if cancelled. */
export function promptCashPaymentAmount(params: {
  invoiceTotal: string;
  amountPaid?: string;
  amountDue: string;
}): string | null {
  const total = parseMoneyAmount(params.invoiceTotal);
  const paid = parseMoneyAmount(params.amountPaid ?? "0");
  const due = parseMoneyAmount(params.amountDue);
  if (due <= 0.009) {
    return null;
  }

  let message = `Invoice total: $${total.toFixed(2)}`;
  if (paid > 0.009) {
    message += `\nAlready recorded: $${paid.toFixed(2)}`;
  }
  message += `\nStill due: $${due.toFixed(2)}`;
  message += "\n\nEnter the cash amount the patient paid now:";

  const raw = window.prompt(message, due.toFixed(2));
  if (raw === null) {
    return null;
  }
  const cleaned = raw.replace(/[$,\s]/g, "");
  const amount = Number.parseFloat(cleaned);
  if (Number.isNaN(amount) || amount <= 0 || amount > due + 0.009) {
    return "";
  }
  return amount.toFixed(2);
}

export function cashAmountPromptError(params: { amountDue: string }): string {
  const due = parseMoneyAmount(params.amountDue);
  return `Enter a valid cash amount between $0.01 and $${due.toFixed(2)}.`;
}
