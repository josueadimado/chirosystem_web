"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatMoneyUsd,
  parseMoneyAmount,
  type RecordCashAmountContext,
  validateCashPaymentAmount,
} from "@/lib/record-cash-prompt";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useId, useRef, useState } from "react";

type PendingRequest = {
  ctx: RecordCashAmountContext;
  resolve: (amount: string | null) => void;
};

/**
 * Opens a proper cash payment dialog (partial amounts supported).
 * Returns the amount string to post, or null if cancelled.
 */
export function useRecordCashPayment() {
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const requestCashAmount = useCallback((ctx: RecordCashAmountContext): Promise<string | null> => {
    return new Promise((resolve) => {
      const due = parseMoneyAmount(ctx.amountDue);
      if (due <= 0.009) {
        resolve(null);
        return;
      }
      setError(null);
      setAmountInput(due.toFixed(2));
      setPending({ ctx, resolve });
    });
  }, []);

  const close = useCallback((amount: string | null) => {
    setPending((prev) => {
      prev?.resolve(amount);
      return null;
    });
    setError(null);
  }, []);

  const dueNum = pending ? parseMoneyAmount(pending.ctx.amountDue) : 0;
  const totalNum = pending ? parseMoneyAmount(pending.ctx.invoiceTotal) : 0;
  const paidNum = pending ? parseMoneyAmount(pending.ctx.amountPaid ?? "0") : 0;

  const setPreset = (value: number) => {
    const clamped = Math.min(Math.max(0.01, value), dueNum);
    setAmountInput(clamped.toFixed(2));
    setError(null);
  };

  const submit = () => {
    if (!pending) return;
    const result = validateCashPaymentAmount(amountInput, pending.ctx.amountDue);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    close(result.amount);
  };

  const RecordCashPaymentModal = (
    <RecordCashPaymentDialog
      open={pending !== null}
      subtitle={pending?.ctx.subtitle}
      totalNum={totalNum}
      paidNum={paidNum}
      dueNum={dueNum}
      amountInput={amountInput}
      error={error}
      onAmountChange={(v) => {
        setAmountInput(v);
        setError(null);
      }}
      onPresetFull={() => setPreset(dueNum)}
      onPresetHalf={() => setPreset(Math.round((dueNum / 2) * 100) / 100)}
      onCancel={() => close(null)}
      onSubmit={submit}
    />
  );

  return { requestCashAmount, RecordCashPaymentModal };
}

function RecordCashPaymentDialog({
  open,
  subtitle,
  totalNum,
  paidNum,
  dueNum,
  amountInput,
  error,
  onAmountChange,
  onPresetFull,
  onPresetHalf,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  subtitle?: string;
  totalNum: number;
  paidNum: number;
  dueNum: number;
  amountInput: string;
  error: string | null;
  onAmountChange: (value: string) => void;
  onPresetFull: () => void;
  onPresetHalf: () => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Record cash payment</DialogTitle>
          <DialogDescription>
            {subtitle
              ? `${subtitle} — enter how much the patient paid in cash now. You can record part of the balance and collect the rest later.`
              : "Enter how much the patient paid in cash now. You can record part of the balance and collect the rest later."}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-sm">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Invoice total</dt>
            <dd className="font-semibold text-slate-900">{formatMoneyUsd(totalNum)}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Still due</dt>
            <dd className="font-semibold text-emerald-800">{formatMoneyUsd(dueNum)}</dd>
          </div>
          {paidNum > 0.009 ? (
            <div className="col-span-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Already recorded</dt>
              <dd className="font-medium text-slate-800">{formatMoneyUsd(paidNum)}</dd>
            </div>
          ) : null}
        </dl>

        <div className="space-y-2">
          <label htmlFor={inputId} className="text-sm font-medium text-slate-800">
            Cash amount received
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">
              $
            </span>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={amountInput}
              onChange={(e) => onAmountChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              className={cn(
                "w-full rounded-xl border bg-white py-2.5 pr-3 pl-7 text-sm font-semibold text-slate-900 shadow-sm outline-none transition",
                error
                  ? "border-red-300 ring-2 ring-red-100 focus:border-red-400"
                  : "border-slate-200 focus:border-[#16a349] focus:ring-2 focus:ring-[#16a349]/20",
              )}
              aria-invalid={error != null}
              aria-describedby={error ? `${inputId}-error` : undefined}
            />
          </div>
          {error ? (
            <p id={`${inputId}-error`} className="text-xs font-medium text-red-700" role="alert">
              {error}
            </p>
          ) : (
            <p className="text-xs text-slate-500">Maximum for this payment: {formatMoneyUsd(dueNum)}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPresetFull}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Full amount ({formatMoneyUsd(dueNum)})
          </button>
          {dueNum >= 0.02 ? (
            <button
              type="button"
              onClick={onPresetHalf}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Half ({formatMoneyUsd(Math.round((dueNum / 2) * 100) / 100)})
            </button>
          ) : null}
        </div>

        <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#16a349] text-white hover:bg-[#13823d]"
            onClick={onSubmit}
          >
            Record cash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
