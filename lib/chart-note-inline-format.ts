export type InlinePart =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "underline"; value: string };

/** Remove bold / italic / underline markers so SOAP headings still parse. */
export function stripInlineMarkers(line: string): string {
  return line
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\+\+([^+]+)\+\+/g, "$1")
    .trim();
}

/** Parse `**bold**`, `*italic*`, and `++underline++` in chart note text. */
export function parseInlineParts(text: string): InlinePart[] {
  if (!text) return [{ type: "text", value: "" }];

  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\+\+([^+]+)\+\+/g;
  const parts: InlinePart[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ type: "text", value: text.slice(last, match.index) });
    }
    if (match[1] !== undefined) parts.push({ type: "bold", value: match[1] });
    else if (match[2] !== undefined) parts.push({ type: "italic", value: match[2] });
    else if (match[3] !== undefined) parts.push({ type: "underline", value: match[3] });
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    parts.push({ type: "text", value: text.slice(last) });
  }

  if (parts.length === 0) {
    parts.push({ type: "text", value: text });
  }

  return parts;
}

export function wrapChartNoteSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  wrapper: [string, string],
): { next: string; selectionStart: number; selectionEnd: number } {
  const [before, after] = wrapper;
  const selected = value.slice(selectionStart, selectionEnd);
  const next = value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd);
  const start = selectionStart + before.length;
  const end = start + selected.length;
  return { next, selectionStart: start, selectionEnd: end };
}
