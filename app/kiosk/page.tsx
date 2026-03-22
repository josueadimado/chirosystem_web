"use client";

import { IconArrowRight } from "@/components/icons";
import { Loader } from "@/components/loader";
import { apiPost } from "@/lib/api";
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
    try {
      const lookup = await apiPost<{ appointment_id: number }>("/kiosk/lookup/", { phone: e164 });
      await apiPost("/kiosk/checkin/", { appointment_id: lookup.appointment_id });
      setStatus("Check-in successful.");
    } catch {
      setStatus("Could not find today’s appointment.");
    } finally {
      setCheckingIn(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="card content-fade-in w-full max-w-md space-y-4 text-center">
        <h1 className="text-5xl font-extrabold text-[#e9982f]">Relief Chiropractic</h1>
        <p className="text-2xl font-semibold">Welcome</p>
        <p className="text-sm text-slate-500">Enter your phone number to check in.</p>
        <div className="rounded-lg border border-slate-200 p-4 text-2xl tracking-widest font-mono text-slate-800">{formatPhoneDisplay(phone)}</div>
        <div className="grid grid-cols-3 gap-2">
          {"123456789".split("").map((digit) => (
            <button key={digit} onClick={() => append(digit)} className="rounded-lg bg-slate-100 p-4 text-xl font-semibold transition hover:bg-slate-200 active:scale-[0.98]">{digit}</button>
          ))}
          <button onClick={() => append("+")} className="rounded-lg bg-slate-100 p-4 text-lg font-semibold text-slate-600 transition hover:bg-slate-200 active:scale-[0.98]">+</button>
          <button onClick={() => append("0")} className="rounded-lg bg-slate-100 p-4 text-xl font-semibold transition hover:bg-slate-200 active:scale-[0.98]">0</button>
          <button onClick={backspace} className="rounded-lg bg-slate-100 p-4 text-xl transition hover:bg-slate-200 active:scale-[0.98]">⌫</button>
        </div>
        <button
          onClick={checkIn}
          disabled={!canCheckIn}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#16a349] px-4 py-4 text-lg font-semibold text-white transition hover:bg-[#13823d] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {checkingIn ? (
            <Loader variant="spinner" label="Checking in…" />
          ) : (
            <>
              Check In
              <IconArrowRight className="h-5 w-5" />
            </>
          )}
        </button>
        {digits.length >= 10 && !isValidPhone && !checkingIn && (
          <p className="text-sm font-medium text-red-600">Please enter a valid phone number.</p>
        )}
        {status && <p className="animate-fade-in text-sm font-medium text-slate-700">{status}</p>}
        <p className="text-sm text-slate-500">
          Haven&apos;t booked yet?{" "}
          <a href="/" className="font-medium text-[#16a349] hover:underline">
            Book your appointment online
          </a>
          {" "}and get confirmation before checking in.
        </p>
      </div>
    </main>
  );
}
