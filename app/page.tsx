import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { PatientActionRow } from "@/components/patient-action-row";
import { IconCalendarPlus, IconCalendarClock, IconClipboardList, IconLogIn, IconUserPen } from "@/components/icons";
import {
  CLINIC_PHONE_DISPLAY,
  CLINIC_PHONE_TEL,
} from "@/components/public-booking-clinic-help";
import { Phone } from "lucide-react";

export const metadata: Metadata = {
  title: "Relief Chiropractic",
  description: "Book online, manage visits, fill intake forms, or check in at Relief Chiropractic.",
};

type HomeProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Patient portal menu - all entry points live here.
 * Booking wizard lives at /book (and will get its own Banani wizard design next).
 * Old ?manage=1 reminder links still redirect to reschedule on /book.
 */
export default async function PatientPortalHomePage({ searchParams }: HomeProps) {
  const params = searchParams ? await searchParams : {};
  const manageRaw = params.manage;
  const manage = (Array.isArray(manageRaw) ? manageRaw[0] : manageRaw || "").trim().toLowerCase();
  if (manage === "1" || manage === "true" || manage === "yes") {
    redirect("/book?manage=1");
  }

  return (
    <main className="flex min-h-[100dvh] min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-10 border-b border-[#e8e8e8] bg-white px-6 py-4 sm:px-8">
        <BrandLogo variant="full" className="max-h-10 sm:max-h-11" priority />
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Left: content */}
        <div className="flex flex-1 flex-col justify-center gap-8 px-6 py-10 sm:px-10 lg:px-12 lg:py-12">
          <div className="inline-flex w-fit max-w-full rounded-full border border-[#16a349] bg-[#ecfdf5] px-4 py-2">
            <span className="text-xs font-semibold text-[#16a349]">
              Welcome to Relief Chiropractic and Wellness Center
        </span>
        </div>

          <div className="max-w-lg space-y-3">
            <h1 className="text-3xl font-bold leading-tight text-[#0d5c2e] sm:text-4xl">
              How can we help you today?
            </h1>
            <p className="text-base text-[#0d1f14]">
              Choose what you need below. It only takes a minute.
              </p>
            </div>

          {/* Patient-friendly wording — home is the launcher; /book is the wizard */}
          <div className="flex max-w-lg flex-col gap-3 pt-4">
            <PatientActionRow
              href="/book"
              tone="primary"
              title="Book an appointment"
              description="Choose a day and time for a new visit"
              icon={<IconCalendarPlus className="h-6 w-6" />}
            />
            <PatientActionRow
              href="/book?manage=1"
              tone="outline"
              title="View / Reschedule or Cancel"
              description="See upcoming visits, change a time, or cancel"
              icon={<IconCalendarClock className="h-6 w-6" />}
            />
            <PatientActionRow
              href="/book?flow=update"
              tone="muted"
              title="Update my information"
              description="Change your phone, email, or card on file"
              icon={<IconUserPen className="h-6 w-6" />}
            />
            <PatientActionRow
              href="/intake"
              tone="outline"
              title="Fill out forms"
              description="Complete paperwork before your visit"
              icon={<IconClipboardList className="h-6 w-6" />}
            />
            <PatientActionRow
              href="/kiosk"
              tone="muted"
              title="Check in — I'm here"
              description="Let the front desk know you've arrived"
              icon={<IconLogIn className="h-6 w-6" />}
                    />
                  </div>

          {/* Call option — logo gold so it reads apart from green booking actions */}
          <a
            href={CLINIC_PHONE_TEL}
            className="mt-5 flex max-w-lg items-center gap-4 rounded-xl border border-[#E9982F]/45 bg-[#FFF6EB] px-5 py-4 transition hover:border-[#E9982F]/70 hover:bg-[#FFEFDC]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E9982F] text-white shadow-sm">
              <Phone className="h-[18px] w-[18px]" aria-hidden />
                                  </span>
            <span className="min-w-0 text-left">
              <span className="block text-sm font-semibold text-[#B8731A]">Prefer to call?</span>
              <span className="mt-0.5 block text-base font-bold tracking-wide text-[#8A5A12]">
                {CLINIC_PHONE_DISPLAY}
                      </span>
            </span>
          </a>
                  </div>

        {/* Right: clinic photo (desktop) — richer color, light edge blend only */}
        <div className="relative hidden min-h-[320px] w-full overflow-hidden lg:block lg:w-[48%] xl:w-1/2">
          <Image
            src="/images/clinic-reception.png"
            alt="Clinic reception"
            fill
            priority
            className="scale-105 object-cover object-center brightness-[1.06] contrast-[1.08] saturate-[1.12]"
            sizes="50vw"
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/70 via-white/15 to-transparent"
                                  aria-hidden
                                />
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-[#16a349]/0 via-[#16a349]/40 to-[#16a349]/0"
                                      aria-hidden
                                    />
                        </div>

        {/* Mobile photo strip */}
        <div className="relative min-h-[220px] w-full overflow-hidden sm:min-h-[260px] lg:hidden">
          <Image
            src="/images/clinic-reception.png"
            alt="Clinic reception"
            fill
            priority
            className="object-cover object-[center_35%] brightness-[1.06] contrast-[1.08] saturate-[1.12]"
            sizes="100vw"
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/50 via-transparent to-transparent"
            aria-hidden
                    />
                  </div>
                        </div>

      <footer className="border-t border-[#e8e8e8] bg-[#f5f5f5] px-6 py-5 text-center sm:px-8">
        <p className="text-xs text-[#949494]">
          &copy; 2026 Relief Chiropractic & Wellness Center. All rights reserved.
        </p>
      </footer>
    </main>
  );
}
