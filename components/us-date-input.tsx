"use client";

import { formatIsoAsUsSlash } from "@/lib/format-date";
import { normalizeUsDateInput } from "@/lib/normalize-date-of-birth";
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
 * Text field shown as MM/DD/YYYY (US). Paste or type dates like 5/9/1971 or 05/09/1971;
 * saves YYYY-MM-DD for the API.
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

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      id={id}
      disabled={disabled}
      className={className}
      placeholder="MM/DD/YYYY"
      value={text}
      onFocus={onFocus}
      title={title ?? "Month / day / year — paste e.g. 05/09/1971"}
      aria-label={ariaLabel}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => commit(text)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(text);
          (e.target as HTMLInputElement).blur();
        }
      }}
      onPaste={(e) => {
        const normalized = normalizeUsDateInput(e.clipboardData.getData("text/plain"));
        if (normalized) {
          e.preventDefault();
          onChange(normalized);
          setText(formatIsoAsUsSlash(normalized));
        }
      }}
    />
  );
}
