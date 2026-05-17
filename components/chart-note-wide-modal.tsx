"use client";

import {
  ChartNoteReader,
  type ChartLineItem,
  type ChartNoteMeta,
} from "@/components/chart-note-document";
import { ChartNoteRichEditor } from "@/components/chart-note-rich-editor";
import { cn } from "@/lib/utils";
import { Maximize2, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

const WIDE_MODAL_Z = "z-[400]";

export type ChartNoteWideViewModalProps = {
  open: boolean;
  onClose: () => void;
  value: string;
  meta?: ChartNoteMeta;
  title?: string;
  editable?: boolean;
  editOpen?: boolean;
  onEditOpenChange?: (open: boolean) => void;
  onChange?: (next: string) => void;
  onSave?: () => void;
  saving?: boolean;
  lineItems?: ChartLineItem[];
  lineItemView?: boolean;
  onLineItemViewChange?: (on: boolean) => void;
};

/** Full-width overlay for comfortable chart note reading (and optional editing). */
export function ChartNoteWideViewModal({
  open,
  onClose,
  value,
  meta,
  title = "Chart note",
  editable,
  editOpen = false,
  onEditOpenChange,
  onChange,
  onSave,
  saving,
  lineItems,
  lineItemView = false,
  onLineItemViewChange,
}: ChartNoteWideViewModalProps) {
  const hasLineItems = (lineItems?.length ?? 0) > 0;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const headerMeta = [meta?.dateLabel, meta?.provider, meta?.service].filter(Boolean).join(" · ");

  return createPortal(
    <div className={cn("fixed inset-0 flex items-center justify-center p-3 sm:p-5", WIDE_MODAL_Z)} role="presentation">
      <button
        type="button"
        aria-label="Close wide chart note view"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="chart-note-wide-title"
        className="relative flex max-h-[min(96dvh,920px)] w-full max-w-[min(96vw,1200px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0 pr-8">
            <h2 id="chart-note-wide-title" className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
              {title}
            </h2>
            {headerMeta ? <p className="mt-1 text-sm text-slate-600">{headerMeta}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasLineItems && onLineItemViewChange ? (
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
                <span>Line items</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={lineItemView}
                  onClick={() => onLineItemViewChange(!lineItemView)}
                  className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full transition",
                    lineItemView ? "bg-[#16a349]" : "bg-slate-300",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition",
                      lineItemView && "translate-x-5",
                    )}
                  />
                </button>
              </label>
            ) : null}
            {editable && onEditOpenChange ? (
              <button
                type="button"
                onClick={() => onEditOpenChange(!editOpen)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {editOpen ? "Hide editor" : "Edit note"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
          {lineItemView && hasLineItems ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Code</th>
                    <th className="px-4 py-2.5">Service</th>
                    <th className="px-4 py-2.5 text-right">Qty</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems!.map((line, idx) => (
                    <tr key={idx} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{line.billing_code || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-800">{line.service_name}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{line.quantity}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-slate-900">${line.line_total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ChartNoteReader text={value} meta={meta} comfortable className="border-0 shadow-none" />
          )}

          {editable && editOpen ? (
            <div className="mt-6 space-y-3 border-t border-slate-100 pt-6">
              <ChartNoteRichEditor value={value} onChange={(next) => onChange?.(next)} disabled={saving} />
              {onSave ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={onSave}
                  className="rounded-xl bg-[#16a349] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save chart note"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Toolbar button to open the wide chart note popup. */
export function ChartNoteOpenWideButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50",
        className,
      )}
    >
      <Maximize2 className="h-3.5 w-3.5" aria-hidden />
      Open wide view
    </button>
  );
}
