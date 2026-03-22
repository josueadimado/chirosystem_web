"use client";

import { HelpTip } from "@/components/help-tip";

/**
 * Shared layout pieces for the doctor area — consistent typography, stats, and empty states.
 */

export function DoctorPageIntro({
  eyebrow,
  title,
  description,
  pageHelp,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  /** Click the small “i” next to the title for extra context */
  pageHelp?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-6 animate-fade-in-up sm:mb-8">
      {eyebrow ? (
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#13823d]">{eyebrow}</p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
        {pageHelp ? (
          <HelpTip label={`About ${title}`} align="center" tone="emerald">
            {pageHelp}
          </HelpTip>
        ) : null}
      </div>
      <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-600">{description}</p>
      {children ? <div className="mt-6">{children}</div> : null}
    </header>
  );
}

export type DoctorStat = {
  label: string;
  value: string | number;
  tone?: "default" | "accent" | "amber";
  /** Short explanation behind the “i” next to the stat label */
  help?: React.ReactNode;
};

export function DoctorStatsRow({ stats }: { stats: DoctorStat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className={`rounded-2xl border px-4 py-3.5 transition-shadow hover:shadow-sm ${
            s.tone === "accent"
              ? "border-[#16a349]/20 bg-gradient-to-br from-[#16a349]/[0.07] to-white"
              : s.tone === "amber"
                ? "border-amber-200/70 bg-gradient-to-br from-amber-50/90 to-white"
                : "border-slate-200/80 bg-white/90 shadow-sm shadow-slate-200/40"
          }`}
        >
          <p className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">{s.value}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <p className="text-xs font-medium leading-snug text-slate-500">{s.label}</p>
            {s.help ? (
              <HelpTip label={s.label} tone="emerald">
                {s.help}
              </HelpTip>
            ) : null}
          </div>
        </div>
      ))}
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
    <div className="mb-3 flex items-center gap-2 sm:gap-3">
      <h3 className="text-base font-semibold text-slate-800">{children}</h3>
      {help ? (
        <HelpTip label="About this section" tone="emerald">
          {help}
        </HelpTip>
      ) : null}
      <span className="h-px min-w-[2rem] flex-1 bg-gradient-to-r from-slate-200 to-transparent" aria-hidden />
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
    <div className="rounded-2xl border border-dashed border-slate-200/90 bg-gradient-to-b from-slate-50/60 to-white px-6 py-12 text-center sm:py-14">
      {children ? <div className="mb-4 flex justify-center">{children}</div> : null}
      <p className="text-base font-semibold text-slate-800">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">{description}</p>
    </div>
  );
}

export function doctorGreeting(): "Good morning" | "Good afternoon" | "Good evening" {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
