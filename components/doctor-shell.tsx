"use client";

import { HelpTip } from "@/components/help-tip";
import { cn } from "@/lib/utils";

/**
 * Shared layout pieces for the doctor area — consistent typography, stats, and empty states.
 */

export function DoctorPageIntro({
  eyebrow,
  title,
  description,
  pageHelp,
  children,
  dense,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  /** Click the small “i” next to the title for extra context */
  pageHelp?: React.ReactNode;
  children?: React.ReactNode;
  /** Tighter spacing for long-form pages (e.g. user guide) */
  dense?: boolean;
}) {
  return (
    <header className={dense ? "mb-4 animate-fade-in-up sm:mb-5" : "mb-8 animate-fade-in-up sm:mb-10"}>
      {eyebrow ? (
        <p className="mb-1 text-[13px] font-semibold uppercase tracking-[0.18em] text-primary leading-normal">{eyebrow}</p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-bold leading-snug tracking-tight text-foreground sm:text-3xl">{title}</h2>
        {pageHelp ? (
          <HelpTip label={`About ${title}`} align="center" tone="emerald">
            {pageHelp}
          </HelpTip>
        ) : null}
      </div>
      <p
        className={
          dense
            ? "mt-2 max-w-none text-[15px] leading-relaxed text-muted-foreground sm:mt-3 sm:text-base"
            : "mt-3 max-w-2xl text-[14px] leading-relaxed text-muted-foreground"
        }
      >
        {description}
      </p>
      {children ? <div className="mt-8">{children}</div> : null}
    </header>
  );
}

export type DoctorStat = {
  label: string;
  value: string | number;
  tone?: "default" | "accent" | "amber";
  /** Short explanation behind the “i” next to the stat label */
  help?: React.ReactNode;
  /** When set, the stat card becomes a button (e.g. filter the schedule list). */
  onSelect?: () => void;
  active?: boolean;
};

export function DoctorStatsRow({ stats }: { stats: DoctorStat[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
      {stats.map((s) => {
        const panelClass = cn(
          "rounded-2xl border px-5 py-5 text-left transition-shadow",
          s.onSelect && "cursor-pointer hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16a349]",
          !s.onSelect && "hover:shadow-sm",
          s.active && "ring-2 ring-[#16a349]/35",
          s.tone === "accent"
            ? "border-primary/20 bg-gradient-to-br from-primary/[0.08] to-card"
            : s.tone === "amber"
              ? "border-amber-200/70 bg-gradient-to-br from-amber-50/90 to-card"
              : "border-border/80 bg-card/90 shadow-sm shadow-black/[0.04]",
        );
        const body = (
          <>
            <p className="text-3xl font-bold tabular-nums leading-none tracking-tight text-foreground">{s.value}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <p className="text-[13px] font-medium leading-normal text-muted-foreground">{s.label}</p>
              {s.help ? (
                <span
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="inline-flex"
                >
                  <HelpTip label={s.label} tone="emerald">
                    {s.help}
                  </HelpTip>
                </span>
              ) : null}
            </div>
            {s.onSelect ? (
              <p className="mt-2 text-[11px] font-semibold text-[#0d5c2e]">
                {s.active ? "Showing these · tap again for all" : "Tap to show these"}
              </p>
            ) : null}
          </>
        );
        if (s.onSelect) {
          return (
            <button key={s.label} type="button" onClick={s.onSelect} className={panelClass}>
              {body}
            </button>
          );
        }
        return (
          <div key={s.label} className={panelClass}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

export function DoctorSectionLabel({
  children,
  help,
}: {
  children: React.ReactNode;
  help?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-2 sm:gap-3">
      <h3 className="text-lg font-semibold leading-snug text-foreground">{children}</h3>
      {help ? (
        <HelpTip label="About this section" tone="emerald">
          {help}
        </HelpTip>
      ) : null}
      <span className="h-px min-w-[2rem] flex-1 bg-gradient-to-r from-border to-transparent" aria-hidden />
    </div>
  );
}

export function DoctorEmptyWell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border/90 bg-gradient-to-b from-muted/50 to-card px-6 py-12 text-center sm:py-14">
      {children ? <div className="mb-4 flex justify-center">{children}</div> : null}
      <p className="text-base font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

export function doctorGreeting(): "Good morning" | "Good afternoon" | "Good evening" {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
