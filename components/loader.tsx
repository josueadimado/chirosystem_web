"use client";

import { IconLogo } from "@/components/icons";

/**
 * Loaders for route transitions and data fetches.
 * Brand: green #16a349, orange #e9982f
 */

type LoaderProps = {
  /** spinner = inline/buttons · dots = stepping dots · page = centered card in main content · screen = full viewport (home / root) */
  variant?: "spinner" | "page" | "dots" | "screen";
  label?: string;
  /** Secondary line under the label (page/screen only) */
  sublabel?: string;
  className?: string;
};

function BrandLoaderCore({ label, sublabel }: { label?: string; sublabel?: string }) {
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative flex h-[5.5rem] w-[5.5rem] items-center justify-center">
        {/* Soft glow */}
        <div
          className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[#16a349]/25 to-[#e9982f]/20 blur-xl animate-brand-breathe"
          aria-hidden
        />
        {/* Spinning ring */}
        <div
          className="absolute -inset-1 rounded-3xl border-2 border-transparent border-t-[#16a349] border-r-[#e9982f]/80 opacity-90 animate-loader-ring"
          aria-hidden
        />
        {/* Logo tile */}
        <div className="relative flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-2xl border border-white/80 bg-white shadow-lg shadow-slate-200/80">
          <IconLogo className="h-11 w-11 text-[#16a349]" />
        </div>
      </div>

      <div className="max-w-xs text-center">
        {label && (
          <p className="text-base font-semibold tracking-tight text-slate-800 animate-fade-in">{label}</p>
        )}
        {sublabel && <p className="mt-1.5 text-sm leading-snug text-slate-500 animate-fade-in">{sublabel}</p>}
      </div>

      {/* Indeterminate progress strip */}
      <div className="relative h-1.5 w-52 overflow-hidden rounded-full bg-slate-200/90 shadow-inner">
        <div
          className="absolute inset-y-0 w-2/5 rounded-full bg-gradient-to-r from-[#16a349] via-[#22c55e] to-[#e9982f] animate-loader-bar-slide"
          aria-hidden
        />
      </div>
    </div>
  );
}

export function Loader({ variant = "spinner", label, sublabel, className = "" }: LoaderProps) {
  const spinner = (
    <div
      className="h-6 w-6 animate-spin rounded-full border-2 border-[#16a349]/30 border-t-[#16a349]"
      aria-hidden
    />
  );

  const dots = (
    <div className="flex gap-1.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-2 w-2 animate-bounce rounded-full bg-[#16a349]"
          style={{ animationDelay: `${i * 150}ms`, animationFillMode: "both" }}
        />
      ))}
    </div>
  );

  if (variant === "screen") {
    return (
      <div
        className={`flex min-h-screen w-full flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-[#ecfdf5] px-6 animate-fade-in ${className}`}
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <BrandLoaderCore
          label={label ?? "Relief Chiropractic"}
          sublabel={sublabel ?? "Just a moment while we get things ready…"}
        />
      </div>
    );
  }

  if (variant === "page") {
    return (
      <div
        className={`flex min-h-[min(70vh,28rem)] flex-col items-center justify-center py-16 ${className}`}
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="rounded-2xl border border-slate-200/80 bg-white/90 px-10 py-12 shadow-lg shadow-slate-200/50 backdrop-blur-sm">
          <BrandLoaderCore
            label={label ?? "Loading"}
            sublabel={sublabel ?? "One moment please…"}
          />
        </div>
      </div>
    );
  }

  if (variant === "dots") {
    return (
      <div className={`animate-fade-in flex flex-col items-center justify-center gap-3 py-6 ${className}`} role="status" aria-live="polite">
        {dots}
        {label && <p className="text-sm font-medium text-slate-600">{label}</p>}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 ${className}`} role="status" aria-live="polite">
      {spinner}
      {label && <span className="text-sm text-slate-600">{label}</span>}
    </div>
  );
}
