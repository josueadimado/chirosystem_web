"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Small “i” control: click to open a short explanation (closes on outside click or Escape).
 * Tooltip is portaled to document.body so it can sit next to labels in <p>, <span>, or <th>
 * without invalid HTML (no block div inside phrasing-only parents).
 */
/** Relief Chiropractic brand green — same hover for every surface */
const BRAND_TIP_FOCUS =
  "hover:border-[#16a349]/50 hover:bg-emerald-50 hover:text-[#0d5c2e] focus-visible:ring-[#16a349]/40";

const toneClasses = {
  brand: BRAND_TIP_FOCUS,
  /** @deprecated alias for brand — use `brand` */
  emerald: BRAND_TIP_FOCUS,
} as const;

export function HelpTip({
  children,
  label = "Explain this",
  align = "start",
  tone = "brand",
}: {
  children: React.ReactNode;
  /** Accessible name for the button */
  label?: string;
  /** Popover alignment under the icon */
  align?: "start" | "center";
  /** All portals use Relief brand green */
  tone?: keyof typeof toneClasses;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipPos, setTipPos] = useState({ top: 0, left: 0 });

  const updateTipPosition = () => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const top = rect.bottom + 8;
    const left = align === "center" ? rect.left + rect.width / 2 : rect.left;
    setTipPos({ top, left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateTipPosition();
    const onMove = () => updateTipPosition();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || tipRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const tooltip =
    open && typeof document !== "undefined" ? (
      <div
        ref={tipRef}
        role="tooltip"
        className={`fixed z-[205] w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-xs leading-relaxed text-slate-700 shadow-xl shadow-slate-400/20 ring-1 ring-slate-100 ${
          align === "center" ? "-translate-x-1/2" : ""
        }`}
        style={{ top: tipPos.top, left: tipPos.left }}
      >
        {children}
      </div>
    ) : null;

  return (
    <>
      <span
        className={`relative inline-flex ${align === "center" ? "items-center" : "items-start"} align-middle`}
        ref={wrapRef}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300/90 bg-white text-[10px] font-bold italic leading-none text-slate-500 shadow-sm transition focus:outline-none focus-visible:ring-2 ${toneClasses[tone]}`}
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="true"
        >
          i
        </button>
      </span>
      {tooltip && createPortal(tooltip, document.body)}
    </>
  );
}
