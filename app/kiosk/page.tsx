"use client";

import { useAppFeedback } from "@/components/app-feedback";
import { BrandLogo } from "@/components/brand-logo";
import { IconArrowRight, IconCheck } from "@/components/icons";
import { Loader } from "@/components/loader";
import { ApiError, apiPostPublic } from "@/lib/api";
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

type KioskVisitToday = {
  appointment_id: number;
  start_time_display: string;
  provider: string;
  service_name?: string;
};

type KioskPatientChoice = {
  appointment_id: number;
  appointment_ids?: number[];
  patient: string;
  provider: string;
  start_time_display: string;
  visit_count?: number;
  visits_today?: KioskVisitToday[];
  can_checkin: boolean;
  earliest_checkin_display?: string;
  early_checkin_minutes_before?: number;
};

type KioskLookupOk =
  | {
      result: "choose_patient";
      message: string;
      choices: KioskPatientChoice[];
    }
  | {
      result: "ready";
      appointment_id: number;
      appointment_ids?: number[];
      patient: string;
      provider: string;
      time: string;
      start_time_display?: string;
      status: string;
      visit_count?: number;
      visits_today?: KioskVisitToday[];
      message?: string;
    }
  | {
      result: "too_early";
      message: string;
      appointment_id: number;
      patient: string;
      provider: string;
      start_time_display: string;
      earliest_checkin_display: string;
      early_checkin_minutes_before?: number;
    }
  | {
      result: "wrong_day";
      message: string;
      appointment_date_display: string;
      start_time_display: string;
    }
  | {
      result: "not_found";
      message: string;
    }
  | {
      result: "already_checked_in";
      message: string;
      start_time_display?: string;
    }
  | {
      result: "visit_completed_today";
      message: string;
    }
  | {
      result: "invalid_phone";
      message: string;
    };

/** Lookup outcomes that show a notice card (not ready check-in or name picker). */
type KioskLookupNotice = Exclude<
  KioskLookupOk,
  { result: "ready" } | { result: "choose_patient" }
>;

type NoticeTone = "amber" | "sky" | "rose";

function earlyCheckInDetail(
  startTimeDisplay: string,
  earliestCheckinDisplay?: string,
  minutesBefore?: number,
): string {
  const windowHint =
    minutesBefore != null && minutesBefore > 0
      ? `You can check in up to ${minutesBefore} minutes before your appointment.`
      : "Check-in opens shortly before your appointment.";
  const timeLine = earliestCheckinDisplay
    ? `Appointment at ${startTimeDisplay}. Kiosk check-in opens around ${earliestCheckinDisplay}.`
    : `Appointment at ${startTimeDisplay}.`;
  return `${windowHint} ${timeLine}`;
}

type Notice = {
  tone: NoticeTone;
  icon: string;
  title: string;
  /** One short sentence — what the patient should do next. */
  action: string;
  detail?: string;
};

function lookupToNotice(data: KioskLookupNotice): Notice {
  switch (data.result) {
    case "too_early":
      return {
        tone: "amber",
        icon: "⏰",
        title: "A little early",
        action: "Please wait until check-in opens, or see the front desk if they are ready for you.",
        detail: earlyCheckInDetail(
          data.start_time_display,
          data.earliest_checkin_display,
          data.early_checkin_minutes_before,
        ),
      };
    case "wrong_day":
      return {
        tone: "amber",
        icon: "📅",
        title: "Different day",
        action: "Come back on the day of your appointment, or see the front desk.",
        detail: data.message,
      };
    case "not_found":
      return {
        tone: "rose",
        icon: "📱",
        title: "No appointment found",
        action: "Double-check your cell number, or see the front desk.",
        detail: data.message,
      };
    case "already_checked_in":
      return {
        tone: "sky",
        icon: "✓",
        title: "You're already checked in",
        action: "Please have a seat — we'll call your name when the doctor is ready.",
        detail: data.message,
      };
    case "visit_completed_today":
      return {
        tone: "amber",
        icon: "✓",
        title: "Visit already finished",
        action: "If you need help or another visit, see the front desk.",
        detail: data.message,
      };
    case "invalid_phone":
      return {
        tone: "rose",
        icon: "📱",
        title: "Invalid phone number",
        action: "Enter a valid U.S. cell number, or see the front desk.",
        detail: data.message,
      };
  }
}

function KioskNoticeCard({ notice }: { notice: Notice }) {
  const styles =
    notice.tone === "rose"
      ? "border-rose-300 bg-rose-50 text-rose-950"
      : notice.tone === "sky"
        ? "border-sky-300 bg-sky-50 text-sky-950"
        : "border-amber-300 bg-amber-50 text-amber-950";

  return (
    <div
      className={`rounded-2xl border-2 px-5 py-6 text-center shadow-sm sm:px-6 sm:py-7 ${styles}`}
      role="alert"
    >
      <p className="text-4xl leading-none" aria-hidden>
        {notice.icon}
      </p>
      <p className="mt-4 text-xl font-extrabold sm:text-2xl">{notice.title}</p>
      <p className="mt-3 text-base font-semibold leading-snug sm:text-lg">{notice.action}</p>
      {notice.detail ? (
        <p className="mt-3 text-sm leading-relaxed opacity-90 sm:text-base">{notice.detail}</p>
      ) : null}
      {(notice.tone === "rose" || notice.tone === "amber") && (
        <p className="mt-4 text-sm font-medium sm:text-base">
          <Link href="/" className="text-primary underline-offset-4 hover:underline">
            Book online
          </Link>{" "}
          · front desk
        </p>
      )}
    </div>
  );
}

export default function KioskPage() {
  const { toast } = useAppFeedback();
  const [phone, setPhone] = useState("");
  const [checkingIn, setCheckingIn] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [successPatientName, setSuccessPatientName] = useState("");
  const [successVisitSummary, setSuccessVisitSummary] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [patientChoices, setPatientChoices] = useState<KioskPatientChoice[] | null>(null);
  const [chooseMessage, setChooseMessage] = useState("");

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
  const canCheckIn = isValidPhone && !checkingIn && !successVisible;

  const resetKiosk = () => {
    setPhone("");
    setSuccessVisible(false);
    setSuccessPatientName("");
    setSuccessVisitSummary("");
    setNotice(null);
    setPatientChoices(null);
    setChooseMessage("");
  };

  const formatVisitSummary = (visits: KioskVisitToday[] | undefined, visitCount?: number) => {
    const n = visitCount ?? visits?.length ?? 0;
    if (n <= 1 || !visits?.length) return "";
    const parts = visits.map((v) => {
      const svc = (v.service_name || "").trim();
      const label = svc ? `${svc} at ${v.start_time_display}` : `${v.start_time_display} with ${v.provider}`;
      return label;
    });
    if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
    return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
  };

  const completeCheckIn = async (
    appointmentId: number,
    patientName: string,
    appointmentIds?: number[],
    visitsToday?: KioskVisitToday[],
    visitCount?: number,
  ) => {
    const ids =
      appointmentIds && appointmentIds.length > 0 ? appointmentIds : [appointmentId];
    const out = await apiPostPublic<{
      detail: string;
      checked_in_count?: number;
    }>("/kiosk/checkin/", {
      appointment_ids: ids,
      appointment_id: appointmentId,
      phone: e164,
    });
    setSuccessPatientName(patientName.trim());
    const count = out.checked_in_count ?? ids.length;
    if (count > 1) {
      const summary = formatVisitSummary(visitsToday, count);
      setSuccessVisitSummary(
        summary
          ? `You're checked in for ${count} visits today: ${summary}.`
          : `You're checked in for all ${count} visits scheduled today.`,
      );
    } else {
      setSuccessVisitSummary("");
    }
    setSuccessVisible(true);
    setPatientChoices(null);
    setChooseMessage("");
    toast.success(out.detail || "Check-in complete.");
  };

  const handleLookupResult = async (lookup: KioskLookupOk) => {
    if (lookup.result === "invalid_phone") {
      setPatientChoices(null);
      setChooseMessage("");
      setNotice(lookupToNotice(lookup));
      return;
    }
    if (lookup.result === "choose_patient") {
      setPatientChoices(lookup.choices);
      setChooseMessage(lookup.message);
      setNotice(null);
      return;
    }
    if (lookup.result === "ready") {
      await completeCheckIn(
        lookup.appointment_id,
        lookup.patient,
        lookup.appointment_ids,
        lookup.visits_today,
        lookup.visit_count,
      );
      return;
    }
    setPatientChoices(null);
    setChooseMessage("");
    setNotice(lookupToNotice(lookup));
  };

  const checkIn = async () => {
    if (!canCheckIn) return;
    setCheckingIn(true);
    setNotice(null);
    setPatientChoices(null);
    setChooseMessage("");
    try {
      const lookup = await apiPostPublic<KioskLookupOk>("/kiosk/lookup/", { phone: e164 });
      await handleLookupResult(lookup);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : "Something went wrong. Please see the front desk or try again.";
      setNotice({
        tone: "rose",
        icon: "!",
        title: "Could not complete check-in",
        action: "See the front desk, or tap Start over to try again.",
        detail: msg,
      });
      toast.error(msg);
    } finally {
      setCheckingIn(false);
    }
  };

  const checkInAsChoice = async (choice: KioskPatientChoice) => {
    if (!e164 || checkingIn) return;
    setCheckingIn(true);
    setNotice(null);
    try {
      if (!choice.can_checkin) {
        setNotice({
          tone: "amber",
          icon: "⏰",
          title: "A little early",
          action: "Please wait until check-in opens, or see the front desk if they are ready for you.",
          detail: earlyCheckInDetail(
            choice.start_time_display,
            choice.earliest_checkin_display,
            choice.early_checkin_minutes_before,
          ),
        });
        return;
      }
      await completeCheckIn(
        choice.appointment_id,
        choice.patient,
        choice.appointment_ids,
        choice.visits_today,
        choice.visit_count,
      );
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : "Something went wrong. Please see the front desk or try again.";
      setNotice({
        tone: "rose",
        icon: "!",
        title: "Could not complete check-in",
        action: "See the front desk, or tap Start over to try again.",
        detail: msg,
      });
      toast.error(msg);
    } finally {
      setCheckingIn(false);
    }
  };

  return (
    <main className="relative flex min-h-[100dvh] min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#ecfdf5] via-background to-muted/50 px-[max(1rem,env(safe-area-inset-left))] py-10 pr-[max(1rem,env(safe-area-inset-right))] pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(6.5rem,env(safe-area-inset-bottom))] sm:px-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, oklch(0.52 0.14 150 / 0.12) 1px, transparent 0)`,
          backgroundSize: "24px 24px",
        }}
        aria-hidden
      />
      <div className="content-fade-in relative z-[1] w-full max-w-lg">
        <p className="mb-3 text-center">
          <Link href="/start" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            ← Portal menu
          </Link>
        </p>
        <div className="overflow-hidden rounded-3xl border border-border/80 bg-card shadow-2xl shadow-primary/10 ring-1 ring-primary/15">
          <div className="h-2 w-full bg-gradient-to-r from-[#16a349] via-[#16a349] to-[#e9982f]" aria-hidden />
          <div className="space-y-6 px-6 pb-8 pt-7 text-center sm:px-10 sm:pb-10 sm:pt-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Check-in</p>
              <div className="mt-3 flex justify-center">
                <BrandLogo variant="full" className="mx-auto max-h-12 sm:max-h-14" priority />
              </div>
              <p className="mt-3 text-lg font-semibold text-foreground">Welcome — we&apos;re glad you&apos;re here</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Enter the <span className="font-medium text-foreground">phone number</span> on your appointment. We&apos;ll
                look up today&apos;s visit only.
              </p>
            </div>

            {successVisible ? (
              <div
                className="rounded-2xl border-2 border-[#16a349] bg-gradient-to-b from-[#ecfdf5] to-white px-5 py-8 text-center shadow-inner shadow-[#16a349]/10 sm:px-8 sm:py-10"
                role="status"
                aria-live="polite"
              >
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#16a349] text-white shadow-lg shadow-[#16a349]/30 sm:h-20 sm:w-20">
                  <IconCheck className="h-9 w-9 sm:h-11 sm:w-11" />
                </div>
                <p className="mt-5 text-2xl font-extrabold leading-tight text-[#0d5c2e] sm:text-3xl">
                  You&apos;re checked in!
                </p>
                {successPatientName ? (
                  <p className="mt-3 text-lg font-semibold text-foreground sm:text-xl">
                    {successPatientName}, please have a seat.
                  </p>
                ) : (
                  <p className="mt-3 text-lg font-semibold text-foreground sm:text-xl">Please have a seat.</p>
                )}
                {successVisitSummary ? (
                  <p className="mt-3 text-base font-medium leading-relaxed text-[#0d5c2e] sm:text-lg">
                    {successVisitSummary}
                  </p>
                ) : null}
                <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
                  The front desk has been notified. We&apos;ll call your name when it&apos;s time for your visit
                  {successVisitSummary ? "s" : ""}.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">Tap Start over when the next person checks in.</p>
                <button
                  type="button"
                  onClick={resetKiosk}
                  className="mt-8 w-full rounded-2xl border-2 border-[#16a349] bg-white px-4 py-3 text-base font-semibold text-[#0d5c2e] shadow-sm transition hover:bg-[#16a349]/10 sm:py-4 sm:text-lg"
                >
                  Start over
                </button>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border-2 border-primary/20 bg-muted/40 px-4 py-5 font-mono text-2xl tracking-widest text-foreground shadow-inner sm:text-3xl">
                  {formatPhoneDisplay(phone)}
                </div>

                {notice ? <KioskNoticeCard notice={notice} /> : null}

                {patientChoices && patientChoices.length > 0 ? (
                  <div className="space-y-3 text-left">
                    <p className="text-center text-base font-semibold text-foreground">{chooseMessage}</p>
                    {patientChoices.map((choice) => (
                      <button
                        key={choice.appointment_id}
                        type="button"
                        disabled={checkingIn}
                        onClick={() => void checkInAsChoice(choice)}
                        className="flex w-full flex-col rounded-2xl border-2 border-primary/25 bg-white px-4 py-4 text-left shadow-sm transition hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50 sm:py-5"
                      >
                        <span className="text-lg font-bold text-foreground">{choice.patient}</span>
                        {(choice.visit_count ?? 0) > 1 && choice.visits_today?.length ? (
                          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                            {choice.visits_today.map((v) => (
                              <li key={v.appointment_id}>
                                {v.start_time_display}
                                {v.service_name ? ` · ${v.service_name}` : ""} · {v.provider}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="mt-1 text-sm text-muted-foreground">
                            {choice.start_time_display} · {choice.provider}
                          </span>
                        )}
                        {(choice.visit_count ?? 0) > 1 ? (
                          <span className="mt-2 text-xs font-semibold text-[#0d5c2e]">
                            One check-in covers all {choice.visit_count} visits today
                          </span>
                        ) : null}
                        {!choice.can_checkin ? (
                          <span className="mt-2 text-xs font-medium text-amber-800">
                            Check-in opens around {choice.earliest_checkin_display ?? "your appointment time"}
                          </span>
                        ) : null}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={resetKiosk}
                      className="w-full text-sm font-medium text-muted-foreground underline-offset-2 hover:underline"
                    >
                      Start over with a different number
                    </button>
                  </div>
                ) : null}

                <div
                  className={
                    patientChoices && patientChoices.length > 0 ? "hidden" : "grid grid-cols-3 gap-3 sm:gap-3.5"
                  }
                >
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
                  onClick={() => void checkIn()}
                  disabled={!canCheckIn || (patientChoices != null && patientChoices.length > 0)}
                  className={
                    patientChoices && patientChoices.length > 0
                      ? "hidden"
                      : "flex w-full min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#16a349] px-4 text-lg font-semibold text-white shadow-lg shadow-[#16a349]/25 transition hover:bg-[#13823d] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-16 sm:text-xl"
                  }
                >
                  {checkingIn ? (
                    <Loader variant="spinner" label="Completing check-in…" />
                  ) : (
                    <>
                      Check-in
                      <IconArrowRight className="h-6 w-6" />
                    </>
                  )}
                </button>

                {digits.length >= 10 && !isValidPhone && !checkingIn && (
                  <p className="text-sm font-medium text-destructive">Please enter a valid phone number.</p>
                )}
              </>
            )}

            {!successVisible ? (
              <p className="border-t border-border/70 pt-5 text-sm leading-relaxed text-muted-foreground">
                Need to book first?{" "}
                <Link href="/" className="font-semibold text-primary underline-offset-4 hover:underline">
                  Book online
                </Link>{" "}
                — then you can use check-in here on the day of your visit.
              </p>
            ) : null}
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link href="/start" className="font-medium text-primary underline-offset-2 hover:underline">
            Portal menu
          </Link>
          <span className="mx-1.5" aria-hidden>
            ·
          </span>
          Having trouble? Our front desk can help with check-in.
        </p>
      </div>
    </main>
  );
}
