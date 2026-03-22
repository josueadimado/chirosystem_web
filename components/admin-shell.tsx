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
    <header className="mb-6 sm:mb-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#13823d]">Administration</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
        {pageHelp ? (
          <HelpTip label={`What is ${title}?`} align="center">
            {pageHelp}
          </HelpTip>
        ) : null}
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">{description}</p>
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
    <div className="mb-3 flex items-center gap-2">
      <h3 className="text-base font-semibold text-slate-800">{children}</h3>
      {help ? <HelpTip label="About this section">{help}</HelpTip> : null}
    </div>
  );
}
