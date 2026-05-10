"use client";

import { HelpTip } from "@/components/help-tip";

export function AdminPageIntro({
  title,
  description,
  pageHelp,
}: {
  title: string;
  description: string;
  /** Extra context behind the small “i” next to the title */
  pageHelp?: React.ReactNode;
}) {
  return (
    <header className="mb-8 sm:mb-10">
      <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-primary leading-normal">Administration</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-bold leading-snug tracking-tight text-foreground sm:text-3xl">{title}</h2>
        {pageHelp ? (
          <HelpTip label={`What is ${title}?`} align="center">
            {pageHelp}
          </HelpTip>
        ) : null}
      </div>
      <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-slate-600">{description}</p>
    </header>
  );
}

export function AdminSectionLabel({
  children,
  help,
}: {
  children: React.ReactNode;
  help?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <h3 className="text-lg font-semibold leading-snug text-foreground">{children}</h3>
      {help ? <HelpTip label="About this section">{help}</HelpTip> : null}
    </div>
  );
}
