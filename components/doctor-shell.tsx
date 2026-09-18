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
  description?: string;
  /** Click the small “i” next to the title for extra context */
  pageHelp?: React.ReactNode;
  children?: React.ReactNode;
  /** Tighter spacing for long-form pages (e.g. user guide) */
  dense?: boolean;
}) {
  return (
    <header className={dense ? "mb-3 animate-fade-in-up sm:mb-4" : "mb-4 animate-fade-in-up sm:mb-5"}>
      {eyebrow ? (
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#16a349] leading-normal">{eyebrow}</p>
      ) : null}
      <div className="mt-0.5 flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold leading-snug tracking-tight text-[#0d1f14] sm:text-2xl">{title}</h2>
        {pageHelp ? (
          <HelpTip label={`About ${title}`} align="center" tone="emerald">
            {pageHelp}
          </HelpTip>
        ) : null}
      </div>
      {description ? (
        <p
          className={
            dense
              ? "mt-1.5 max-w-none text-sm leading-relaxed text-[#949494]"
              : "mt-1.5 max-w-2xl text-sm leading-relaxed text-[#949494]"
          }
        >
          {description}
        </p>
      ) : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </header>
  );
}

/** Banani StatCard icon tile colors */
export type DoctorStatIconTone = "primary" | "green" | "consult" | "red" | "grey" | "amber";

export type DoctorStat = {
  label: string;
  value: string | number;
  tone?: "default" | "accent" | "amber";
  /** Optional icon shown in Banani-style colored tile */
  icon?: React.ReactNode;
  iconTone?: DoctorStatIconTone;
  /** Short explanation behind the “i” next to the stat label */
  help?: React.ReactNode;
  /** When set, the stat card becomes a button (e.g. filter the schedule list). */
  onSelect?: () => void;
  active?: boolean;
};

const iconToneClasses: Record<DoctorStatIconTone, string> = {
  primary: "bg-[#dbe7fb] text-[#16a349]",
  green: "bg-[#d1fae5] text-[#065f46]",
  consult: "bg-[#fef3c7] text-[#92400e]",
  red: "bg-[#fee2e2] text-[#991b1b]",
  grey: "bg-[#f3f4f6] text-[#4b5563]",
  amber: "bg-[#fef3c7] text-[#92400e]",
};

export function DoctorStatsRow({ stats }: { stats: DoctorStat[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {stats.map((s) => {
        const iconTone = s.iconTone ?? (s.tone === "amber" ? "amber" : s.tone === "accent" ? "consult" : "primary");
        const panelClass = cn(
          "flex items-center gap-3 rounded-lg border border-[#e8e8e8] bg-white px-3.5 py-3 text-left transition-shadow",
          s.onSelect && "relative cursor-pointer hover:border-[#16a349]/40 hover:shadow-sm",
          s.active && "border-[#16a349] ring-2 ring-[#16a349]/25",
        );
        const content = (
          <>
            {s.icon ? (
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg [&_svg]:h-4 [&_svg]:w-4",
                  iconToneClasses[iconTone],
                )}
                aria-hidden
              >
                {s.icon}
              </div>
            ) : null}
            <div className="min-w-0">
              <p className="text-xl font-bold tabular-nums leading-none tracking-tight text-[#0d1f14]">{s.value}</p>
              <div className="mt-1 flex items-center gap-1">
                <p className="truncate text-[11px] font-medium text-[#949494]">{s.label}</p>
                {s.help ? (
                  <span className={cn("inline-flex", s.onSelect && "relative z-10")}>
                    <HelpTip label={s.label} tone="emerald">
                      {s.help}
                    </HelpTip>
                  </span>
                ) : null}
              </div>
            </div>
          </>
        );

        // Clickable stats use an overlay button so HelpTip stays a sibling (never nested <button>).
        if (s.onSelect) {
          return (
            <div key={s.label} className={panelClass}>
              <button
                type="button"
                onClick={s.onSelect}
                className="absolute inset-0 z-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16a349]"
                aria-label={`${s.label}: ${s.value}. ${
                  s.active ? "Showing these; tap again for all" : "Tap to show these"
                }`}
                aria-pressed={Boolean(s.active)}
              />
              <div className="relative z-[1] flex w-full items-center gap-3 pointer-events-none [&_button]:pointer-events-auto">
                {content}
              </div>
            </div>
          );
        }

        return (
          <div key={s.label} className={panelClass}>
            {content}
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
      <h3 className="text-base font-semibold leading-snug text-[#0d1f14]">{children}</h3>
      {help ? (
        <HelpTip label="About this section" tone="emerald">
          {help}
        </HelpTip>
      ) : null}
      <span className="h-px min-w-[2rem] flex-1 bg-gradient-to-r from-[#e8e8e8] to-transparent" aria-hidden />
    </div>
  );
}

export function DoctorEmptyWell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[#e8e8e8] bg-[#f5f5f5] px-4 py-6 text-center">
      {children ? <div className="mb-2 flex justify-center">{children}</div> : null}
      <p className="text-sm font-semibold text-[#0d1f14]">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-[#949494]">{description}</p>
      ) : null}
    </div>
  );
}

export function doctorGreeting(): "Good morning" | "Good afternoon" | "Good evening" {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
