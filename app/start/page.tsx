import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Portal menu",
  description: "Book online or open reception check-in at Relief Chiropractic.",
};

/**
 * Public menu: booking and check-in only. Staff use the sign-in URL shared internally (not linked here).
 */
export default function PortalStartPage() {
  return (
    <main className="min-h-[100dvh] min-h-screen bg-gradient-to-b from-background via-[#ecfdf5]/30 to-background px-[max(1rem,env(safe-area-inset-left))] py-10 pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Relief Chiropractic</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#e9982f] sm:text-4xl">Choose where to go</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            Pick the option that matches what you need. You can bookmark this page on phones or tablets for quick access.
          </p>
        </div>

        <ul className="flex flex-col gap-4">
          <li>
            <Link
              href="/"
              className="block rounded-2xl border-2 border-primary/25 bg-card p-5 shadow-sm ring-1 ring-primary/10 transition hover:border-[#16a349]/50 hover:bg-primary/[0.04] hover:shadow-md sm:p-6"
            >
              <span className="text-lg font-bold text-foreground">Book or reschedule online</span>
              <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">
                For anyone scheduling a visit — new appointments, changes, or choosing a time.
              </span>
              <span className="mt-3 inline-flex text-sm font-semibold text-[#16a349]">Open booking →</span>
            </Link>
          </li>
          <li>
            <Link
              href="/kiosk"
              className="block rounded-2xl border-2 border-[#16a349]/35 bg-gradient-to-br from-[#ecfdf5]/80 to-card p-5 shadow-sm transition hover:border-[#16a349] hover:shadow-md sm:p-6"
            >
              <span className="text-lg font-bold text-[#0d5c2e]">Check-in (reception tablet)</span>
              <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">
                For the day of your visit: enter the phone number on your appointment. Front desk can keep this screen
                open on a tablet.
              </span>
              <span className="mt-3 inline-flex text-sm font-semibold text-[#16a349]">Open check-in →</span>
            </Link>
          </li>
        </ul>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Tip: bookmark <span className="font-mono text-foreground">/start</span> or <span className="font-mono text-foreground">/kiosk</span> on the
          front-desk tablet.
        </p>
      </div>
    </main>
  );
}
