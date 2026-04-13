"use client";

import { useAppFeedback } from "@/components/app-feedback";
import { IconArrowRight } from "@/components/icons";
import { Loader } from "@/components/loader";
import { apiPost } from "@/lib/api";
import Link from "next/link";
import { isValidPhoneNumber } from "react-phone-number-input";
import { useState } from "react";

/** Format phone display: US style for 10 digits, international for +prefix */
function formatPhoneDisplay(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const hasPlus = phone.trim().startsWith("+");
  if (digits.length <= 10 && !hasPlus) {
    const pad = (s: string, len: number, ch: string) => (s + ch.repeat(Math.max(0, len - s.length))).slice(0, len);
    return `(${pad(digits.slice(0, 3), 3, "_")}) ${pad(digits.slice(3, 6), 3, "_")}-${pad(digits.slice(6, 10), 4, "_")}`;
  }
  if (hasPlus && digits.length > 0) return `+${digits}`;
  return digits || "___";
}

/** Build E.164 string for validation */
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 10) return `+${digits}`;
  return "";
}

export default function KioskPage() {
  const { runWithFeedback } = useAppFeedback();
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("");
  const [checkingIn, setCheckingIn] = useState(false);

  const append = (char: string) => {
    if (char === "+") {
      setPhone((prev) => (prev.startsWith("+") ? prev : `+${prev.replace(/\D/g, "")}`));
      return;
    }
    setPhone((prev) => {
      const digits = prev.replace(/\D/g, "");
      const hasPlus = prev.startsWith("+");
      const nextDigits = (digits + char).slice(0, 15);
      return hasPlus ? `+${nextDigits}` : nextDigits;
    });
  };
  const backspace = () =>
    setPhone((prev) => {
      const d = prev.replace(/\D/g, "").slice(0, -1);
      return prev.startsWith("+") ? `+${d}` : d;
    });
  const digits = phone.replace(/\D/g, "");
  const e164 = toE164(phone);
  const isValidPhone = e164 !== "" && isValidPhoneNumber(e164);
  const canCheckIn = isValidPhone && !checkingIn;

  const checkIn = async () => {
    if (!canCheckIn) return;
    setCheckingIn(true);
    setStatus("");
    const ok = await runWithFeedback(
      async () => {
        const lookup = await apiPost<{ appointment_id: number }>("/kiosk/lookup/", { phone: e164 });
        await apiPost("/kiosk/checkin/", { appointment_id: lookup.appointment_id });
      },
      {
        loadingMessage: "Looking up your appointment…",
        successMessage: "You’re checked in. Please have a seat — we’ll call you shortly.",
        errorFallback: "We couldn’t find a visit for this phone today. Please see the front desk.",
      },
    );
    if (ok) setStatus("Check-in successful.");
    else setStatus("");
    setCheckingIn(false);
  };

  return (
    <main className="relative flex min-h-[100dvh] min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#ecfdf5] via-background to-muted/50 px-[max(1rem,env(safe-area-inset-left))] py-10 pr-[max(1rem,env(safe-area-inset-right))] pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, oklch(0.52 0.14 150 / 0.12) 1px, transparent 0)`,
          backgroundSize: "24px 24px",
        }}
        aria-hidden
      />
      <div className="content-fade-in relative z-[1] w-full max-w-lg">
        <div className="overflow-hidden rounded-3xl border border-border/80 bg-card shadow-2xl shadow-primary/10 ring-1 ring-primary/15">
          <div className="h-2 w-full bg-gradient-to-r from-[#16a349] via-[#16a349] to-[#e9982f]" aria-hidden />
          <div className="space-y-6 px-6 pb-8 pt-7 text-center sm:px-10 sm:pb-10 sm:pt-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Check-in</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#e9982f] sm:text-4xl">Relief Chiropractic</h1>
              <p className="mt-3 text-lg font-semibold text-foreground">Welcome — we’re glad you’re here</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Enter the <span className="font-medium text-foreground">phone number</span> on your appointment. We’ll look up today’s visit only.
              </p>
            </div>

            <div className="rounded-2xl border-2 border-primary/20 bg-muted/40 px-4 py-5 font-mono text-2xl tracking-widest text-foreground shadow-inner sm:text-3xl">
              {formatPhoneDisplay(phone)}
            </div>

            <div className="grid grid-cols-3 gap-3 sm:gap-3.5">
              {"123456789".split("").map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => append(digit)}
                  className="kiosk-key flex min-h-14 items-center justify-center rounded-2xl bg-background text-2xl font-semibold text-foreground shadow-sm ring-1 ring-border/90 transition hover:bg-primary/10 hover:ring-primary/30 active:scale-[0.97] sm:min-h-16 sm:text-3xl"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => append("+")}
                className="kiosk-key flex min-h-14 items-center justify-center rounded-2xl bg-background text-lg font-semibold text-muted-foreground shadow-sm ring-1 ring-border/90 transition hover:bg-primary/10 active:scale-[0.97] sm:min-h-16"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => append("0")}
                className="kiosk-key flex min-h-14 items-center justify-center rounded-2xl bg-background text-2xl font-semibold text-foreground shadow-sm ring-1 ring-border/90 transition hover:bg-primary/10 active:scale-[0.97] sm:min-h-16 sm:text-3xl"
              >
                0
              </button>
              <button
                type="button"
                onClick={backspace}
                aria-label="Delete last digit"
                className="kiosk-key flex min-h-14 items-center justify-center rounded-2xl bg-background text-sm font-semibold text-muted-foreground shadow-sm ring-1 ring-border/90 transition hover:bg-destructive/10 hover:text-destructive active:scale-[0.97] sm:min-h-16 sm:text-base"
              >
                Delete
              </button>
            </div>

            <button
              type="button"
              onClick={checkIn}
              disabled={!canCheckIn}
              className="flex w-full min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#16a349] px-4 text-lg font-semibold text-white shadow-lg shadow-[#16a349]/25 transition hover:bg-[#13823d] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-16 sm:text-xl"
            >
              {checkingIn ? (
                <Loader variant="spinner" label="Checking in…" />
              ) : (
                <>
                  Check in
                  <IconArrowRight className="h-6 w-6" />
                </>
              )}
            </button>

            {digits.length >= 10 && !isValidPhone && !checkingIn && (
              <p className="text-sm font-medium text-destructive">Please enter a valid phone number.</p>
            )}
            {status ? <p className="animate-fade-in text-sm font-medium text-foreground">{status}</p> : null}

            <p className="border-t border-border/70 pt-5 text-sm leading-relaxed text-muted-foreground">
              Need to book first?{" "}
              <Link href="/" className="font-semibold text-primary underline-offset-4 hover:underline">
                Book online
              </Link>{" "}
              — then you can check in here on the day of your visit.
            </p>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">Having trouble? Our front desk can check you in.</p>
      </div>
    </main>
  );
}
