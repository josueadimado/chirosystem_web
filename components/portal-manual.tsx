"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageIntro } from "@/components/admin-shell";
import {
  IconArrowRight,
  IconCalendar,
  IconFileDollar,
  IconLayoutGrid,
  IconStethoscope,
  IconUsers,
} from "@/components/icons";
import { cn } from "@/lib/utils";

export type PortalRole = "admin" | "doctor";

type ManualBlock = {
  heading: string;
  bullets: string[];
};

type ManualSection = {
  id: string;
  title: string;
  subtitle?: string;
  roles: PortalRole[];
  description?: string;
  bullets?: string[];
  blocks?: ManualBlock[];
  tip?: string;
  /** Public path under /guide/ — drop the PNG in apps/web/public/guide/ */
  image?: string;
  imageAlt?: string;
  /** Shown until the screenshot file exists at `image` */
  imagePlaceholder?: string;
  /** Tall full-page captures (e.g. dashboard) — show more height in the preview */
  imageLayout?: "landscape" | "portrait";
  /** In-app link shown as “Open this page →” */
  href?: string;
  /** Short caption under the screenshot */
  imageCaption?: string;
  /** Admin guide: 200px-tall placeholder below text (not side-by-side) */
  placeholderCompact?: boolean;
};

const DOCTOR_WORKFLOW_ID = "doctor-workflow";

const DOCTOR_DAILY_WORKFLOW = [
  { step: 1, text: "Open My Dashboard each morning." },
  { step: 2, text: "Check today's appointment list." },
  { step: 3, text: "When the patient arrives — check them in (kiosk or Check in on the row)." },
  { step: 4, text: "Click Start Visit when ready." },
  { step: 5, text: "Document the visit — notes, diagnosis, services." },
  { step: 6, text: "Click Complete Visit." },
  { step: 7, text: "Take payment (card reader, saved card, or payment link)." },
  { step: 8, text: "Book the next visit before the patient leaves." },
] as const;

const DOCTOR_QUICK_LINKS = [
  { label: "My Dashboard", href: "/doctor/dashboard", icon: IconStethoscope },
  { label: "My Schedule", href: "/doctor/schedule", icon: IconCalendar },
  { label: "Patients", href: "/doctor/patients", icon: IconUsers },
] as const;

const ADMIN_QUICK_LINKS = [
  { label: "Dashboard", href: "/admin/dashboard", icon: IconLayoutGrid },
  { label: "Schedule", href: "/admin/schedule", icon: IconCalendar },
  { label: "Patients", href: "/admin/patients", icon: IconUsers },
  { label: "Billing", href: "/admin/billing", icon: IconFileDollar },
] as const;

function ManualSectionBody({ section }: { section: ManualSection }) {
  return (
    <>
      {section.bullets?.length ? (
        <ul className="manual-prose list-inside list-disc space-y-2.5 text-[15px] leading-relaxed text-foreground marker:text-primary sm:text-base">
          {section.bullets.map((b, i) => (
            <li key={`${section.id}-top-${i}`}>{b}</li>
          ))}
        </ul>
      ) : null}
      {section.blocks?.map((block) => (
        <section key={`${section.id}-${block.heading}`} className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-foreground sm:text-sm">{block.heading}</h3>
          <ul className="manual-prose mt-2 list-inside list-disc space-y-2.5 text-[15px] leading-relaxed text-foreground marker:text-primary sm:text-base">
            {block.bullets.map((b, i) => (
              <li key={`${section.id}-${block.heading}-${i}`}>{b}</li>
            ))}
          </ul>
        </section>
      ))}
      {section.tip ? (
        <p className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
          <span className="font-semibold">Tip: </span>
          {section.tip}
        </p>
      ) : null}
    </>
  );
}

function GuideScreenshotPlaceholder({ label, compact }: { label: string; compact?: boolean }) {
  if (compact) {
    return (
      <div
        className="mt-4 flex h-[200px] w-full items-center justify-center rounded-lg border-2 border-dashed border-[#d0d0d0] bg-[#f0f0f0] px-4 text-center"
        role="img"
        aria-label={label}
      >
        <p className="max-w-md text-sm italic leading-snug text-slate-600">{label}</p>
      </div>
    );
  }
  return (
    <div
      className="flex aspect-video w-full items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-[#f0f0f0] px-4 py-6 text-center shadow-sm"
      role="img"
      aria-label={label}
    >
      <p className="max-w-xs text-sm font-medium leading-snug text-slate-600">{label}</p>
    </div>
  );
}

function GuideScreenshot({
  src,
  alt,
  placeholderLabel,
  layout = "landscape",
  caption,
  figureLabel,
  placeholderCompact,
}: {
  src?: string;
  alt: string;
  placeholderLabel?: string;
  layout?: "landscape" | "portrait";
  caption?: string;
  figureLabel?: string;
  placeholderCompact?: boolean;
}) {
  const frameClass =
    layout === "portrait"
      ? "relative block aspect-[3/4] max-h-[min(32rem,70vh)] w-full overflow-hidden rounded-md bg-slate-100 sm:aspect-[2/3]"
      : "relative block aspect-video w-full overflow-hidden rounded-md bg-slate-100";
  const imgClass =
    layout === "portrait"
      ? "object-contain object-top transition group-hover:opacity-95"
      : "object-cover object-top transition group-hover:opacity-95";
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(!src);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen, closeLightbox]);

  if (!src || failed) {
    if (placeholderLabel) {
      return <GuideScreenshotPlaceholder label={placeholderLabel} compact={placeholderCompact} />;
    }
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className="group block w-full rounded-lg border border-slate-200/90 bg-white p-1 shadow-md shadow-black/10 transition hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#16a349]/40"
        aria-label={`View full size: ${alt}`}
      >
        <span className={frameClass}>
          {!loaded ? (
            <GuideScreenshotPlaceholder label={placeholderLabel || alt} compact={placeholderCompact} />
          ) : null}
          <Image
            src={src}
            alt={alt}
            fill
            className={`${imgClass} ${loaded ? "opacity-100" : "opacity-0"}`}
            sizes="(max-width: 1024px) 100vw, 360px"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        </span>
        <span className="mt-1 block text-center text-xs text-muted-foreground group-hover:text-primary">
          Click to enlarge
        </span>
      </button>
      {figureLabel || caption ? (
        <figcaption className="mt-2 space-y-0.5 text-center text-xs leading-snug text-muted-foreground sm:text-left">
          {figureLabel ? <p className="font-semibold text-foreground">{figureLabel}</p> : null}
          {caption ? <p>{caption}</p> : null}
        </figcaption>
      ) : null}

      {lightboxOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={closeLightbox}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white hover:bg-white/20"
            onClick={closeLightbox}
          >
            Close
          </button>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute left-4 top-4 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white hover:bg-white/20"
            onClick={(e) => e.stopPropagation()}
          >
            Open in new tab
          </a>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-h-[90vh] max-w-full rounded-lg border border-white/20 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}

const SECTIONS: ManualSection[] = [
  {
    id: "admin-welcome",
    title: "Welcome to your admin portal",
    roles: ["admin"],
    description:
      "Relief Chiropractic uses this app to manage schedules, patients, billing, and clinic operations.",
    bullets: [
      "Sign in at book.reliefchiropractic.net/auth/sign-in with the email and password your clinic owner gave you.",
      "Install as an app on your iPad or computer for faster access: iPad/iPhone use Share → Add to Home Screen; Chrome use the install icon in the address bar.",
      "The bell icon (top right) shows alerts for check-ins and schedule changes.",
      "Always log out on shared computers.",
      "If something looks wrong, refresh the page. Contact your owner if it persists.",
    ],
    image: "/guide/admin-welcome.png",
    imageAlt: "Admin staff sign-in page",
    imagePlaceholder: "Screenshot: Admin sign-in page",
    imageCaption: "Staff sign-in for the admin portal.",
    placeholderCompact: true,
    href: "/auth/sign-in",
  },
  {
    id: "admin-kiosk",
    title: "Patient check-in kiosk",
    subtitle: "Front desk tablet",
    roles: ["admin"],
    description:
      "The kiosk is a self-service check-in screen for patients who already have an appointment today. URL: book.reliefchiropractic.net/kiosk — bookmark this on your front desk tablet for one-tap access.",
    blocks: [
      {
        heading: "How it works",
        bullets: [
          "Patient enters the phone number they used when booking.",
          "System finds their appointment for today.",
          "Patient confirms and checks in.",
          "The schedule updates to show them as checked in.",
          "Their doctor sees them as ready.",
        ],
      },
      {
        heading: "Important",
        bullets: [
          "The kiosk only shows today's appointments.",
          "It does not replace the public booking site.",
          "If a patient cannot check in: wrong number, no appointment today, or cancelled visit — help them from the Schedule page.",
        ],
      },
    ],
    image: "/guide/admin-kiosk.png",
    imageAlt: "Kiosk check-in screen with phone number entry",
    imagePlaceholder: "Screenshot: Kiosk check-in screen",
    imageCaption: "Front-desk tablet — patient enters the phone number from booking.",
    placeholderCompact: true,
    href: "/kiosk",
  },
  {
    id: "admin-dashboard",
    title: "Dashboard",
    subtitle: "Your daily overview",
    roles: ["admin"],
    description: "The dashboard gives you a snapshot of today at a glance.",
    blocks: [
      {
        heading: "What you see",
        bullets: [
          "Today's appointment volume.",
          "How many patients have checked in.",
          "How many visits are in progress.",
          "Outstanding (unpaid) invoices.",
          "Today's revenue collected.",
          "Recent activity feed.",
          "Quick links to common tasks.",
        ],
      },
      {
        heading: "Use the dashboard to",
        bullets: [
          "Spot who has arrived and who hasn't.",
          "See unpaid balances that need attention.",
          "Jump quickly to the schedule.",
          "Check today's revenue total.",
        ],
      },
    ],
    image: "/guide/admin-dashboard.png",
    imageAlt: "Admin dashboard with today's stats and activity",
    imagePlaceholder: "Screenshot: Admin dashboard overview",
    imageCaption: "Today's volume, check-ins, revenue, and quick links.",
    placeholderCompact: true,
    href: "/admin/dashboard",
  },
  {
    id: "admin-analytics",
    title: "Analytics",
    subtitle: "Business performance overview",
    roles: ["admin"],
    description: "Analytics gives the owner and staff a view of how the clinic is performing.",
    blocks: [
      {
        heading: "Business KPIs (top row)",
        bullets: [
          "Total active clients.",
          "Revenue this month vs last month.",
          "Outstanding balance owed.",
          "New clients this month.",
        ],
      },
      {
        heading: "Charts and summaries",
        bullets: [
          "Revenue chart — monthly revenue for the last 6 months (collected vs outstanding).",
          "Appointments this week — scheduled, completed, cancelled, no-show count and rate.",
          "Billing summary — billed, collected, outstanding, no-show fees pending, collection rate.",
          "Revenue by service — top 5 services by revenue this month.",
          "Client health — active (last 30 days), at risk (60–89 days), inactive (90+ days).",
          "AI voice summary — calls this month, booked via AI, failed or dropped calls.",
        ],
      },
      {
        heading: "Note",
        bullets: ["Analytics is visible to owner and staff accounts only."],
      },
    ],
    image: "/guide/admin-analytics.png",
    imageAlt: "Analytics dashboard with KPIs and charts",
    imagePlaceholder: "Screenshot: Analytics dashboard with charts",
    imageCaption: "Business KPIs, revenue trends, and voice booking stats.",
    placeholderCompact: true,
    href: "/admin/analytics",
  },
  {
    id: "admin-schedule",
    title: "Schedule",
    subtitle: "Multi-provider calendar",
    roles: ["admin"],
    description: "The schedule shows all providers and all appointments in one calendar view.",
    blocks: [
      {
        heading: "Views",
        bullets: [
          "Switch between Day, Week, and Month.",
          "Use the arrows to move between periods.",
          "Click Today to return to the current date.",
        ],
      },
      {
        heading: "Filtering by provider",
        bullets: ["Use the provider filter at the top to show one provider or all providers."],
      },
      {
        heading: "Reading the calendar",
        bullets: [
          "Each block shows patient name, time, service, and status (colour coded).",
          "Click any appointment to open the visit panel on the right side.",
        ],
      },
      {
        heading: "Visit panel actions",
        bullets: [
          "See patient contact details.",
          "Check in the patient manually (same as kiosk — for walk-ins without the tablet).",
          "View handoff / chart notes.",
          "Reschedule the appointment.",
          "Book next visit.",
          "Cancel or mark no-show.",
        ],
      },
      {
        heading: "Booking from an open slot",
        bullets: [
          "Click any empty time slot to open the booking form.",
          "Select patient, service, provider, date and time, then confirm.",
        ],
      },
      {
        heading: "Desk check-in",
        bullets: [
          "When a patient walks in without the kiosk, find their appointment in the schedule and click Check In.",
          "Their doctor will see them as ready.",
        ],
      },
    ],
    image: "/guide/admin-schedule.png",
    imageAlt: "Admin schedule week view with multiple providers",
    imagePlaceholder: "Screenshot: Admin schedule calendar — week view with multiple providers",
    imageCaption: "All providers on one calendar — click a block for the visit panel.",
    placeholderCompact: true,
    href: "/admin/schedule",
  },
  {
    id: "admin-patients",
    title: "Patients",
    subtitle: "Full patient directory",
    roles: ["admin"],
    description: "The Patients page shows every patient in the clinic system.",
    blocks: [
      {
        heading: "Searching and filtering",
        bullets: [
          "Search by name or phone number.",
          "Filter: all patients; upcoming appointment; no upcoming; seen recently; not seen in a long time; never visited.",
        ],
      },
      {
        heading: "Adding a new patient",
        bullets: [
          "Click Add Patient at the top right.",
          "Fill in name, phone, email.",
          "Phone number is required — it powers SMS reminders and kiosk lookup.",
        ],
      },
      {
        heading: "Patient row actions",
        bullets: ["Open chart → full patient record.", "History → all visits and bills."],
      },
      {
        heading: "Patient chart",
        bullets: [
          "Demographics (name, phone, email, date of birth, address).",
          "Medical history fields.",
          "Visit list with billing status.",
          "Notes from previous visits.",
        ],
      },
      {
        heading: "Editing patient information",
        bullets: [
          "Admins can edit all patient fields.",
          "Keep phone numbers accurate — used for SMS reminders, kiosk check-in, and AI voice recognition.",
        ],
      },
      {
        heading: "Visit history",
        bullets: [
          "Click History on any patient to see every visit with date, service, provider, invoice amount, and payment status.",
          "Print any old bill.",
        ],
      },
    ],
    image: "/guide/admin-patients.png",
    imageAlt: "Patients list with search and filters",
    imagePlaceholder: "Screenshot: Patients list with search and filter options",
    imageCaption: "Search, filter, add patients, and open chart or history.",
    placeholderCompact: true,
    href: "/admin/patients",
  },
  {
    id: "admin-billing",
    title: "Invoices & Billing",
    subtitle: "Payments and outstanding balances",
    roles: ["admin"],
    description: "The Billing page is your payment desk.",
    blocks: [
      {
        heading: "Invoice list",
        bullets: [
          "Shows all invoices with patient name, service, amount, status (paid, partial, overdue, pending), and date.",
          "Filter: all invoices; unpaid only; overdue only; by date range; by patient.",
        ],
      },
      {
        heading: "Taking payment on an invoice",
        bullets: [
          "Find the invoice and click Pay.",
          "Saved card on file — charge with one tap.",
          "Square Terminal — sends to card reader.",
          "Square POS — opens iPad POS app.",
          "Payment link — sends text or email to patient.",
          "Patient credit — apply existing balance.",
        ],
      },
      {
        heading: "Patient credit",
        bullets: [
          "Credit is a balance the patient has with the clinic.",
          "To add credit: open the patient → Add Credit → enter amount and reason.",
          "To use credit on an invoice: Pay → Apply Credit.",
        ],
      },
      {
        heading: "Credit top-up via Terminal",
        bullets: [
          "Patient Credit Top-up → enter amount → sends to Square Terminal.",
        ],
      },
      {
        heading: "Preview and print bills",
        bullets: [
          "Preview — see the full bill before printing.",
          "Print — get a printable version.",
        ],
      },
      {
        heading: "No-show fees",
        bullets: [
          "No-show fees appear as invoices when a patient is marked no-show.",
          "Waive or collect them like any other invoice.",
        ],
      },
    ],
    image: "/guide/admin-billing.png",
    imageAlt: "Billing page with invoice list and payment options",
    imagePlaceholder: "Screenshot: Billing page with invoice list and payment options",
    imageCaption: "Invoice desk — search, pay, credit, and print.",
    placeholderCompact: true,
    href: "/admin/billing",
  },
  {
    id: "admin-services",
    title: "Services & Codes",
    subtitle: "What patients can book",
    roles: ["admin"],
    description: "Services are the visit types patients can book and doctors can bill for.",
    blocks: [
      {
        heading: "What you can do here",
        bullets: [
          "Add new service types.",
          "Edit service names, duration, price.",
          "Set which services show in public booking.",
          "Mark services as active or inactive.",
          "Set which providers offer each service.",
        ],
      },
      {
        heading: "Adding a service",
        bullets: [
          "Click Add Service.",
          "Fill in name (shown on public booking), duration, price, service type (chiropractic or massage), show in public booking, and assign to providers.",
        ],
      },
      {
        heading: "Editing and hiding",
        bullets: [
          "Click any service to edit — changes apply to new bookings immediately.",
          "Uncheck Show in public booking to hide from the patient site without deleting; doctors can still bill for it.",
        ],
      },
      {
        heading: "Note",
        bullets: [
          "Deleting a service that has existing appointments is not allowed — mark it inactive instead.",
        ],
      },
    ],
    image: "/guide/admin-services.png",
    imageAlt: "Services list with add and edit options",
    imagePlaceholder: "Screenshot: Services list with add and edit options",
    imageCaption: "Visit types for booking and billing.",
    placeholderCompact: true,
    href: "/admin/services",
  },
  {
    id: "admin-providers",
    title: "Doctors & Providers",
    subtitle: "Provider profiles and settings",
    roles: ["admin"],
    description: "This page manages everyone who appears on the schedule and in online booking.",
    blocks: [
      {
        heading: "Provider profiles",
        bullets: [
          "Full name (shown to patients), title (e.g. Dr., LMT), email, phone.",
          "Services they provide.",
          "Active/inactive status.",
        ],
      },
      {
        heading: "Adding a provider",
        bullets: [
          "Click Add Provider — fill in name, title, email, assign services, set active to show in booking.",
        ],
      },
      {
        heading: "Creating a doctor login",
        bullets: [
          "From the provider record click Create Login.",
          "Creates a doctor portal account; they receive email with login details.",
        ],
      },
      {
        heading: "Deactivating and reassigning",
        bullets: [
          "Mark inactive to remove from new bookings; existing appointments stay.",
          "Reassign appointments to another provider if someone leaves.",
        ],
      },
    ],
    image: "/guide/admin-providers.png",
    imageAlt: "Providers list with provider detail panel",
    imagePlaceholder: "Screenshot: Providers list with provider detail panel",
    imageCaption: "Schedule and booking profiles for each provider.",
    placeholderCompact: true,
    href: "/admin/providers",
  },
  {
    id: "admin-booking-blocks",
    title: "Booking Blocks",
    subtitle: "Control when patients can book online",
    roles: ["admin"],
    description:
      "Booking blocks prevent patients from booking appointments during specific times through the public booking site.",
    blocks: [
      {
        heading: "Use cases",
        bullets: [
          "Clinic closed for a holiday.",
          "Provider unavailable for a day.",
          "Limiting online booking to certain hours.",
          "Blocking a lunch break.",
        ],
      },
      {
        heading: "Adding a block",
        bullets: [
          "Click Add Block.",
          "Select provider (or all), date or date range, start and end time, reason (internal note only).",
          "Patients will not see available slots during blocked times on the booking site.",
        ],
      },
      {
        heading: "Note",
        bullets: [
          "Blocks only affect the public booking site.",
          "You can still manually book during blocked times from the Admin Schedule page.",
        ],
      },
    ],
    image: "/guide/admin-booking-blocks.png",
    imageAlt: "Booking blocks list with add block form",
    imagePlaceholder: "Screenshot: Booking blocks list with add block form",
    imageCaption: "Block dates and times from online booking.",
    placeholderCompact: true,
    href: "/admin/booking-blocks",
  },
  {
    id: "admin-team",
    title: "Team & Logins",
    subtitle: "Visible to owner accounts only",
    roles: ["admin"],
    description: "This section is only visible in the sidebar for owner-level admin accounts.",
    blocks: [
      {
        heading: "What you can do",
        bullets: [
          "See all staff accounts.",
          "Invite new team members.",
          "Change account roles.",
          "Deactivate accounts.",
        ],
      },
      {
        heading: "Account roles",
        bullets: [
          "Owner — full access including Team page and all clinic settings.",
          "Staff/Admin — full access except Team page.",
          "Doctor — doctor portal only.",
        ],
      },
      {
        heading: "Inviting a team member",
        bullets: [
          "Click Invite.",
          "Enter their email and select their role.",
          "They receive an email invitation with login instructions.",
        ],
      },
      {
        heading: "Security rules",
        bullets: [
          "Never share passwords.",
          "Use reset password if someone forgets.",
          "Deactivate accounts immediately when someone leaves.",
          "Only give owner access to people who need it.",
        ],
      },
    ],
    image: "/guide/admin-team.png",
    imageAlt: "Team page with staff account list",
    imagePlaceholder: "Screenshot: Team page with staff account list",
    imageCaption: "Owner-only — manage admin, staff, and doctor logins.",
    placeholderCompact: true,
    href: "/admin/team",
  },
  {
    id: "admin-ai",
    title: "AI Assistant",
    subtitle: "Voice booking statistics",
    roles: ["admin"],
    description: "The AI Assistant page shows how the AI phone booking system is performing.",
    blocks: [
      {
        heading: "What you see",
        bullets: [
          "Total calls today.",
          "How many calls resulted in a booking.",
          "How many calls were dropped or failed.",
          "Recent call log with outcomes.",
        ],
      },
      {
        heading: "Call log",
        bullets: [
          "Call time.",
          "Caller phone number.",
          "Outcome (booked, disconnected, failed).",
          "Transcript of what was said.",
        ],
      },
      {
        heading: "Use this page to",
        bullets: [
          "Monitor if the AI is working correctly.",
          "See what patients are calling about.",
          "Identify patterns in failed calls.",
          "Share data with your developer if something seems wrong.",
        ],
      },
      {
        heading: "Note",
        bullets: [
          "The AI handles new bookings, cancellations, and rescheduling by phone automatically.",
          "It uses the services and availability already set up in your system.",
        ],
      },
    ],
    image: "/guide/admin-ai.png",
    imageAlt: "AI assistant page with call stats and call log",
    imagePlaceholder: "Screenshot: AI assistant page with call stats and recent call log",
    imageCaption: "Voice booking performance and transcripts.",
    placeholderCompact: true,
    href: "/admin/ai",
  },
  {
    id: "admin-settings",
    title: "Settings",
    subtitle: "Clinic profile and integrations",
    roles: ["admin"],
    description: "Settings has three tabs: Clinic Profile, Hours, and Integrations.",
    blocks: [
      {
        heading: "Clinic profile tab",
        bullets: [
          "Update clinic name, address, phone, and email.",
          "This information appears on printed bills and patient receipts — keep it accurate.",
        ],
      },
      {
        heading: "Hours tab",
        bullets: [
          "Set business hours for each day of the week.",
          "Hours affect public booking availability and what the AI voice assistant tells callers.",
        ],
      },
      {
        heading: "Integrations tab",
        bullets: [
          "Square payment connection status.",
          "Test your Square Terminal connection.",
          "Other integration settings.",
        ],
      },
      {
        heading: "Important",
        bullets: [
          "After changing settings, refresh the booking site to confirm changes are visible.",
          "Coordinate Twilio and voice settings changes with your developer before making changes.",
        ],
      },
    ],
    image: "/guide/admin-settings.png",
    imageAlt: "Settings page showing clinic profile tab",
    imagePlaceholder: "Screenshot: Settings page showing clinic profile tab",
    imageCaption: "Clinic profile, hours, and payment integrations.",
    placeholderCompact: true,
    href: "/admin/settings",
  },
  {
    id: "admin-workflow",
    title: "Daily front desk workflow",
    subtitle: "Recommended order of operations",
    roles: ["admin"],
    blocks: [
      {
        heading: "Morning (before clinic opens)",
        bullets: [
          "Open the Dashboard — check today's appointment volume.",
          "Open the Schedule — confirm all appointments are correct.",
          "Make sure the kiosk tablet is on and showing the kiosk page.",
        ],
      },
      {
        heading: "When patients arrive",
        bullets: [
          "Patient uses the kiosk to check in, OR you check them in from the Schedule.",
          "Their doctor sees them as ready on their dashboard.",
          "Doctor starts the visit.",
        ],
      },
      {
        heading: "After each visit",
        bullets: [
          "Doctor completes the visit in their portal.",
          "Patient comes to front desk to pay.",
          "Find the invoice in Billing OR it appears as a notification.",
          "Take payment (card reader, card on file, payment link, or credit).",
          "Print or email receipt if requested.",
        ],
      },
      {
        heading: "End of day",
        bullets: [
          "Check Billing for any unpaid invoices.",
          "Note the outstanding balance total.",
          "Check Dashboard for final revenue total.",
          "Log out of all devices.",
        ],
      },
      {
        heading: "Common tasks — quick reference",
        bullets: [
          "Add a new patient: Patients → Add Patient.",
          "Book manually: Schedule → click empty slot → fill form.",
          "Check in a walk-in: Schedule → find appointment → Check In.",
          "Reprint an old bill: Billing → search by patient or date → Print.",
          "Add patient credit: Patients → open patient → Add Credit.",
          "Block online booking: Booking Blocks → Add Block → select date.",
        ],
      },
    ],
    image: "/guide/admin-workflow.png",
    imageAlt: "Admin schedule with check-in action",
    imagePlaceholder: "Screenshot: Admin schedule with check-in action highlighted",
    imageCaption: "Example: manual check-in from the schedule.",
    placeholderCompact: true,
    href: "/admin/schedule",
  },
    {
    id: "doctor-welcome",
    title: "Welcome to your portal",
    roles: ["doctor"],
    description:
      "Relief Chiropractic uses this app for your daily workflow — patients, schedule, visits, billing, and records.",
    bullets: [
      "Sign in at book.reliefchiropractic.net/auth/sign-in with the email and password your admin gave you.",
      "Install as an app on your phone or iPad: tap Share → Add to Home Screen (iPhone) or use the install icon in Chrome (Android).",
      "The bell icon (top right) shows alerts for new check-ins and schedule changes.",
      "Always log out when using a shared device.",
      "If something looks wrong, refresh the page. Contact your admin if the problem continues.",
    ],
    image: "/guide/doctor-welcome.png",
    imageAlt: "Sign-in page for the doctor portal",
    imagePlaceholder: "Screenshot: Sign-in page at /auth/sign-in",
    href: "/auth/sign-in",
    imageCaption: "Staff sign-in — use the email and password your admin gave you.",
  },
  {
    id: "doctor-dashboard",
    title: "My Dashboard",
    subtitle: "Your daily command center",
    roles: ["doctor"],
    description: "The dashboard is where you run your day. It opens on today's date automatically.",
    image: "/guide/doctor-dashboard.png",
    imageAlt: "Doctor dashboard showing today's appointment list with action buttons",
    imagePlaceholder: "Screenshot: Doctor dashboard — appointment list with action buttons",
    imageLayout: "portrait",
    href: "/doctor/dashboard",
    imageCaption: "Today's list — check in, start visit, complete, and collect payment from each row.",
    blocks: [
      {
        heading: "Viewing a different day",
        bullets: [
          "Use the date picker at the top to jump to any day.",
          "Your appointment list and stats update for the selected date.",
        ],
      },
      {
        heading: "Your daily stats",
        bullets: [
          "Checked in — patients who have arrived.",
          "In consultation — visits in progress.",
          "Awaiting payment — completed, not yet paid.",
          "Completed — fully done for the day.",
          "No shows and cancellations.",
        ],
      },
      {
        heading: "Your appointment list",
        bullets: [
          "Each row shows patient name, appointment time, service booked, and current status.",
          "Actions on each row depend on the appointment status.",
        ],
      },
      {
        heading: "Before patient arrives",
        bullets: [
          "Reschedule — move to a different time.",
          "Cancel — remove the appointment.",
          "No-show — mark as did not attend.",
          "Book next visit — schedule a follow-up.",
        ],
      },
      {
        heading: "When patient arrives (checked in)",
        bullets: [
          "Start Visit — begins the consultation.",
          "The patient must be checked in first (via kiosk or staff check-in).",
        ],
      },
      {
        heading: "During visit (in consultation)",
        bullets: [
          "Reason for visit — what the patient says.",
          "Chart / SOAP notes — your clinical notes.",
          "Handoff notes — visible to other providers.",
          "Diagnosis field.",
          "Billable services — select what was done.",
          "Professional discount — apply if needed.",
          "Complete Visit — finishes the visit.",
        ],
      },
      {
        heading: "After visit (awaiting payment)",
        bullets: [
          "Edit Billing — change services before payment.",
          "Charge saved card on file.",
          "Square Terminal — sends payment to the card reader.",
          "Square POS — opens the iPad POS app.",
          "Payment link — send to the patient by text or email.",
          "Apply patient credit — use existing balance.",
          "Preview Bill — see the invoice before charging.",
          "Print Bill — after payment is complete.",
        ],
      },
      {
        heading: "Invoice search",
        bullets: [
          "At the bottom of the dashboard, search old invoices by patient name, invoice number, or date.",
          "Use this to reprint a bill from any previous visit.",
        ],
      },
    ],
  },
  {
    id: "doctor-schedule",
    title: "My Schedule",
    subtitle: "Your personal calendar",
    roles: ["doctor"],
    description: "Your schedule shows only your appointments — filtered to your provider account.",
    image: "/guide/doctor-schedule.png",
    imageAlt: "My Schedule week view with Day, Week, Month controls and appointment blocks",
    imagePlaceholder: "Screenshot: My Schedule — week view with appointment blocks",
    imageLayout: "portrait",
    href: "/doctor/schedule",
    imageCaption: "Week view — click a block to open the appointment panel.",
    blocks: [
      {
        heading: "Views",
        bullets: [
          "Switch between Day, Week, and Month using the buttons at the top.",
          "Use the arrows to navigate between periods.",
          "Click Today to jump back to today.",
        ],
      },
      {
        heading: "Reading the calendar",
        bullets: [
          "Each block shows patient name and time.",
          "Click any appointment to open the side panel with full details.",
        ],
      },
      {
        heading: "Appointment side panel",
        bullets: [
          "See patient contact details.",
          "Read or write handoff / chart notes.",
          "Check in the patient.",
          "Start the visit (if checked in).",
          "Reschedule the appointment.",
          "Book next visit.",
          "Cancel or mark no-show.",
        ],
      },
      {
        heading: "Booking from an open slot",
        bullets: [
          "Click any empty time slot on the calendar to open the booking form.",
          "Fill in patient, service, and provider, then confirm to add it to the schedule.",
        ],
      },
      {
        heading: "Google Calendar sync",
        bullets: [
          "Connect your personal Google Calendar to see clinic appointments alongside your other events.",
          "Go to the side panel → Google Calendar → Connect and follow the prompts.",
          "Once connected, Relief Chiropractic appointments sync automatically.",
          "Click Disconnect at any time to stop syncing.",
        ],
      },
    ],
  },
  {
    id: "doctor-patients",
    title: "Patients",
    subtitle: "Your patient directory",
    roles: ["doctor"],
    description: "The Patients page shows all clinic patients you are authorized to view.",
    image: "/guide/doctor-patients.png",
    imageAlt: "Patient directory with search, filters, and Chart / History links",
    imagePlaceholder: "Screenshot: Patients page — search bar, filters, and patient list",
    href: "/doctor/patients",
    imageCaption: "Search by name or phone; open Chart or History from each row.",
    blocks: [
      {
        heading: "Searching and filtering",
        bullets: [
          "Use the search bar to find by name or phone number.",
          "Filter the list: All patients; Future booking (upcoming appointment); No upcoming; Seen last 30 days; Not seen 6+ months; No visit yet; 0 visits.",
        ],
      },
      {
        heading: "Patient row actions",
        bullets: [
          "Chart — opens the full patient record.",
          "History — opens the visit history list.",
        ],
      },
    ],
  },
  {
    id: "doctor-chart",
    title: "Patient Chart",
    subtitle: "Full record for one patient",
    roles: ["doctor"],
    description: "Open the chart from Patients → Chart or by clicking a patient name anywhere in the app.",
    image: "/guide/doctor-chart.png",
    imageAlt: "Patient chart with demographics, visit history, and print options",
    imagePlaceholder: "Screenshot: Patient chart — demographics and visit history",
    imageLayout: "portrait",
    href: "/doctor/patients",
    imageCaption: "Full record — demographics, visits, and print patient file.",
    blocks: [
      {
        heading: "What you can see",
        bullets: [
          "Demographics: name, phone, email, date of birth, address.",
          "Visit history list.",
          "Bill preview per visit.",
          "Print patient file.",
        ],
      },
      {
        heading: "Editing patient information",
        bullets: [
          "You can edit clinical fields when you have full clinical access for that patient.",
          "Identity fields (name, phone, email) can only be edited by admin.",
        ],
      },
      {
        heading: "Chart notes and handoff",
        bullets: [
          "After starting a visit you can write reason for visit, SOAP notes (Subjective, Objective, Assessment, Plan), and handoff notes visible to other providers.",
        ],
      },
      {
        heading: "Visit history",
        bullets: [
          "See every past visit with date, service, provider, bill amount, and payment status.",
          "Click any visit to see bill details and reprint if needed.",
        ],
      },
    ],
  },
  {
    id: "doctor-analytics",
    title: "Analytics",
    subtitle: "Your personal performance stats",
    roles: ["doctor"],
    description: "The Analytics page shows how your practice is performing.",
    image: "/guide/doctor-analytics.png",
    imageAlt: "My analytics with today stats, monthly KPIs, outreach lists, and session chart",
    imagePlaceholder: "Screenshot: Analytics — monthly stats, needs-attention lists, weekly chart",
    imageLayout: "portrait",
    href: "/doctor/analytics",
    imageCaption: "KPIs, patients needing outreach, and the weekly sessions chart.",
    blocks: [
      {
        heading: "Today at a glance",
        bullets: [
          "Total patients scheduled today.",
          "Completed so far.",
          "Remaining.",
          "Next patient coming up and time until.",
        ],
      },
      {
        heading: "Your monthly stats",
        bullets: [
          "Total patients seen this month.",
          "New patients this month.",
          "Sessions completed.",
          "No-show rate.",
        ],
      },
      {
        heading: "Patients needing attention",
        bullets: [
          "Missed 2+ sessions in a row — patients who may be at risk of discharge. Use Schedule to book them in.",
          "Completing program soon — within 2 sessions of finishing. Check in about next steps.",
          "No upcoming session scheduled — use Schedule to book them.",
        ],
      },
      {
        heading: "Weekly sessions chart",
        bullets: [
          "Bar chart of sessions per week for the last 8 weeks.",
          "Shows completed vs cancelled / no-show.",
        ],
      },
    ],
  },
  {
    id: "doctor-kiosk",
    title: "Patient check-in kiosk",
    subtitle: "For the front desk tablet",
    roles: ["doctor"],
    description:
      "The kiosk is a self-service check-in screen at the front desk. URL: book.reliefchiropractic.net/kiosk",
    image: "/guide/doctor-kiosk.png",
    imageAlt: "Kiosk check-in screen with phone number entry",
    imagePlaceholder: "Screenshot: Kiosk check-in — phone lookup and confirm screen",
    href: "/kiosk",
    imageCaption: "Front-desk tablet — patient enters the phone number used when booking.",
    blocks: [
      {
        heading: "How it works",
        bullets: [
          "Patient enters the phone number they used when booking.",
          "System finds their appointment for today.",
          "Patient confirms and checks in.",
          "Your dashboard updates to show them as checked in.",
          "You can then click Start Visit.",
        ],
      },
      {
        heading: "Tips",
        bullets: [
          "Bookmark the kiosk page on the tablet for one-tap access.",
          "The kiosk only shows today's appointments.",
          "If a patient cannot check in: wrong phone number, no appointment today, appointment cancelled — check the admin schedule to help them.",
        ],
      },
    ],
  },
  {
    id: "doctor-payments",
    title: "Taking payments",
    subtitle: "After completing a visit",
    roles: ["doctor"],
    description: "After you complete a visit, the payment panel appears automatically.",
    image: "/guide/doctor-payments.png",
    imageAlt: "Payment panel with Square Terminal, saved card, and bill preview options",
    imagePlaceholder: "Screenshot: Payment panel after Complete Visit — Terminal, card, preview bill",
    imageLayout: "portrait",
    href: "/doctor/dashboard",
    imageCaption: "After Complete Visit — charge card, Terminal, POS, or send a payment link.",
    blocks: [
      {
        heading: "Payment options",
        bullets: [
          "Saved card on file — if the patient has a card from online booking, charge with one tap. Confirm the amount and tap Charge.",
          "Square Terminal (card reader) — tap Use Card Reader. Payment goes to the Square Terminal at the front desk. Patient taps or inserts their card. Receipt prints automatically. Status updates on your screen when complete.",
          "Square POS (iPad) — opens Square Point of Sale on the front-desk iPad. Complete payment there.",
          "Payment link — sends a text or email link to pay online. Useful if the patient leaves without paying in person.",
          "Patient credit — apply an existing balance from overpayment or refund toward this visit.",
        ],
      },
      {
        heading: "Previewing and printing bills",
        bullets: [
          "Preview Bill — see the invoice before charging to confirm everything is correct.",
          "Print Bill — prints the invoice after payment is complete.",
        ],
      },
      {
        heading: "Editing billing before payment",
        bullets: [
          "If services were entered wrong, the visit status will be Awaiting Payment.",
          "Click Edit Billing to change services before taking payment.",
          "Once paid, the invoice cannot be edited.",
        ],
      },
    ],
  },
  {
    id: "doctor-tips",
    title: "Tips and shortcuts",
    roles: ["doctor"],
    image: "/guide/doctor-tips.png",
    imageAlt: "Doctor portal sidebar and notification bell",
    imagePlaceholder: "Screenshot: Sidebar navigation and notification bell with alerts",
    imageCaption: "Sidebar links and the bell for check-ins and schedule alerts.",
    blocks: [
      {
        heading: "Notifications",
        bullets: [
          "The bell shows alerts for patient check-in, schedule changes from admin, and new appointments.",
          "Click the bell to see all alerts. Mark as read by clicking each one.",
        ],
      },
      {
        heading: "Install as an app",
        bullets: [
          "iPhone / iPad: Share → Add to Home Screen.",
          "Android / Chrome: install icon in the address bar.",
          "Gives a full-screen app icon without the browser bar.",
        ],
      },
      {
        heading: "Google Calendar",
        bullets: [
          "Connect once and your schedule syncs automatically.",
          "My Schedule → Google Calendar panel → Connect.",
          "Works with personal Gmail or Google Workspace.",
        ],
      },
      {
        heading: "Common issues",
        bullets: [
          "Patient not on dashboard today — check the date is today; patient may not be checked in; appointment may be under another provider.",
          "Cannot start visit — patient must be checked in first; use Check In on the row or the kiosk.",
          "Terminal payment not working — check the terminal is on; try payment link; contact admin if the terminal is offline.",
        ],
      },
    ],
  },
];

function sectionAnchorLabel(title: string) {
  return title.replace(/^Admin — /, "");
}

function sectionHasVisual(s: ManualSection) {
  return Boolean(s.image || s.imagePlaceholder);
}

type TocItem = { id: string; label: string };

function GuideSectionCard({
  section,
  figureIndex,
}: {
  section: ManualSection;
  figureIndex?: number;
}) {
  const showVisual = sectionHasVisual(section);
  const stackImageBelow = section.placeholderCompact === true;
  const figureLabel =
    figureIndex != null && (section.imageCaption || section.image)
      ? `Figure ${figureIndex} — ${section.title}`
      : undefined;

  return (
    <Card
      id={section.id}
      size="sm"
      className="scroll-mt-28 border-border/90 py-4 shadow-md shadow-black/[0.05] sm:py-5"
    >
      <CardHeader className="border-b border-border/60 bg-muted/30 px-4 sm:px-5 [.border-b]:pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-xl font-semibold sm:text-[1.35rem]">{section.title}</CardTitle>
            {section.subtitle ? (
              <p className="mt-0.5 text-[15px] font-medium text-muted-foreground sm:text-base">{section.subtitle}</p>
            ) : null}
          </div>
          {section.href ? (
            <Link
              href={section.href}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#16a349]/35 bg-[#ecfdf5] px-3 py-1.5 text-sm font-semibold text-[#0d5c2e] transition hover:bg-[#d1fae5]"
            >
              Open this page
              <IconArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
        {section.description ? (
          <CardDescription className="mt-2 text-[15px] leading-relaxed sm:text-base">{section.description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="px-4 pt-4 sm:px-5 sm:pt-5">
        {stackImageBelow ? (
          <div className="space-y-4">
            <ManualSectionBody section={section} />
            {showVisual ? (
              <figure className="m-0 w-full">
                <GuideScreenshot
                  src={section.image}
                  alt={section.imageAlt || section.imagePlaceholder || section.title}
                  placeholderLabel={section.imagePlaceholder}
                  layout={section.imageLayout}
                  figureLabel={figureLabel}
                  caption={section.imageCaption}
                  placeholderCompact
                />
              </figure>
            ) : null}
          </div>
        ) : (
          <div
            className={
              showVisual ? "flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6 xl:gap-8" : "space-y-4"
            }
          >
            <div className={showVisual ? "min-w-0 flex-1 space-y-4" : "space-y-4"}>
              <ManualSectionBody section={section} />
            </div>
            {showVisual ? (
              <figure
                className={
                  section.imageLayout === "portrait"
                    ? "m-0 w-full shrink-0 lg:max-w-[min(48%,18rem)] xl:max-w-[min(44%,22rem)]"
                    : "m-0 w-full shrink-0 lg:max-w-[min(46%,20rem)] xl:max-w-[min(42%,26rem)]"
                }
              >
                <GuideScreenshot
                  src={section.image}
                  alt={section.imageAlt || section.imagePlaceholder || section.title}
                  placeholderLabel={section.imagePlaceholder}
                  layout={section.imageLayout}
                  figureLabel={figureLabel}
                  caption={section.imageCaption}
                />
              </figure>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DoctorGuideHero() {
  return (
    <div className="rounded-2xl border border-[#16a349]/25 bg-gradient-to-br from-[#ecfdf5] via-white to-white px-4 py-5 shadow-sm sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#16a349]">Doctor portal</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">User guide</h2>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            Step-by-step help for your daily workflow — dashboard, schedule, patients, billing, and check-in.
          </p>
        </div>
        <p className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
          ~8 min read
        </p>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {DOCTOR_QUICK_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-[#16a349]/40 hover:bg-[#ecfdf5] hover:text-[#0d5c2e]"
            >
              <Icon className="h-4 w-4 text-[#16a349]" />
              {link.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function DoctorDailyWorkflow() {
  return (
    <Card id={DOCTOR_WORKFLOW_ID} className="scroll-mt-28 border-[#16a349]/20 bg-gradient-to-br from-white to-[#ecfdf5]/40 py-4 shadow-md sm:py-5">
      <CardHeader className="px-4 pb-2 sm:px-5">
        <CardTitle className="text-xl font-semibold sm:text-[1.35rem]">Daily workflow</CardTitle>
        <CardDescription className="text-[15px] sm:text-base">
          Recommended order for a typical patient visit — start here each morning.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 sm:px-5">
        <ol className="grid gap-3 sm:grid-cols-2">
          {DOCTOR_DAILY_WORKFLOW.map((item) => (
            <li
              key={item.step}
              className="flex gap-3 rounded-xl border border-[#16a349]/15 bg-white/90 px-3 py-3 shadow-sm"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#16a349] text-sm font-bold text-white">
                {item.step}
              </span>
              <span className="pt-0.5 text-[15px] leading-snug text-foreground sm:text-base">{item.text}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function DoctorGuideToc({
  items,
  activeId,
  onNavigate,
}: {
  items: TocItem[];
  activeId: string;
  onNavigate?: (id: string) => void;
}) {
  return (
    <nav aria-label="Guide sections" className="manual-prose">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">On this page</p>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = activeId === item.id;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                onClick={() => onNavigate?.(item.id)}
                className={cn(
                  "block rounded-lg border-l-[3px] py-2 pl-3 pr-2 text-sm font-medium leading-snug transition",
                  active
                    ? "border-[#16a349] bg-[#ecfdf5] text-[#0d5c2e]"
                    : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-foreground",
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function DoctorPortalManual({ sections }: { sections: ManualSection[] }) {
  const [activeId, setActiveId] = useState(DOCTOR_WORKFLOW_ID);
  const observeIds = useRef<string[]>([]);

  const tocItems: TocItem[] = [
    { id: DOCTOR_WORKFLOW_ID, label: "Daily workflow" },
    ...sections.map((s) => ({ id: s.id, label: sectionAnchorLabel(s.title) })),
  ];

  useEffect(() => {
    const ids = [DOCTOR_WORKFLOW_ID, ...sections.map((s) => s.id)];
    observeIds.current = ids;
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el != null);
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (!visible.length) return;
        const topmost = visible.reduce((best, entry) =>
          entry.boundingClientRect.top < best.boundingClientRect.top ? entry : best,
        );
        if (topmost.target.id) setActiveId(topmost.target.id);
      },
      { rootMargin: "-15% 0px -60% 0px", threshold: [0, 0.05, 0.15] },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  let figureCounter = 0;

  return (
    <div className="w-full space-y-5 pb-6">
      <DoctorGuideHero />

      {/* Mobile TOC — horizontal scroll */}
      <div className="sticky top-[3.25rem] z-20 -mx-1 rounded-xl border border-border/80 bg-background/95 px-2 py-2 shadow-sm backdrop-blur-md lg:hidden">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tocItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                activeId === item.id
                  ? "bg-[#16a349] text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200",
              )}
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8 xl:gap-10">
        <aside className="hidden w-52 shrink-0 lg:block xl:w-56">
          <div className="sticky top-24 rounded-xl border border-border/80 bg-card/95 px-3 py-4 shadow-sm backdrop-blur-sm">
            <DoctorGuideToc items={tocItems} activeId={activeId} />
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          <DoctorDailyWorkflow />
          <div className="stagger-children space-y-4">
            {sections.map((s) => {
              const figureIndex = sectionHasVisual(s) ? ++figureCounter : undefined;
              return <GuideSectionCard key={s.id} section={s} figureIndex={figureIndex} />;
            })}
          </div>
        </div>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Public booking:{" "}
        <Link href="/" className="font-medium text-primary underline-offset-4 hover:underline">
          open booking site
        </Link>
        {" · "}
        Kiosk check-in:{" "}
        <Link href="/kiosk" className="font-medium text-primary underline-offset-4 hover:underline">
          /kiosk
        </Link>
      </p>
    </div>
  );
}

function AdminGuideHero() {
  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-card px-4 py-5 shadow-sm sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Admin portal</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">User guide</h2>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            Front desk and owner help — schedule, patients, billing, kiosk, team, and settings.
          </p>
        </div>
        <p className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
          ~12 min read
        </p>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {ADMIN_QUICK_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            >
              <Icon className="h-4 w-4 text-primary" />
              {link.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function AdminPortalManual({ sections }: { sections: ManualSection[] }) {
  let figureCounter = 0;

  return (
    <div className="w-full space-y-5 pb-6">
      <AdminGuideHero />

      <div className="manual-prose rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] via-card to-card px-3 py-3 sm:px-4 sm:py-4">
        <p className="text-[15px] font-medium text-foreground sm:text-base">On this page</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="inline-flex rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10"
              >
                {sectionAnchorLabel(s.title)}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="stagger-children space-y-4">
        {sections.map((s) => {
          const figureIndex = sectionHasVisual(s) ? ++figureCounter : undefined;
          return <GuideSectionCard key={s.id} section={s} figureIndex={figureIndex} />;
        })}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Public booking:{" "}
        <Link href="/" className="font-medium text-primary underline-offset-4 hover:underline">
          open booking site
        </Link>
        {" · "}
        Kiosk check-in:{" "}
        <Link href="/kiosk" className="font-medium text-primary underline-offset-4 hover:underline">
          /kiosk
        </Link>
      </p>
    </div>
  );
}

export function PortalManual({ role }: { role: PortalRole }) {
  const sections = SECTIONS.filter((s) => s.roles.includes(role));
  if (role === "doctor") {
    return <DoctorPortalManual sections={sections} />;
  }
  return <AdminPortalManual sections={sections} />;
}
