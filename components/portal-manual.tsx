"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageIntro } from "@/components/admin-shell";
import { IconArrowRight, IconCalendar, IconStethoscope, IconUsers } from "@/components/icons";
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

function GuideScreenshotPlaceholder({ label }: { label: string }) {
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
}: {
  src?: string;
  alt: string;
  placeholderLabel?: string;
  layout?: "landscape" | "portrait";
  caption?: string;
  figureLabel?: string;
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
      return <GuideScreenshotPlaceholder label={placeholderLabel} />;
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
          {!loaded ? <GuideScreenshotPlaceholder label={placeholderLabel || alt} /> : null}
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
    id: "overview",
    title: "Welcome to your portal",
    roles: ["admin"],
    description:
      "Relief Chiropractic uses this app for schedules, patients, and day-of operations. Sign in with the email and password your clinic gave you.",
    bullets: [
      "Install this site as an app for quick access: on iPad/iPhone use Share → Add to Home Screen; on Chrome/Edge use the install icon in the address bar (needs HTTPS in production).",
      "Use the bell icon (top right) for in-app alerts — e.g. new bookings or patient check-in.",
      "Log out when you finish on a shared computer.",
      "If something looks wrong, try a refresh; contact your admin if it persists.",
    ],
  },
  {
    id: "kiosk",
    title: "Patient check-in kiosk (tablet)",
    roles: ["admin"],
    description:
      "The kiosk is a simple check-in screen for patients who already have an appointment today. It does not replace the public booking website.",
    bullets: [
      "Open the kiosk URL on a tablet at the front desk (same site as booking, path /kiosk).",
      "The patient enters the phone number used when they booked (same format as on file: usually10 digits or +1…).",
      "The system looks up an appointment for today only — not tomorrow or last week.",
      "After check-in, the visit shows as checked-in for staff; the assigned doctor may get an SMS if alerts are configured.",
      "If lookup fails, the patient may have the wrong number, no visit today, or a cancelled visit — use the front desk or Schedule to help.",
    ],
    tip: "Bookmark the kiosk page in the tablet browser for one-tap access.",
  },
  {
    id: "admin-dashboard",
    title: "Admin — Dashboard & day-at-a-glance",
    roles: ["admin"],
    bullets: [
      "Review today’s volume, arrivals, and quick links to common tasks.",
      "Use this page to spot who has completed check-in and what still needs attention.",
    ],
  },
  {
    id: "admin-schedule",
    title: "Admin — Schedule",
    roles: ["admin"],
    bullets: [
      "View and manage appointments by day.",
      "You can complete check-in for a patient from here (same action as the kiosk) when someone walks in without using the tablet.",
      "Drag or edit according to your clinic’s workflow where the UI allows.",
    ],
  },
  {
    id: "admin-patients",
    title: "Admin — Patients",
    roles: ["admin"],
    bullets: [
      "Search and open patient records, contact info, and visit history as exposed in the UI.",
      "Keep phone numbers accurate — they power SMS reminders and kiosk lookup.",
    ],
  },
  {
    id: "admin-operations",
    title: "Admin — Billing, services, providers, blocks",
    roles: ["admin"],
    bullets: [
      "Invoices & billing: manage charges and payment-related flows your clinic uses.",
      "Services & codes: what can be booked and how it appears publicly.",
      "Doctors & providers: who appears on the schedule and in booking.",
      "Booking blocks: times when online booking should not offer slots.",
    ],
  },
  {
    id: "admin-team",
    title: "Admin — Team & logins (owner)",
    roles: ["admin"],
    description: "Visible only to owner-level admins in the sidebar.",
    bullets: [
      "Invite or manage staff accounts and roles as your clinic policy allows.",
      "Never share passwords; use password reset if someone forgets.",
    ],
  },
  {
    id: "admin-ai-settings",
    title: "Admin — AI assistant & settings",
    roles: ["admin"],
    bullets: [
      "AI assistant: configuration for clinic-wide AI features (when enabled).",
      "Settings: clinic profile, hours, integrations — keep public booking URLs and Twilio/voice settings aligned with production.",
    ],
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

function AdminPortalManual({ sections }: { sections: ManualSection[] }) {
  return (
    <div className="w-full space-y-5 pb-6">
      <AdminPageIntro
        title="User guide"
        description="How to use the admin portal: schedules, patients, billing, and clinic settings. Keep this page bookmarked for training new staff."
      />

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
        {sections.map((s) => (
          <GuideSectionCard key={s.id} section={s} />
        ))}
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
