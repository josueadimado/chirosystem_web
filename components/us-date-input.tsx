"use client";

import { formatIsoAsUsSlash } from "@/lib/format-date";
import { formatUsDatePartial, normalizeUsDateInput } from "@/lib/normalize-date-of-birth";
import { useEffect, useState } from "react";

type UsDateInputProps = {
  /** Stored value: YYYY-MM-DD (empty string = no date). */
  value: string;
  onChange: (isoDate: string) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
  onFocus?: () => void;
  title?: string;
  "aria-label"?: string;
};

/**
 * US date field (MM/DD/YYYY). Type digits only on mobile — slashes are added automatically.
 * Paste works too (with or without separators). Saves YYYY-MM-DD for the API.
 */
export function UsDateInput({
  value,
  onChange,
  className,
  id,
  disabled,
  onFocus,
  title,
  "aria-label": ariaLabel,
}: UsDateInputProps) {
  const [text, setText] = useState(() => formatIsoAsUsSlash(value));

  useEffect(() => {
    setText(formatIsoAsUsSlash(value));
  }, [value]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange("");
      setText("");
      return;
    }
    const iso = normalizeUsDateInput(trimmed);
    if (iso) {
      onChange(iso);
      setText(formatIsoAsUsSlash(iso));
    }
  };

  const applyPastedText = (pasted: string) => {
    const formatted = formatUsDatePartial(pasted);
    setText(formatted);
    const iso = normalizeUsDateInput(formatted) ?? normalizeUsDateInput(pasted);
    if (iso) {
      onChange(iso);
      setText(formatIsoAsUsSlash(iso));
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="bday"
      id={id}
      disabled={disabled}
      className={className}
      placeholder="MM/DD/YYYY"
      value={text}
      onFocus={onFocus}
      title={title ?? "Type numbers only — slashes are added for you (e.g. 951971 → 9/5/1971)"}
      aria-label={ariaLabel}
      onChange={(e) => setText(formatUsDatePartial(e.target.value))}
      onBlur={() => commit(text)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(text);
          (e.target as HTMLInputElement).blur();
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        applyPastedText(e.clipboardData.getData("text/plain"));
      }}
    />
  );
}
