"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageIntro } from "@/components/admin-shell";
import { DoctorPageIntro } from "@/components/doctor-shell";

export type PortalRole = "admin" | "doctor";

type ManualSection = {
  id: string;
  title: string;
  roles: PortalRole[];
  description?: string;
  bullets: string[];
  tip?: string;
};

const SECTIONS: ManualSection[] = [
  {
    id: "overview",
    title: "Welcome to your portal",
    roles: ["admin", "doctor"],
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
    roles: ["admin", "doctor"],
    description:
      "The kiosk is a simple check-in screen for patients who already have an appointment today. It does not replace the public booking website.",
    bullets: [
      "Open the kiosk URL on a tablet at the front desk (same site as booking, path /kiosk).",
      "The patient enters the phone number used when they booked (same format as on file: usually10 digits or +1…).",
      "The system looks up an appointment for today only — not tomorrow or last week.",
      "After check-in, the visit shows as checked in for staff; the assigned doctor may get an SMS if alerts are configured.",
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
      "Use this page to spot who is checked in and what still needs attention.",
    ],
  },
  {
    id: "admin-schedule",
    title: "Admin — Schedule",
    roles: ["admin"],
    bullets: [
      "View and manage appointments by day.",
      "You can mark a patient as checked in from here (same action as the kiosk) when someone walks in without using the tablet.",
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
    id: "doctor-dashboard",
    title: "Doctor — My dashboard",
    roles: ["doctor"],
    bullets: [
      "See today’s patients, who checked in, and start visits from your queue when you are ready.",
      "Checked in means the patient arrived (kiosk or staff) — then you can begin the visit flow the app provides.",
    ],
  },
  {
    id: "doctor-schedule",
    title: "Doctor — My schedule",
    roles: ["doctor"],
    bullets: [
      "Your personal calendar of appointments.",
      "Use it to prepare between rooms; changes from admin may appear after refresh.",
    ],
  },
  {
    id: "doctor-patients",
    title: "Doctor — Patient directory",
    roles: ["doctor"],
    bullets: [
      "Look up patients you are allowed to see under your clinic’s rules.",
      "Use notifications to learn when someone checked in or when the schedule changes.",
    ],
  },
];

export function PortalManual({ role }: { role: PortalRole }) {
  const sections = SECTIONS.filter((s) => s.roles.includes(role));
  const intro =
    role === "admin" ? (
      <AdminPageIntro
        title="User guide"
        description="How to use the admin portal: schedules, patients, billing, and clinic settings. Keep this page bookmarked for training new staff."
      />
    ) : (
      <DoctorPageIntro
        eyebrow="Help"
        title="User guide"
        description="How to use your doctor portal: dashboard, schedule, patients, and how the check-in kiosk fits into your day."
      />
    );

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-8">
      {intro}

      <div className="manual-prose rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] via-card to-card px-4 py-4 sm:px-5 sm:py-5">
        <p className="text-sm font-medium text-foreground">On this page</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="inline-flex rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10"
              >
                {s.title.replace(/^Admin — |^Doctor — /, "")}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="stagger-children space-y-5">
        {sections.map((s) => (
          <Card key={s.id} id={s.id} className="scroll-mt-24 border-border/90 shadow-md shadow-black/[0.05]">
            <CardHeader className="border-b border-border/60 bg-muted/30">
              <CardTitle className="text-lg">{s.title}</CardTitle>
              {s.description ? <CardDescription className="text-base leading-relaxed">{s.description}</CardDescription> : null}
            </CardHeader>
            <CardContent className="pt-5">
              <ul className="manual-prose list-inside list-disc space-y-2 text-sm leading-relaxed text-foreground marker:text-primary">
                {s.bullets.map((b, i) => (
                  <li key={`${s.id}-${i}`}>{b}</li>
                ))}
              </ul>
              {s.tip ? (
                <p className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
                  <span className="font-semibold">Tip: </span>
                  {s.tip}
                </p>
              ) : null}
            </CardContent>
          </Card>
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
