"use client";

import { ChartNoteRichEditor } from "@/components/chart-note-rich-editor";
import { ChartNoteOpenWideButton, ChartNoteWideViewModal } from "@/components/chart-note-wide-modal";
import { parseInlineParts, stripInlineMarkers } from "@/lib/chart-note-inline-format";
import { cn } from "@/lib/utils";
import { Fragment, useMemo, useState } from "react";

export type ChartNoteMeta = {
  dateLabel?: string;
  provider?: string;
  service?: string;
};

type ChartBodyBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "date-entry"; label: string; text: string }
  | { kind: "subheading"; text: string };

type ChartSection = {
  title: string;
  blocks: ChartBodyBlock[];
};

const SOAP_SECTION_RE = /^(Subjective|Objective|Assessment|Plan)(\s*\([^)]*\))?\s*:?\s*$/i;

function FormattedInlineText({ text }: { text: string }) {
  const parts = useMemo(() => parseInlineParts(text), [text]);
  return (
    <>
      {parts.map((p, i) => {
        const key = `inline-${i}`;
        if (p.type === "bold") {
          return (
            <strong key={key} className="font-bold text-slate-900">
              {p.value}
            </strong>
          );
        }
        if (p.type === "italic") {
          return (
            <em key={key} className="italic text-slate-800">
              {p.value}
            </em>
          );
        }
        if (p.type === "underline") {
          return (
            <u key={key} className="underline decoration-slate-600 underline-offset-2">
              {p.value}
            </u>
          );
        }
        return <Fragment key={key}>{p.value}</Fragment>;
      })}
    </>
  );
}

function parseSectionBody(body: string): ChartBodyBlock[] {
  const blocks: ChartBodyBlock[] = [];
  const lines = body.split("\n");
  let paraBuf: string[] = [];

  const flushPara = () => {
    const t = paraBuf.join("\n").trim();
    if (t) blocks.push({ kind: "paragraph", text: t });
    paraBuf = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
      continue;
    }
    const plain = stripInlineMarkers(trimmed);
    const dateM = plain.match(/^(\d{1,2}-\d{1,2}-\d{2,4}):\s*(.*)$/) ?? trimmed.match(/^(\d{1,2}-\d{1,2}-\d{2,4}):\s*(.*)$/);
    if (dateM) {
      flushPara();
      blocks.push({ kind: "date-entry", label: dateM[1], text: dateM[2] || "" });
      continue;
    }
    if (
      /^[A-Z][A-Za-z0-9\s/\-–—]+:?\s*$/.test(plain) &&
      plain.length < 80 &&
      !plain.includes(".") &&
      plain.split(/\s+/).length <= 8
    ) {
      flushPara();
      blocks.push({ kind: "subheading", text: plain.replace(/:$/, "") });
      continue;
    }
    paraBuf.push(line);
  }
  flushPara();
  return blocks;
}

function formatSectionTitle(raw: string, suffix: string): string {
  const base = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  return `${base}${suffix || ""}`;
}

export function parseChartNoteDocument(text: string): { preamble: string; sections: ChartSection[] } {
  const trimmed = (text || "").trim();
  if (!trimmed) return { preamble: "", sections: [] };

  const parts = trimmed.split(/(?=^(?:\*\*)?\s*(?:Subjective|Objective|Assessment|Plan)\b)/im);
  let preamble = "";
  const sections: ChartSection[] = [];

  for (const part of parts) {
    const lines = part.split("\n");
    const first = (lines[0] || "").trim();
    const firstPlain = stripInlineMarkers(first);
    if (SOAP_SECTION_RE.test(firstPlain)) {
      const titleMatch = firstPlain.match(/^(Subjective|Objective|Assessment|Plan)(\s*\([^)]*\))?\s*:?\s*$/i);
      const title = titleMatch
        ? formatSectionTitle(titleMatch[1], titleMatch[2] || "")
        : first.replace(/:$/, "");
      const body = lines.slice(1).join("\n").trim();
      sections.push({ title, blocks: parseSectionBody(body) });
    } else if (part.trim()) {
      preamble = preamble ? `${preamble}\n\n${part.trim()}` : part.trim();
    }
  }

  if (sections.length === 0) {
    sections.push({ title: "Chart note", blocks: parseSectionBody(trimmed) });
    preamble = "";
  }

  return { preamble, sections };
}

function ChartBodyBlocks({ blocks, comfortable }: { blocks: ChartBodyBlock[]; comfortable?: boolean }) {
  if (blocks.length === 0) return null;
  const paraClass = comfortable ? "text-[16px] leading-8 text-slate-800" : "text-[15px] leading-7 text-slate-800";
  const subClass = comfortable ? "text-[16px] font-bold text-slate-900" : "text-[15px] font-bold text-slate-900";
  const dateLabelClass = comfortable ? "text-base font-bold text-slate-900" : "text-sm font-bold text-slate-900";
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => {
        if (b.kind === "date-entry") {
          return (
            <div key={`d-${i}`} className="border-l-2 border-slate-200 pl-4">
              <p className={dateLabelClass}>{b.label}</p>
              {b.text ? (
                <p className={cn("mt-1", paraClass)}>
                  <FormattedInlineText text={b.text} />
                </p>
              ) : null}
            </div>
          );
        }
        if (b.kind === "subheading") {
          return (
            <p key={`s-${i}`} className={subClass}>
              <FormattedInlineText text={b.text} />
            </p>
          );
        }
        return (
          <p key={`p-${i}`} className={cn("whitespace-pre-wrap", paraClass)}>
            <FormattedInlineText text={b.text} />
          </p>
        );
      })}
    </div>
  );
}

/** Read-only chart note with an “Open wide view” button. */
export function ChartNoteReaderPanel({
  text,
  meta,
  title = "Chart note",
  emptyLabel,
  className,
}: {
  text: string;
  meta?: ChartNoteMeta;
  title?: string;
  emptyLabel?: string;
  className?: string;
}) {
  const [wideOpen, setWideOpen] = useState(false);
  const hasNote = Boolean((text || "").trim());

  return (
    <>
      {hasNote ? (
        <div className="mb-2 flex justify-end">
          <ChartNoteOpenWideButton onClick={() => setWideOpen(true)} />
        </div>
      ) : null}
      <ChartNoteReader text={text} meta={meta} emptyLabel={emptyLabel} className={className} />
      <ChartNoteWideViewModal
        open={wideOpen}
        onClose={() => setWideOpen(false)}
        value={text}
        meta={meta}
        title={title}
      />
    </>
  );
}

export function ChartNoteReader({
  text,
  meta,
  className,
  comfortable,
  emptyLabel = "No chart note on file for this visit.",
}: {
  text: string;
  meta?: ChartNoteMeta;
  className?: string;
  comfortable?: boolean;
  emptyLabel?: string;
}) {
  const parsed = useMemo(() => parseChartNoteDocument(text), [text]);
  const headerLine = useMemo(() => {
    const bits: string[] = [];
    if (meta?.dateLabel) bits.push(meta.dateLabel);
    if (meta?.provider) bits.push(`by ${meta.provider}`);
    return bits.length ? bits.join(" ") : null;
  }, [meta]);

  if (!(text || "").trim()) {
    return <p className="text-sm italic text-slate-500">{emptyLabel}</p>;
  }

  return (
    <article
      className={cn(
        "rounded-xl border border-slate-200/90 bg-white px-5 py-5 shadow-sm sm:px-6 sm:py-6",
        className,
      )}
    >
      {headerLine ? (
        <p
          className={cn(
            "border-b border-slate-100 pb-4 font-medium leading-relaxed text-slate-600",
            comfortable ? "text-base" : "text-sm",
          )}
        >
          {headerLine}
        </p>
      ) : null}

      {parsed.preamble ? (
        <p
          className={cn(
            "whitespace-pre-wrap text-slate-800",
            comfortable ? "text-[16px] leading-8" : "text-[15px] leading-7",
            headerLine ? "mt-4" : "",
          )}
        >
          <FormattedInlineText text={parsed.preamble} />
        </p>
      ) : null}

      <div className={cn(parsed.preamble || headerLine ? "mt-6 space-y-8" : "space-y-8")}>
        {parsed.sections.map((sec) => (
          <section key={sec.title}>
            <h3
              className={cn(
                "font-bold tracking-tight text-slate-900",
                comfortable ? "text-xl" : "text-lg",
              )}
            >
              {sec.title}
            </h3>
            <div className="mt-3">
              <ChartBodyBlocks blocks={sec.blocks} comfortable={comfortable} />
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

export type ChartLineItem = {
  service_name: string;
  billing_code: string;
  quantity: number;
  line_total: string;
  charges_patient?: boolean;
};

export function ChartNoteWorkspace({
  value,
  onChange,
  editable,
  onSave,
  saving,
  meta,
  lineItems,
  inputClassName,
  defaultEditOpen,
}: {
  value: string;
  onChange?: (next: string) => void;
  editable: boolean;
  onSave?: () => void;
  saving?: boolean;
  meta?: ChartNoteMeta;
  lineItems?: ChartLineItem[];
  inputClassName?: string;
  defaultEditOpen?: boolean;
}) {
  const [lineItemView, setLineItemView] = useState(false);
  const [editOpen, setEditOpen] = useState(defaultEditOpen ?? false);
  const [wideOpen, setWideOpen] = useState(false);
  const hasLineItems = (lineItems?.length ?? 0) > 0;
  const hasNote = Boolean((value || "").trim());

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Chart note for the team (handoff)
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {hasNote || editable ? <ChartNoteOpenWideButton onClick={() => setWideOpen(true)} /> : null}
          {hasLineItems ? (
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
              <span>Line item view</span>
              <button
                type="button"
                role="switch"
                aria-checked={lineItemView}
                onClick={() => setLineItemView((v) => !v)}
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
          {editable ? (
            <button
              type="button"
              onClick={() => setEditOpen((o) => !o)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {editOpen ? "Hide editor" : "Edit note"}
            </button>
          ) : null}
        </div>
      </div>

      {lineItemView && hasLineItems ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[320px] text-left text-sm">
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
        <div className="max-h-[min(70vh,720px)] overflow-y-auto rounded-xl ring-1 ring-slate-100">
          <ChartNoteReader text={value} meta={meta} className="border-0 shadow-none ring-0" />
        </div>
      )}

      {editable && editOpen ? (
        <div className="space-y-3 border-t border-slate-100 pt-3">
          <ChartNoteRichEditor
            value={value}
            onChange={(next) => onChange?.(next)}
            className={inputClassName}
            disabled={saving}
          />
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

      <ChartNoteWideViewModal
        open={wideOpen}
        onClose={() => setWideOpen(false)}
        value={value}
        meta={meta}
        title="Chart note for the team"
        editable={editable}
        editOpen={editOpen}
        onEditOpenChange={setEditOpen}
        onChange={onChange}
        onSave={onSave}
        saving={saving}
        lineItems={lineItems}
        lineItemView={lineItemView}
        onLineItemViewChange={setLineItemView}
      />
    </div>
  );
}
