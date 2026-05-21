"use client";

import { formatPhoneDisplay } from "@/lib/format-phone";
import Link from "next/link";

/** Phone, email, and profile link pinned to the bottom of visit side panels. */
export function VisitPanelPatientFooter({
  loading,
  phone,
  email,
  profileHref,
  profileLabel = "View full patient profile",
}: {
  loading?: boolean;
  phone?: string;
  email?: string;
  profileHref: string;
  profileLabel?: string;
}) {
  return (
    <div className="shrink-0 border-t border-slate-200 bg-slate-50/90 px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Patient contact</p>
      <div className="mt-2 space-y-2 text-sm">
        {loading ? (
          <p className="text-slate-500">Loading contact…</p>
        ) : (
          <>
            {phone?.trim() ? (
              <a
                href={`tel:${phone.replace(/\D/g, "")}`}
                className="block font-medium text-[#0d5c2e] underline decoration-[#16a349]/30 underline-offset-2 hover:text-[#13823d]"
              >
                {formatPhoneDisplay(phone) || phone}
              </a>
            ) : (
              <p className="text-slate-500">Phone not on file</p>
            )}
            {email?.trim() ? (
              <a href={`mailto:${email.trim()}`} className="block break-all text-slate-700 hover:text-[#0d5c2e]">
                {email.trim()}
              </a>
            ) : null}
            <Link
              href={profileHref}
              className="inline-block text-sm font-semibold text-[#16a349] hover:text-[#13823d]"
            >
              {profileLabel}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
