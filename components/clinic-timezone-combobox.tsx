"use client";

import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type TimezoneOption = { value: string; label: string };

export type TimezoneGrouped = Record<string, TimezoneOption[]>;

/** Pinned at top of the picker before the full IANA list */
export const POPULAR_CLINIC_TIMEZONES: TimezoneOption[] = [
  { value: "America/New_York", label: "America/New York (Eastern)" },
  { value: "America/Chicago", label: "America/Chicago (Central)" },
  { value: "America/Denver", label: "America/Denver (Mountain)" },
  { value: "America/Los_Angeles", label: "America/Los Angeles (Pacific)" },
  { value: "America/Detroit", label: "America/Detroit (Michigan)" },
  { value: "Europe/London", label: "Europe/London (GMT)" },
  { value: "Europe/Paris", label: "Europe/Paris (Central European)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (Japan)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (Gulf)" },
  { value: "Africa/Lagos", label: "Africa/Lagos (West Africa)" },
  { value: "Pacific/Auckland", label: "Pacific/Auckland (New Zealand)" },
];

export function formatClinicLocalTime(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date());
  } catch {
    return "—";
  }
}

/** Browser-side IANA check (matches server zoneinfo validation). */
export function isValidIanaTimezone(tz: string): boolean {
  const name = tz.trim();
  if (!name) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

function findLabel(value: string, grouped: TimezoneGrouped | null): string {
  const popular = POPULAR_CLINIC_TIMEZONES.find((o) => o.value === value);
  if (popular) return popular.label;
  if (!grouped) return value.replace(/_/g, " ");
  for (const items of Object.values(grouped)) {
    const hit = items.find((o) => o.value === value);
    if (hit) return hit.label;
  }
  return value.replace(/_/g, " ");
}

type ClinicTimezoneComboboxProps = {
  value: string;
  disabled?: boolean;
  grouped: TimezoneGrouped | null;
  loading?: boolean;
  error?: string;
  onChange: (tz: string) => void;
};

export function ClinicTimezoneCombobox({
  value,
  disabled,
  grouped,
  loading,
  error,
  onChange,
}: ClinicTimezoneComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clock, setClock] = useState(() => formatClinicLocalTime(value));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setClock(formatClinicLocalTime(value));
    const id = window.setInterval(() => setClock(formatClinicLocalTime(value)), 60_000);
    return () => window.clearInterval(id);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const q = query.trim().toLowerCase();

  const filteredPopular = useMemo(() => {
    if (!q) return POPULAR_CLINIC_TIMEZONES;
    return POPULAR_CLINIC_TIMEZONES.filter(
      (o) => o.value.toLowerCase().includes(q) || o.label.toLowerCase().includes(q),
    );
  }, [q]);

  const filteredGroups = useMemo(() => {
    if (!grouped) return [];
    const regions = Object.keys(grouped).sort();
    const out: { region: string; items: TimezoneOption[] }[] = [];
    for (const region of regions) {
      const items = (grouped[region] ?? []).filter(
        (o) =>
          !q ||
          o.value.toLowerCase().includes(q) ||
          o.label.toLowerCase().includes(q),
      );
      if (items.length) out.push({ region, items });
    }
    return out;
  }, [grouped, q]);

  const pick = useCallback(
    (tz: string) => {
      onChange(tz);
      setOpen(false);
      setQuery("");
    },
    [onChange],
  );

  const displayLabel = findLabel(value, grouped);

  return (
    <div ref={rootRef} className="relative space-y-2">
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => !disabled && !loading && setOpen((o) => !o)}
        className={cn(
          "admin-input flex w-full items-center justify-between gap-2 py-2.5 text-left text-sm",
          (disabled || loading) && "cursor-not-allowed opacity-60",
          error && "border-rose-400 ring-1 ring-rose-300",
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate">{loading ? "Loading timezones…" : displayLabel || value}</span>
        <span className="shrink-0 text-slate-400" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div
          className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/10"
          role="listbox"
        >
          <div className="border-b border-slate-100 p-2">
            <input
              type="search"
              autoFocus
              placeholder="Search timezones…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </div>

          <div className="max-h-72 overflow-y-auto overscroll-contain p-1">
            {filteredPopular.length ? (
              <div className="mb-1">
                <p className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Common
                </p>
                {filteredPopular.map((opt) => (
                  <button
                    key={`pop-${opt.value}`}
                    type="button"
                    role="option"
                    aria-selected={value === opt.value}
                    onClick={() => pick(opt.value)}
                    className={cn(
                      "flex w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-emerald-50",
                      value === opt.value && "bg-emerald-50 font-medium text-emerald-950",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : null}

            {filteredGroups.length ? (
              <div>
                <p className="sticky top-0 z-10 border-b border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  All timezones
                </p>
                {filteredGroups.map(({ region, items }) => (
                  <div key={region} className="mb-1">
                    <p className="sticky top-0 z-[5] bg-white/95 px-3 py-1 text-xs font-semibold text-slate-600 backdrop-blur-sm">
                      {region}
                    </p>
                    {items.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={value === opt.value}
                        onClick={() => pick(opt.value)}
                        className={cn(
                          "flex w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-slate-50",
                          value === opt.value && "bg-emerald-50 font-medium text-emerald-950",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}

            {!filteredPopular.length && !filteredGroups.length ? (
              <p className="px-3 py-4 text-center text-sm text-slate-500">No timezones match your search.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="text-sm text-slate-700">
        <p>
          <span className="font-medium text-slate-800">Selected:</span> {value.replace(/_/g, " ")}
        </p>
        <p>
          <span className="font-medium text-slate-800">Current clinic time:</span> {clock}
        </p>
      </div>

      {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}
