"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppFeedback } from "@/components/app-feedback";
import { IconCheck, IconChevronLeft, IconChevronRight } from "@/components/icons";
import { Loader } from "@/components/loader";
import { BookingCardSetup } from "@/components/booking-card-setup";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ApiError, apiGet, apiPostPublic } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatMonthDayYear, formatNowMonthDayYearTime, formatWeekdayMonthDayYear } from "@/lib/format-date";
import { withMinimumDelay } from "@/lib/with-minimum-delay";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";

type Step = 1 | 2 | 3 | 4;
type BookingResult = {
  appointment_id: number;
  patient: string;
  provider: string;
  service: string;
  service_type?: string;
  appointment_date: string;
  start_time: string;
  total_amount: string;
};
type FormErrors = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
};

type ServiceOption = {
  id: number;
  name: string;
  description?: string;
  duration_minutes: number;
  price: string;
  service_type?: "chiropractic" | "massage";
  allow_provider_choice?: boolean;
  /** True = new patient / reactivation visit (required online after long gap since last chiro visit). */
  is_new_client_intake?: boolean;
};
type ProviderOption = { id: number; provider_name: string };
type BookingOptions = { services: ServiceOption[]; providers_by_service: Record<number, ProviderOption[]> };

/** One row from GET /booking-options/my-appointments/ (upcoming visits the patient can reschedule). */
type RescheduleAppointmentRow = {
  id: number;
  appointment_date: string;
  start_time: string;
  service_id: number;
  service_name: string;
  /** From API — preferred for policy checks when booking options are still loading. */
  service_type?: string;
  provider_id: number;
  provider_name: string;
  duration_minutes: number;
  price: string;
  /** Present when multiple patient profiles share the same phone number — who this visit is for. */
  patient_name?: string;
};

type BookingFlowMode = "new" | "reschedule";

type CartItem = {
  /** Stable id for this cart row (date/time picks and availability are keyed by this). */
  lineId: string;
  service: ServiceOption;
  provider: ProviderOption | null;
  providerSkipped: boolean;
};

type CartSlotPick = { date: string; time: string };

/** Stable id for one row in the cart (two of the same service = two different line ids). */
function newCartLineId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Online booking: chiropractic does not ask the patient to pick a doctor — use the first linked provider
 * (same as admin-assigned / single-calendar behavior). Massage with several therapists still requires a choice.
 */
function providerPickForService(
  service: ServiceOption,
  providers: ProviderOption[],
): { provider: ProviderOption | null; providerSkipped: boolean } {
  if (providers.length === 0) {
    return { provider: null, providerSkipped: false };
  }
  if (providers.length === 1) {
    return { provider: providers[0], providerSkipped: true };
  }
  /** New office / intake visits are chiropractic; auto-pick so the schedule API always gets a provider_id. */
  const isChiroBooking =
    service.service_type === "chiropractic" || service.is_new_client_intake === true;
  if (isChiroBooking) {
    return { provider: providers[0], providerSkipped: true };
  }
  return { provider: null, providerSkipped: false };
}

/** Post-massage turnover reserved on the provider schedule for public booking (matches API). */
const MASSAGE_PUBLIC_BOOKING_TAIL_MINUTES = 15;

function massageCalendarTailMinutes(service: { service_type?: string }): number {
  return service.service_type === "massage" ? MASSAGE_PUBLIC_BOOKING_TAIL_MINUTES : 0;
}

/** Total minutes blocked on the calendar for one public slot (chiro = duration; massage = duration + tail). */
function publicBookingCalendarSpanMinutes(service: ServiceOption): number {
  return Number(service.duration_minutes) + massageCalendarTailMinutes(service);
}

/** YYYY-MM-DD in the user's local calendar (UTC `toISOString()` can shift the date near midnight). */
function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/** First day of the month in local time, noon (avoids DST edge cases). */
function startOfCalendarMonth(d: Date): Date {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  x.setDate(1);
  return x;
}

function addCalendarMonths(d: Date, delta: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + delta);
  return x;
}

/** Next Mon–Fri date on or after `iso` (stay within `maxIso`). */
function nextWeekdayOnOrAfter(iso: string, maxIso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  for (let i = 0; i < 14; i++) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) {
      const out = toLocalISODate(d);
      if (out <= maxIso) return out;
      return lastWeekdayOnOrBefore(maxIso);
    }
    d.setDate(d.getDate() + 1);
  }
  return lastWeekdayOnOrBefore(maxIso);
}

/** Last Mon–Fri date on or before `maxIso` (walk backward from that calendar day). */
function lastWeekdayOnOrBefore(maxIso: string): string {
  const d = new Date(`${maxIso}T12:00:00`);
  for (let i = 0; i < 14; i++) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) return toLocalISODate(d);
    d.setDate(d.getDate() - 1);
  }
  return toLocalISODate(d);
}

/** Closing minute for online booking (visits must end by this time): Friday 4:00 PM, else 6:00 PM — matches server policy. */
function publicBookingDayEndMinutes(dateIso: string): number {
  const d = new Date(`${dateIso}T12:00:00`);
  return d.getDay() === 5 ? 16 * 60 : 18 * 60;
}

/** True if a slot start + visit length (minutes) ends by public closing (same rule as API: start + span <= dayEnd). */
function slotChainFitsPublicDayEnd(dateIso: string, slot: string, spanMinutes: number): boolean {
  // Coerce: JSON or state can surface duration as a string; mixing string + number in JS can concatenate and break comparisons.
  const span = Number(spanMinutes);
  if (!Number.isFinite(span) || span < 0) return true;
  const dayEnd = publicBookingDayEndMinutes(dateIso);
  const m = slot.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return true;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + min + span <= dayEnd;
}

/**
 * Last-resort slots if the availability API errors — same Fri 4 PM / Mon–Thu 6 PM rule as the server.
 * All service types: 15-minute start grid; massage spans duration + post-visit buffer on the calendar.
 */
function buildFallbackTimeSlots(
  dateIso: string,
  serviceType: "chiropractic" | "massage" | undefined,
  durationMinutes: number,
): string[] {
  const openMin = serviceType === "massage" ? 9 * 60 : 8 * 60;
  const closeMin = publicBookingDayEndMinutes(dateIso);
  const duration = Math.max(5, Number(durationMinutes) || 30);
  const step = 15;
  const span =
    duration + (serviceType === "massage" ? MASSAGE_PUBLIC_BOOKING_TAIL_MINUTES : 0);
  if (openMin >= closeMin) return [];
  const out: string[] = [];
  for (let t = openMin; t + span <= closeMin; t += step) {
    const h24 = Math.floor(t / 60);
    const m = t % 60;
    const suffix = h24 < 12 ? "AM" : "PM";
    const displayH = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24 === 12 ? 12 : h24;
    out.push(`${displayH}:${String(m).padStart(2, "0")} ${suffix}`);
  }
  return out;
}

/** Maps public patient-lookup fields to the step-4 chiropractic intake banner state. */
function chiroIntakeRuleFromLookupResponse(res: {
  chiropractic_returning_gap_requires_intake?: boolean;
  chiropractic_first_chiro_requires_intake?: boolean;
  chiropractic_new_patient_requires_intake?: boolean;
  chiropractic_intake_services?: Array<{ id: number; name: string }>;
  chiropractic_gap_days?: number;
  last_chiropractic_visit_date?: string | null;
}): {
  requiresIntake: boolean;
  intakeServices: Array<{ id: number; name: string }>;
  gapDays: number;
  lastVisit: string | null;
  reason: "gap" | "first_chiro" | "new_patient" | null;
} | null {
  const intakeServices = Array.isArray(res.chiropractic_intake_services) ? res.chiropractic_intake_services : [];
  const gapDays = typeof res.chiropractic_gap_days === "number" ? res.chiropractic_gap_days : 730;
  const lastVisit = res.last_chiropractic_visit_date ?? null;
  let reason: "gap" | "first_chiro" | "new_patient" | null = null;
  if (res.chiropractic_returning_gap_requires_intake === true) reason = "gap";
  else if (res.chiropractic_first_chiro_requires_intake === true) reason = "first_chiro";
  else if (res.chiropractic_new_patient_requires_intake === true) reason = "new_patient";
  const needsIntake =
    res.chiropractic_returning_gap_requires_intake === true ||
    res.chiropractic_first_chiro_requires_intake === true ||
    res.chiropractic_new_patient_requires_intake === true;
  if (!needsIntake) return null;
  return {
    requiresIntake: true,
    intakeServices,
    gapDays,
    lastVisit,
    reason: (reason ?? "new_patient") as "gap" | "first_chiro" | "new_patient",
  };
}

function formatBookingPrice(p: string): string {
  const n = parseFloat(p);
  if (Number.isNaN(n)) return `$${p}`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function appointmentStartDateTimeLocal(appointmentDate: string, displayTime12h: string): Date | null {
  const m = displayTime12h.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  const d = new Date(`${appointmentDate}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isMassageLateCancelWindow(row: RescheduleAppointmentRow, bookingOptions: BookingOptions | null): boolean {
  const fromRow = row.service_type === "massage";
  const fromOptions =
    bookingOptions?.services.find((s) => s.id === row.service_id)?.service_type === "massage";
  if (!fromRow && !fromOptions) return false;
  const dt = appointmentStartDateTimeLocal(row.appointment_date, row.start_time);
  if (!dt) return false;
  const ms = dt.getTime() - Date.now();
  return ms > 0 && ms < 24 * 60 * 60 * 1000;
}

export default function BookingPage() {
  const { toast } = useAppFeedback();
  const today = toLocalISODate(new Date());
  const [options, setOptions] = useState<BookingOptions | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [step, setStep] = useState<Step>(1);
  const [selectedCategory, setSelectedCategory] = useState<"chiropractic" | "massage" | null>(null);

  // Multi-service cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [addingAnother, setAddingAnother] = useState(false);

  const [selectedTime, setSelectedTime] = useState("9:00 AM");
  const [selectedDate, setSelectedDate] = useState(today);

  /** New booking: each cart line has its own date/time (keyed by `lineId`). Reschedule uses `selectedDate` / `selectedTime` only. */
  const [cartSlotPicksByLineId, setCartSlotPicksByLineId] = useState<Record<string, CartSlotPick>>({});
  const [cartCalendarMonthByLineId, setCartCalendarMonthByLineId] = useState<Record<string, Date>>({});
  const [cartSlotsByLineId, setCartSlotsByLineId] = useState<Record<string, string[] | null>>({});
  const [cartSlotsLoadingByLineId, setCartSlotsLoadingByLineId] = useState<Record<string, boolean>>({});
  const [bookingSubmitErrorByLineId, setBookingSubmitErrorByLineId] = useState<Record<string, string>>({});
  /** After “Edit” from Step 4, scroll this cart line into view on Step 3. */
  const [step3FocusLineId, setStep3FocusLineId] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState<string | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [slotWarning, setSlotWarning] = useState("");
  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingMessageKind, setBookingMessageKind] = useState<"success" | "error">("success");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingResults, setBookingResults] = useState<BookingResult[]>([]);
  const [availableSlots, setAvailableSlots] = useState<string[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [patientLookup, setPatientLookup] = useState<"idle" | "loading" | "returning" | "new" | "ambiguous">("idle");
  /** From patient-lookup when several people share one number — quick-fill name buttons */
  const [householdPickList, setHouseholdPickList] = useState<Array<{ first_name: string; last_name: string }>>([]);
  const [bookingFlow, setBookingFlow] = useState<BookingFlowMode>("new");
  const [rescheduleList, setRescheduleList] = useState<RescheduleAppointmentRow[]>([]);
  const [rescheduleListLoading, setRescheduleListLoading] = useState(false);
  const [rescheduleListError, setRescheduleListError] = useState("");
  /** True when several patient profiles share this phone — list may include visits for different family members. */
  const [rescheduleSharedPhone, setRescheduleSharedPhone] = useState(false);
  const [reschedulePick, setReschedulePick] = useState<RescheduleAppointmentRow | null>(null);
  /** From patient-lookup API when returning patient has Square card on file */
  const [lookupSavedCard, setLookupSavedCard] = useState<{ card_brand: string; card_last4: string } | null>(null);
  /** Chiropractic: must use flagged new-office visit when new to practice, no chiro on file, or long inactive (server + lookup). */
  const [chiroIntakeRule, setChiroIntakeRule] = useState<{
    requiresIntake: boolean;
    intakeServices: Array<{ id: number; name: string }>;
    gapDays: number;
    lastVisit: string | null;
    reason: "gap" | "first_chiro" | "new_patient" | null;
  } | null>(null);
  /** SMS opt-in on the final submit step; must stay unchecked until the user agrees (TCPA-style consent). */
  const [smsConsent, setSmsConsent] = useState(false);
  const [reasonForVisit, setReasonForVisit] = useState("");

  /** Latest calendar day patients may book online (today + 6 months in local time). */
  const maxBookDateIso = useMemo(() => {
    const d = new Date(`${today}T12:00:00`);
    d.setMonth(d.getMonth() + 6);
    return toLocalISODate(d);
  }, [today]);

  /** Month currently shown in the step-3 date picker (reschedule flow only). */
  const [bookingCalendarMonth, setBookingCalendarMonth] = useState(() => startOfCalendarMonth(new Date()));
  const prevStepForCalendarRef = useRef<Step>(1);
  /** Ignore stale availability responses when date/provider changes quickly per cart line. */
  const cartSlotFetchGenRef = useRef<Record<string, number>>({});

  const fetchOptions = () => {
    setOptionsError("");
    setOptionsLoading(true);
    withMinimumDelay(apiGet<BookingOptions>("/booking-options/"), 520)
      .then((data) => setOptions(data))
      .catch((err: unknown) => {
        console.error("Booking options request failed", err);
        if (err instanceof ApiError) {
          setOptionsError(
            `Could not load booking options: ${err.message}. Check the API logs or try http://localhost:8001/api/v1/booking-options/ in your browser.`,
          );
          return;
        }
        const isNetwork =
          err instanceof TypeError &&
          (err.message === "Failed to fetch" || err.message.includes("fetch"));
        if (isNetwork) {
          setOptionsError(
            "Could not reach the API from this page. Start the backend (Docker: run apps/api compose — API is on " +
              "http://localhost:8001). Open the site at http://localhost:3001, or run API + web together from the " +
              "repo root with docker compose. If you set NEXT_PUBLIC_API_BASE_URL in a .env file, remove it for " +
              "local dev or set it to the correct API URL.",
          );
          return;
        }
        setOptionsError(
          `Could not load booking options: ${err instanceof Error ? err.message : String(err)}. Make sure the API is running.`,
        );
      })
      .finally(() => setOptionsLoading(false));
  };

  useEffect(() => { fetchOptions(); }, []);

  /** When options load or change, auto-assign providers (chiro / single-provider) and fix invalid picks. */
  useEffect(() => {
    if (!options) return;
    setCart((prev) => {
      if (prev.length === 0) return prev;
      let changed = false;
      const next = prev.map((item) => {
        const list = options.providers_by_service[item.service.id] ?? [];
        const currentProvider = item.provider;
        if (currentProvider != null) {
          if (list.some((p) => p.id === currentProvider.id)) return item;
          changed = true;
          const pick = providerPickForService(item.service, list);
          return { ...item, provider: pick.provider, providerSkipped: pick.providerSkipped };
        }
        const pick = providerPickForService(item.service, list);
        const same =
          (pick.provider?.id ?? -1) === -1 &&
          pick.providerSkipped === item.providerSkipped;
        if (same) return item;
        changed = true;
        return { ...item, provider: pick.provider, providerSkipped: pick.providerSkipped };
      });
      return changed ? next : prev;
    });
  }, [options]);

  /** When opening date & time, focus the calendar on the month of the selected day (reschedule only). */
  useEffect(() => {
    if (step === 3 && bookingFlow === "reschedule" && prevStepForCalendarRef.current !== 3) {
      setBookingCalendarMonth(startOfCalendarMonth(new Date(`${selectedDate}T12:00:00`)));
    }
    prevStepForCalendarRef.current = step;
  }, [step, bookingFlow, selectedDate]);

  /** Reschedule: keep selected day inside the allowed booking horizon. */
  useEffect(() => {
    if (step !== 3 || bookingFlow !== "reschedule") return;
    if (selectedDate > maxBookDateIso) {
      setSelectedDate(lastWeekdayOnOrBefore(maxBookDateIso));
    }
  }, [step, bookingFlow, selectedDate, maxBookDateIso]);

  /** Reschedule: weekends not bookable online. */
  useEffect(() => {
    if (step !== 3 || bookingFlow !== "reschedule") return;
    const d = new Date(`${selectedDate}T12:00:00`);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) return;
    const n = new Date(d);
    n.setDate(n.getDate() + (wd === 0 ? 1 : 2));
    let nextIso = toLocalISODate(n);
    if (nextIso > maxBookDateIso) {
      setSelectedDate(lastWeekdayOnOrBefore(maxBookDateIso));
      return;
    }
    setSelectedDate(nextIso);
  }, [step, bookingFlow, selectedDate, maxBookDateIso]);

  /** New booking: ensure each cart line has slot picks; remove stale line keys. */
  useEffect(() => {
    const defaultDate = nextWeekdayOnOrAfter(today, maxBookDateIso);
    setCartSlotPicksByLineId((prev) => {
      const next: Record<string, CartSlotPick> = {};
      for (const item of cart) {
        next[item.lineId] = prev[item.lineId] ?? { date: defaultDate, time: "9:00 AM" };
      }
      return next;
    });
    setCartCalendarMonthByLineId((prev) => {
      const next: Record<string, Date> = {};
      for (const item of cart) {
        if (prev[item.lineId]) next[item.lineId] = prev[item.lineId];
      }
      return next;
    });
  }, [cart, today, maxBookDateIso]);

  useEffect(() => {
    const ids = new Set(cart.map((c) => c.lineId));
    setCartSlotsByLineId((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!ids.has(k)) delete next[k];
      }
      return next;
    });
    setCartSlotsLoadingByLineId((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!ids.has(k)) delete next[k];
      }
      return next;
    });
    setBookingSubmitErrorByLineId((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!ids.has(k)) delete next[k];
      }
      return next;
    });
  }, [cart]);

  /** Step 4 → Step 3 “Edit”: scroll to the schedule card for that cart line. */
  useEffect(() => {
    if (step !== 3 || bookingFlow !== "new" || step3FocusLineId == null) return;
    const id = `booking-schedule-${step3FocusLineId}`;
    const run = () => {
      const el = typeof document !== "undefined" ? document.getElementById(id) : null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      setStep3FocusLineId(null);
    };
    const t = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(run);
    });
    return () => window.cancelAnimationFrame(t);
  }, [step, bookingFlow, step3FocusLineId]);

  /** New booking step 3: clamp each line's date to Mon–Fri and booking horizon. */
  useEffect(() => {
    if (step !== 3 || bookingFlow !== "new") return;
    setCartSlotPicksByLineId((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const item of cart) {
        const p = next[item.lineId];
        if (!p) continue;
        let d = p.date;
        if (d > maxBookDateIso) {
          d = lastWeekdayOnOrBefore(maxBookDateIso);
          changed = true;
        }
        const wd = new Date(`${d}T12:00:00`).getDay();
        if (wd === 0 || wd === 6) {
          d = nextWeekdayOnOrAfter(d, maxBookDateIso);
          changed = true;
        }
        if (d < today) {
          d = nextWeekdayOnOrAfter(today, maxBookDateIso);
          changed = true;
        }
        if (d !== p.date) {
          next[item.lineId] = { ...p, date: d };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [step, bookingFlow, cart, maxBookDateIso, today]);

  const effectiveSlotService = useMemo((): ServiceOption | null => {
    if (bookingFlow !== "reschedule" || !reschedulePick || !options) return null;
    return options.services.find((s) => s.id === reschedulePick.service_id) ?? null;
  }, [bookingFlow, reschedulePick, options]);

  const effectiveSlotProvider = useMemo((): ProviderOption | null => {
    if (bookingFlow !== "reschedule" || !reschedulePick) return null;
    return { id: reschedulePick.provider_id, provider_name: reschedulePick.provider_name };
  }, [bookingFlow, reschedulePick]);

  useEffect(() => {
    if (bookingFlow !== "reschedule") {
      return;
    }
    if (!effectiveSlotService || !effectiveSlotProvider || !selectedDate) {
      setAvailableSlots(null);
      return;
    }
    setSlotsLoading(true);
    setAvailableSlots(null);
    const params = new URLSearchParams({
      date: selectedDate,
      provider_id: String(effectiveSlotProvider.id),
      service_id: String(effectiveSlotService.id),
    });
    if (bookingFlow === "reschedule" && reschedulePick && phone && isValidPhoneNumber(phone)) {
      params.set("exclude_appointment_id", String(reschedulePick.id));
      params.set("phone", phone);
    }
    apiGet<{ available_slots: string[] }>(`/booking-options/availability/?${params.toString()}`)
      .then((res) => {
        let slots = Array.isArray(res.available_slots) ? res.available_slots : [];
        // Enforce public closing client-side; span matches API (massage includes post-visit calendar buffer).
        const spanForDayEnd = publicBookingCalendarSpanMinutes(effectiveSlotService);
        slots = slots.filter((slot) => slotChainFitsPublicDayEnd(selectedDate, slot, spanForDayEnd));
        setAvailableSlots(slots);
        setSlotWarning("");
      })
      .catch(() => {
        if (!effectiveSlotService) {
          setAvailableSlots([]);
          return;
        }
        setAvailableSlots(
          buildFallbackTimeSlots(
            selectedDate,
            effectiveSlotService.service_type,
            Number(effectiveSlotService.duration_minutes) || 30,
          ),
        );
      })
      .finally(() => setSlotsLoading(false));
  }, [
    selectedDate,
    effectiveSlotProvider?.id,
    effectiveSlotService?.id,
    bookingFlow,
    reschedulePick?.id,
    phone,
    effectiveSlotService?.duration_minutes,
    effectiveSlotService?.service_type,
  ]);

  useEffect(() => {
    if (bookingFlow !== "reschedule") return;
    if (availableSlots && availableSlots.length > 0 && !availableSlots.includes(selectedTime)) {
      setSelectedTime(availableSlots[0]);
    }
  }, [bookingFlow, availableSlots, selectedTime]);

  /** New booking step 3: fetch availability independently per cart line (own date, provider, service only). */
  useEffect(() => {
    if (bookingFlow !== "new" || step !== 3) return;
    for (const item of cart) {
      const lineId = item.lineId;
      if (!item.provider) {
        setCartSlotsByLineId((p) => ({ ...p, [lineId]: null }));
        setCartSlotsLoadingByLineId((p) => ({ ...p, [lineId]: false }));
        continue;
      }
      const pick = cartSlotPicksByLineId[lineId];
      if (!pick?.date) continue;

      cartSlotFetchGenRef.current[lineId] = (cartSlotFetchGenRef.current[lineId] ?? 0) + 1;
      const gen = cartSlotFetchGenRef.current[lineId];
      const dateSnapshot = pick.date;

      setCartSlotsLoadingByLineId((p) => ({ ...p, [lineId]: true }));

      const params = new URLSearchParams({
        date: dateSnapshot,
        provider_id: String(item.provider.id),
        service_id: String(item.service.id),
      });

      apiGet<{ available_slots: string[] }>(`/booking-options/availability/?${params.toString()}`)
        .then((res) => {
          if (cartSlotFetchGenRef.current[lineId] !== gen) return;
          let slots = Array.isArray(res.available_slots) ? res.available_slots : [];
          const spanForDayEnd = publicBookingCalendarSpanMinutes(item.service);
          slots = slots.filter((slot) => slotChainFitsPublicDayEnd(dateSnapshot, slot, spanForDayEnd));
          setCartSlotsByLineId((p) => ({ ...p, [lineId]: slots }));
        })
        .catch(() => {
          if (cartSlotFetchGenRef.current[lineId] !== gen) return;
          setCartSlotsByLineId((p) => ({
            ...p,
            [lineId]: buildFallbackTimeSlots(
              dateSnapshot,
              item.service.service_type,
              Number(item.service.duration_minutes) || 30,
            ),
          }));
        })
        .finally(() => {
          if (cartSlotFetchGenRef.current[lineId] === gen) {
            setCartSlotsLoadingByLineId((p) => ({ ...p, [lineId]: false }));
          }
        });
    }
  }, [bookingFlow, step, cart, cartSlotPicksByLineId]);

  /** When slots load for a line, move the pick to first open slot if the current time is not offered. */
  useEffect(() => {
    if (bookingFlow !== "new") return;
    setCartSlotPicksByLineId((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const item of cart) {
        const slots = cartSlotsByLineId[item.lineId];
        if (!Array.isArray(slots) || slots.length === 0) continue;
        const p = next[item.lineId];
        if (!p) continue;
        if (!slots.includes(p.time)) {
          next[item.lineId] = { ...p, time: slots[0] };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [bookingFlow, cart, cartSlotsByLineId]);

  useEffect(() => {
    // Phone-only lookup: run when reaching step 4 or when the cell number changes (do not send first/last name).
    if (step !== 4 || !phone || !isValidPhoneNumber(phone)) {
      if (step !== 4) {
        setPatientLookup("idle");
        setLookupSavedCard(null);
        setHouseholdPickList([]);
      }
      return;
    }
    const t = setTimeout(() => {
      setPatientLookup("loading");
      apiGet<{
        found: boolean;
        ambiguous_phone?: boolean;
        same_phone_different_person?: boolean;
        household_members?: Array<{ first_name: string; last_name: string }>;
        first_name?: string;
        last_name?: string;
        email?: string;
        has_saved_card?: boolean;
        card_brand?: string;
        card_last4?: string;
        chiropractic_returning_gap_requires_intake?: boolean;
        chiropractic_first_chiro_requires_intake?: boolean;
        chiropractic_new_patient_requires_intake?: boolean;
        chiropractic_intake_services?: Array<{ id: number; name: string }>;
        chiropractic_gap_days?: number;
        last_chiropractic_visit_date?: string | null;
      }>(`/booking-options/patient-lookup/?phone=${encodeURIComponent(phone)}`)
        .then((res) => {
          const nextRule = chiroIntakeRuleFromLookupResponse(res);
          setHouseholdPickList([]);

          if (res.found && res.ambiguous_phone && Array.isArray(res.household_members) && res.household_members.length > 0) {
            setHouseholdPickList(
              res.household_members.map((m) => ({
                first_name: m.first_name,
                last_name: m.last_name,
              })),
            );
            setPatientLookup("ambiguous");
            setLookupSavedCard(null);
            setChiroIntakeRule(nextRule);
            return;
          }

          if (res.found && res.first_name != null && res.last_name != null) {
            setFirstName((prev) => (prev.trim() ? prev : res.first_name ?? ""));
            setLastName((prev) => (prev.trim() ? prev : res.last_name ?? ""));
            setEmail((prev) => (prev.trim() ? prev : res.email ?? ""));
            setPatientLookup("returning");
            setLookupSavedCard(
              res.has_saved_card && res.card_last4
                ? { card_brand: res.card_brand ?? "", card_last4: res.card_last4 }
                : null,
            );
            setChiroIntakeRule(nextRule);
            return;
          }

          setPatientLookup("new");
          setLookupSavedCard(null);
          setChiroIntakeRule(nextRule);
        })
        .catch(() => {
          setPatientLookup("new");
          setLookupSavedCard(null);
          setChiroIntakeRule(null);
          setHouseholdPickList([]);
        });
    }, 500);
    return () => clearTimeout(t);
  }, [step, phone]);

  useEffect(() => {
    // Refined lookup with first + last name (household picks, booking a minor on a parent's number, etc.).
    if (step !== 4 || !phone || !isValidPhoneNumber(phone)) return;
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn || !ln) return;

    const t = setTimeout(() => {
      setPatientLookup("loading");
      const sp = new URLSearchParams();
      sp.set("phone", phone);
      sp.set("first_name", fn);
      sp.set("last_name", ln);
      apiGet<{
        found: boolean;
        ambiguous_phone?: boolean;
        same_phone_different_person?: boolean;
        household_members?: Array<{ first_name: string; last_name: string }>;
        first_name?: string;
        last_name?: string;
        email?: string;
        has_saved_card?: boolean;
        card_brand?: string;
        card_last4?: string;
        chiropractic_returning_gap_requires_intake?: boolean;
        chiropractic_first_chiro_requires_intake?: boolean;
        chiropractic_new_patient_requires_intake?: boolean;
        chiropractic_intake_services?: Array<{ id: number; name: string }>;
        chiropractic_gap_days?: number;
        last_chiropractic_visit_date?: string | null;
      }>(`/booking-options/patient-lookup/?${sp.toString()}`)
        .then((res) => {
          const nextRule = chiroIntakeRuleFromLookupResponse(res);
          setHouseholdPickList([]);

          if (res.same_phone_different_person === true && res.found === false) {
            setPatientLookup("new");
            setLookupSavedCard(null);
            setChiroIntakeRule(nextRule);
            return;
          }

          if (res.found && res.ambiguous_phone && Array.isArray(res.household_members) && res.household_members.length > 0) {
            setHouseholdPickList(
              res.household_members.map((m) => ({
                first_name: m.first_name,
                last_name: m.last_name,
              })),
            );
            setPatientLookup("ambiguous");
            setLookupSavedCard(null);
            setChiroIntakeRule(nextRule);
            return;
          }

          if (res.found && res.first_name != null && res.last_name != null) {
            setPatientLookup("returning");
            setEmail(res.email ?? "");
            setLookupSavedCard(
              res.has_saved_card && res.card_last4
                ? { card_brand: res.card_brand ?? "", card_last4: res.card_last4 }
                : null,
            );
            setChiroIntakeRule(nextRule);
            return;
          }

          setPatientLookup("new");
          setLookupSavedCard(null);
          setChiroIntakeRule(nextRule);
        })
        .catch(() => {
          setPatientLookup("new");
          setLookupSavedCard(null);
          setChiroIntakeRule(null);
          setHouseholdPickList([]);
        });
    }, 450);
    return () => clearTimeout(t);
  }, [step, phone, firstName, lastName]);

  const chiroServices = useMemo(
    () => (options?.services ?? []).filter((s) => s.service_type === "chiropractic"),
    [options?.services],
  );
  const massageServices = useMemo(
    () => (options?.services ?? []).filter((s) => s.service_type === "massage"),
    [options?.services],
  );

  const cartCategoryTypes = useMemo(() => new Set(cart.map((c) => c.service.service_type)), [cart]);

  const otherCategoryAvailable = useMemo(() => {
    if (cartCategoryTypes.has("chiropractic") && !cartCategoryTypes.has("massage") && massageServices.length > 0)
      return "massage" as const;
    if (cartCategoryTypes.has("massage") && !cartCategoryTypes.has("chiropractic") && chiroServices.length > 0)
      return "chiropractic" as const;
    return null;
  }, [cartCategoryTypes, chiroServices.length, massageServices.length]);

  /** Chiropractic cart must use new-office / intake visit types when policy requires it (new patient, first chiro here, or long gap). */
  const chiroGapBlocksCart = useMemo(() => {
    if (!chiroIntakeRule?.requiresIntake) return false;
    return cart.some((c) => c.service.service_type === "chiropractic" && !c.service.is_new_client_intake);
  }, [chiroIntakeRule, cart]);

  const servicesForCategory = selectedCategory === "chiropractic"
    ? chiroServices
    : selectedCategory === "massage"
      ? massageServices
      : [];

  const totalPrice = useMemo(() => {
    if (bookingFlow === "reschedule" && reschedulePick) {
      const n = parseFloat(reschedulePick.price || "0");
      return Number.isNaN(n) ? 0 : n;
    }
    return cart.reduce((sum, item) => sum + parseFloat(item.service.price || "0"), 0);
  }, [bookingFlow, reschedulePick, cart]);


  const addServiceToCart = (service: ServiceOption) => {
    if (!options) {
      toast.error("Still loading services and providers. Please wait a moment, then try again.");
      return;
    }
    if (
      chiroIntakeRule?.requiresIntake &&
      service.service_type === "chiropractic" &&
      !service.is_new_client_intake
    ) {
      const names = chiroIntakeRule.intakeServices.map((s) => s.name).join(", ");
      const fallback =
        "Please choose a new patient or new office visit type for chiropractic (ask the clinic to mark one in Services).";
      const r = chiroIntakeRule.reason;
      if (r === "new_patient") {
        toast.error(
          names
            ? `We don't have this number on file yet. Your first chiropractic visit must be a new office visit: ${names}.`
            : fallback,
        );
      } else if (r === "first_chiro") {
        toast.error(
          names
            ? `We don't have a completed chiropractic visit on file for you yet. Please book a new office visit first: ${names}.`
            : fallback,
        );
      } else {
        toast.error(
          names
            ? `It's been over ${Math.round(chiroIntakeRule.gapDays / 365)} years since your last chiro visit here — book a first-time-style visit (new office / new patient / reactivation): ${names}.`
            : fallback,
        );
      }
      return;
    }
    const providers = options.providers_by_service[service.id] ?? [];
    const pick = providerPickForService(service, providers);
    const item: CartItem = {
      lineId: newCartLineId(),
      service,
      provider: pick.provider,
      providerSkipped: pick.providerSkipped,
    };
    setCart((prev) => [...prev, item]);
    setSelectedCategory(null);
    setAddingAnother(false);
  };

  const removeFromCart = (lineId: string) => {
    setCart((prev) => prev.filter((c) => c.lineId !== lineId));
  };

  const needsProviderSelection = cart.some((c) => !c.provider && !c.providerSkipped);

  const cartHasServiceWithNoProviders = useMemo(() => {
    if (!options) return false;
    return cart.some((c) => (options.providers_by_service[c.service.id] ?? []).length === 0);
  }, [cart, options]);

  /** If someone lands on step 3 without a required provider, send them to step 2 (massage multi-therapist only). */
  useEffect(() => {
    if (bookingFlow !== "new" || step !== 3) return;
    if (needsProviderSelection) {
      setStep(2);
    }
  }, [bookingFlow, step, needsProviderSelection]);

  const proceedFromStep1 = () => {
    if (chiroGapBlocksCart) {
      toast.error(
        "Update your chiropractic visit to a new patient or reactivation type (see the notice above), then continue.",
      );
      return;
    }
    if (optionsLoading || !options) {
      toast.error("Still loading visit options. Please wait a second, then tap Continue again.");
      return;
    }
    if (cartHasServiceWithNoProviders) {
      toast.error("A visit in your cart has no provider available online. Remove it or call the clinic.");
      return;
    }
    if (needsProviderSelection) {
      setStep(2);
    } else {
      setStep(3);
    }
  };

  const activateNewBookingFlow = () => {
    setBookingFlow("new");
    setReschedulePick(null);
    setRescheduleList([]);
    setRescheduleListError("");
    setSmsConsent(false);
    setStep(1);
    setCartSlotPicksByLineId({});
    setCartCalendarMonthByLineId({});
    setCartSlotsByLineId({});
    setCartSlotsLoadingByLineId({});
    setBookingSubmitErrorByLineId({});
    setStep3FocusLineId(null);
  };

  const activateRescheduleFlow = () => {
    setBookingFlow("reschedule");
    setCart([]);
    setSelectedCategory(null);
    setAddingAnother(false);
    setBookingResults([]);
    setBookingMessage("");
    setReschedulePick(null);
    setRescheduleList([]);
    setRescheduleListError("");
    setRescheduleSharedPhone(false);
    setSmsConsent(false);
    setStep(1);
    setCartSlotPicksByLineId({});
    setCartCalendarMonthByLineId({});
    setCartSlotsByLineId({});
    setCartSlotsLoadingByLineId({});
    setBookingSubmitErrorByLineId({});
    setStep3FocusLineId(null);
  };

  const loadMyAppointments = useCallback(async () => {
    if (!phone || !isValidPhoneNumber(phone)) {
      toast.error("Enter a valid cell number first.");
      return;
    }
    setRescheduleListLoading(true);
    setRescheduleListError("");
    try {
      const res = await apiGet<{
        detail?: string;
        ambiguous_phone?: boolean;
        first_name: string;
        last_name: string;
        email: string;
        appointments: RescheduleAppointmentRow[];
      }>(`/booking-options/my-appointments/?phone=${encodeURIComponent(phone)}`);
      setRescheduleList(res.appointments ?? []);
      setFirstName(res.first_name ?? "");
      setLastName(res.last_name ?? "");
      setEmail(res.email ?? "");
      setRescheduleSharedPhone(res.ambiguous_phone === true);
      if ((res.appointments ?? []).length === 0) {
        setRescheduleListError(
          "No upcoming visits found for this number that can be changed online. Call the clinic if you need help.",
        );
      }
    } catch (e) {
      setRescheduleList([]);
      setRescheduleSharedPhone(false);
      if (e instanceof ApiError && e.status === 404) {
        setRescheduleListError(
          e.message ||
            "We couldn't find a patient profile with this phone number. Double-check the number or call the clinic.",
        );
      } else {
        setRescheduleListError(e instanceof ApiError ? e.message : "Could not load your visits. Try again.");
      }
    } finally {
      setRescheduleListLoading(false);
    }
  }, [phone, toast]);

  const cancelPublicAppointment = async (row: RescheduleAppointmentRow) => {
    if (!phone || !isValidPhoneNumber(phone)) {
      toast.error("Enter a valid cell number first.");
      return;
    }
    const lateMassage = isMassageLateCancelWindow(row, options);
    const msg = lateMassage
      ? `This massage starts within 24 hours. The full massage price (${formatBookingPrice(row.price)}) may be charged for a late cancellation, per clinic policy. Cancel online anyway?`
      : "Cancel this appointment? With this much notice there is no cancellation fee.";
    if (!window.confirm(msg)) return;
    try {
      await apiPostPublic<{ detail?: string }>("/booking-options/cancel-appointment/", {
        phone,
        appointment_id: row.id,
      });
      toast.success("Your appointment was cancelled.");
      await loadMyAppointments();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not cancel. Call the clinic if you need help.");
    }
  };

  const goToPreviousStep = () => {
    if (step === 1 && bookingFlow === "reschedule") {
      activateNewBookingFlow();
      return;
    }
    if (step === 1 && selectedCategory) {
      setSelectedCategory(null);
    } else if (step === 1 && addingAnother) {
      setAddingAnother(false);
    } else if (step === 2 && bookingFlow === "reschedule") {
      setReschedulePick(null);
      setStep(1);
    } else if (step === 2) {
      setStep(1);
    } else if (step === 3) {
      if (bookingFlow === "reschedule" && reschedulePick) {
        setStep(2);
      } else if (!needsProviderSelection) {
        setStep(1);
      } else {
        setStep(2);
      }
    } else if (step === 4 && (bookingFlow === "reschedule" || (bookingFlow === "new" && cart.length > 0))) {
      setSmsConsent(false);
      setStep(3);
    } else if (step > 1) {
      setStep((step - 1) as Step);
    }
  };

  const resetBookingFlow = () => {
    setBookingResults([]);
    setBookingMessage("");
    setSelectedCategory(null);
    setCart([]);
    setAddingAnother(false);
    setChiroIntakeRule(null);
    setCartSlotPicksByLineId({});
    setCartCalendarMonthByLineId({});
    setCartSlotsByLineId({});
    setCartSlotsLoadingByLineId({});
    setBookingSubmitErrorByLineId({});
    setStep3FocusLineId(null);
    activateNewBookingFlow();
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** Step 4 recap → Step 3: keep other rows’ slots; scroll to this row’s calendar card. */
  const goEditScheduleLine = useCallback(
    (lineId: string) => {
      const pick = cartSlotPicksByLineId[lineId];
      if (pick?.date) {
        setCartCalendarMonthByLineId((prev) => ({
          ...prev,
          [lineId]: startOfCalendarMonth(new Date(`${pick.date}T12:00:00`)),
        }));
      }
      setStep3FocusLineId(lineId);
      setStep(3);
    },
    [cartSlotPicksByLineId],
  );

  const submitBooking = async () => {
    if (cart.length === 0) return;
    setBookingMessage("");
    setSlotWarning("");
    setBookingSubmitErrorByLineId({});
    const nextErrors: FormErrors = {};
    if (!firstName.trim()) nextErrors.firstName = "First name is required.";
    if (!lastName.trim()) nextErrors.lastName = "Last name is required.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = "Please enter a valid email address, or leave it blank.";
    }
    if (!phone || !isValidPhoneNumber(phone)) {
      nextErrors.phone = "Please enter a valid cell number.";
    }
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setBookingMessageKind("error");
      setBookingMessage("Please correct the highlighted fields.");
      return;
    }
    if (!smsConsent) {
      setBookingMessageKind("error");
      setBookingMessage("Please check the SMS consent box to confirm your appointment.");
      return;
    }
    if (chiroGapBlocksCart) {
      setBookingMessageKind("error");
      setBookingMessage(
        "Please update your chiropractic visit to a new patient or reactivation appointment, then try again.",
      );
      toast.error("This booking requires a new client chiropractic visit. Go back and change your selected visit type.");
      return;
    }

    for (const item of cart) {
      const pick = cartSlotPicksByLineId[item.lineId];
      if (!item.provider) {
        setBookingMessageKind("error");
        setBookingMessage("Each visit needs a provider. Go back and finish provider selection.");
        toast.error("Choose a provider for every service before confirming.");
        setStep(2);
        return;
      }
      if (!pick) {
        setBookingMessageKind("error");
        setBookingMessage("Pick a date and time for each service.");
        setStep(3);
        return;
      }
      const slots = cartSlotsByLineId[item.lineId];
      if (cartSlotsLoadingByLineId[item.lineId]) {
        setBookingMessageKind("error");
        setBookingMessage("Still loading open times — wait a moment and try again.");
        return;
      }
      if (!slots || slots.length === 0 || !slots.includes(pick.time)) {
        setBookingMessageKind("error");
        setBookingMessage("Pick a valid open time for each service.");
        toast.error(`Choose an available time for ${item.service.name}.`);
        setStep(3);
        return;
      }
    }

    setIsSubmitting(true);
    const succeeded: BookingResult[] = [];
    const failedItems: CartItem[] = [];
    const errByLine: Record<string, string> = {};

    try {
      for (const item of cart) {
        const pick = cartSlotPicksByLineId[item.lineId];
        if (!pick || !item.provider) continue;
        try {
          const result = await apiPostPublic<BookingResult>("/appointments/book/", {
            first_name: firstName,
            last_name: lastName,
            phone,
            email,
            sms_consent: smsConsent,
            reason_for_visit: reasonForVisit.trim(),
            service_id: item.service.id,
            provider_id: item.provider.id,
            provider_name: item.provider.provider_name ?? "",
            service_name: item.service.name,
            service_duration_minutes: item.service.duration_minutes,
            service_price: item.service.price,
            appointment_date: pick.date,
            start_time: pick.time,
          });
          succeeded.push(result);
        } catch (error) {
          failedItems.push(item);
          const msg =
            error instanceof ApiError ? error.message : "Could not complete booking. Please try again.";
          errByLine[item.lineId] = msg;
        }
      }

      if (succeeded.length > 0) {
        setBookingResults((prev) => [...prev, ...succeeded]);
      }
      setBookingSubmitErrorByLineId(errByLine);

      if (failedItems.length === 0) {
        setCart([]);
        setBookingMessageKind("success");
        const ids = succeeded.map((r) => `#${r.appointment_id}`).join(", ");
        setBookingMessage(`Appointments booked successfully. IDs: ${ids}`);
        toast.success(
          succeeded.length > 1
            ? "Your appointments are confirmed! Your confirmations are on screen."
            : "Appointment confirmed! Your confirmation is on screen.",
        );
      } else if (succeeded.length > 0) {
        setCart(failedItems);
        setStep(3);
        setBookingMessageKind("error");
        setBookingMessage(
          `${succeeded.length} visit(s) booked. Please pick another time for the visit(s) that could not be scheduled.`,
        );
        toast.success(`${succeeded.length} appointment(s) confirmed.`);
        toast.error("Some visits could not be booked — choose a new time for those services.");
      } else {
        setBookingMessageKind("error");
        setBookingMessage("Could not complete booking. Pick another time or call the clinic.");
        setStep(3);
        const firstErr = Object.values(errByLine)[0];
        toast.error(firstErr ?? "Could not complete booking.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitReschedule = async () => {
    if (!reschedulePick || !phone || !isValidPhoneNumber(phone)) {
      toast.error("We need your appointment and a valid cell number.");
      return;
    }
    if (!smsConsent) {
      setBookingMessageKind("error");
      setBookingMessage("Please check the SMS consent box to confirm your new time.");
      toast.error("Please agree to SMS appointment reminders to continue.");
      return;
    }
    setBookingMessage("");
    setSlotWarning("");
    setIsSubmitting(true);
    try {
      const result = await apiPostPublic<BookingResult>("/booking-options/reschedule/", {
        phone,
        appointment_id: reschedulePick.id,
        appointment_date: selectedDate,
        start_time: selectedTime,
        sms_consent: smsConsent,
      });
      setBookingResults([result]);
      setBookingMessageKind("success");
      setBookingMessage(`Appointment rescheduled. Confirmation #${result.appointment_id}`);
      toast.success("Your visit has been moved to the new time.");
      await loadMyAppointments();
    } catch (error) {
      setBookingMessageKind("error");
      if (error instanceof ApiError && error.status === 409) {
        setStep(3);
        setSlotWarning(error.message);
        setBookingMessage("Please select another available time slot.");
        toast.info("That time is no longer available — please choose another slot.");
      } else {
        setBookingMessage(
          error instanceof ApiError ? error.message : "Could not reschedule. Try again or call the clinic.",
        );
        toast.error(error instanceof ApiError ? error.message : "Could not reschedule.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadCalendar = () => {
    if (bookingResults.length === 0) return;
    const events = bookingResults.map((r) => {
      const dateParts = r.appointment_date.split("-");
      const timeParts = r.start_time.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!dateParts || !timeParts) return "";
      let h = parseInt(timeParts[1], 10);
      const m = parseInt(timeParts[2], 10);
      const ap = timeParts[3].toUpperCase();
      if (ap === "PM" && h !== 12) h += 12;
      if (ap === "AM" && h === 12) h = 0;
      const start = `${dateParts[0]}${dateParts[1]}${dateParts[2]}T${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}00`;
      const svc = cart.find((c) => c.service.name === r.service);
      const dur = svc?.service.duration_minutes ?? 30;
      const endH = h + Math.floor((m + dur) / 60);
      const endM = (m + dur) % 60;
      const end = `${dateParts[0]}${dateParts[1]}${dateParts[2]}T${String(endH).padStart(2, "0")}${String(endM).padStart(2, "0")}00`;
      return `BEGIN:VEVENT\nDTSTART:${start}\nDTEND:${end}\nSUMMARY:${r.service} — Relief Chiropractic\nDESCRIPTION:Confirmation #${r.appointment_id}\\nProvider: ${r.provider}\nLOCATION:Relief Chiropractic\nEND:VEVENT`;
    }).filter(Boolean);
    const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Relief Chiropractic//Booking//EN\n${events.join("\n")}\nEND:VCALENDAR`;
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "relief-chiropractic-appointment.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  const printBookingConfirmation = () => {
    if (bookingResults.length === 0) return;
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      toast.error("Allow pop-ups for this site to print your confirmation.");
      return;
    }
    const esc = (s: string | number) =>
      String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const generated = esc(formatNowMonthDayYearTime());

    const rowsHtml = bookingResults
      .map(
        (r, i) => `
        ${bookingResults.length > 1 ? `<tr><td colspan="2" style="padding:10px 14px;font-weight:700;font-size:13px;color:#166534;background:#f0fdf4;border-bottom:1px solid #e2e8f0;">Appointment ${i + 1}</td></tr>` : ""}
        <tr><th scope="row">Confirmation #</th><td>${esc(r.appointment_id)}</td></tr>
        <tr><th scope="row">Patient</th><td>${esc(r.patient)}</td></tr>
        <tr><th scope="row">Service</th><td>${esc(r.service)}</td></tr>
        ${r.provider ? `<tr><th scope="row">Doctor</th><td>${esc(r.provider)}</td></tr>` : ""}
        <tr><th scope="row">Date</th><td>${esc(formatMonthDayYear(r.appointment_date))}</td></tr>
        <tr><th scope="row">Time</th><td>${esc(r.start_time)}</td></tr>
        <tr class="total-row"><th scope="row">Estimated amount at visit</th><td>$${esc(r.total_amount)}</td></tr>`,
      )
      .join("");
    const grandNum = bookingResults.reduce((sum, r) => sum + Number.parseFloat(String(r.total_amount)), 0);
    const grandRow =
      bookingResults.length > 1
        ? `<tr class="total-row"><th scope="row">Combined estimate (all visits)</th><td>${esc(formatBookingPrice(String(grandNum)))}</td></tr>`
        : "";

    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Appointment confirmation — Relief Chiropractic</title><style>@page{margin:14mm 16mm;size:letter}*{box-sizing:border-box}body{margin:0;padding:20px;font-family:"Georgia","Times New Roman",serif;color:#1e293b;background:#f1f5f9;-webkit-print-color-adjust:exact;print-color-adjust:exact}.screen-note{max-width:640px;margin:0 auto 16px;padding:10px 14px;font-family:system-ui,sans-serif;font-size:13px;color:#475569;text-align:center;background:#fff;border:1px solid #cbd5e1;border-radius:8px}.form{max-width:640px;margin:0 auto;background:#fff;border:2px solid #0f172a;box-shadow:0 4px 24px rgba(15,23,42,.08)}.form-accent{height:6px;background:linear-gradient(90deg,#16a349 0%,#16a349 38%,#e9982f 38%,#e9982f 100%)}.form-inner{padding:28px 32px 32px}.form-header{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:20px;margin-bottom:20px;border-bottom:2px solid #0f172a}.clinic-name{margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:26px;font-weight:800;letter-spacing:-.02em;color:#e9982f}.doc-title{margin:4px 0 0;font-family:system-ui,sans-serif;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#64748b}.badge-wrap{text-align:right}.badge{display:inline-block;padding:8px 14px;font-family:system-ui,sans-serif;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#166534;background:#dcfce7;border:1px solid #86efac;border-radius:4px}h2.section-title{margin:0 0 12px;font-family:system-ui,sans-serif;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#334155}table.details{width:100%;border-collapse:collapse;font-family:system-ui,sans-serif;font-size:14px;border:1px solid #cbd5e1}table.details tr{border-bottom:1px solid #e2e8f0}table.details tr:last-child{border-bottom:none}table.details th{width:38%;padding:12px 14px;text-align:left;font-weight:600;font-size:12px;color:#475569;background:#f8fafc;border-right:1px solid #e2e8f0;vertical-align:top}table.details td{padding:12px 14px;font-weight:600;color:#0f172a;vertical-align:top;line-height:1.45}tr.total-row th{background:#fffbeb;color:#92400e;border-right-color:#fde68a}tr.total-row td{background:#fffbeb;font-size:18px;font-weight:800;color:#b45309}.instructions{margin-top:22px;padding:14px 16px;font-family:system-ui,sans-serif;font-size:12px;line-height:1.55;color:#475569;background:#f8fafc;border:1px dashed #94a3b8;border-radius:6px}.instructions strong{color:#334155}.form-footer{margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;font-family:system-ui,sans-serif;font-size:10px;color:#94a3b8;text-align:center;letter-spacing:.04em}@media print{body{padding:0;background:#fff}.screen-note{display:none!important}.form{max-width:none;border:2px solid #000;box-shadow:none}.form-inner{padding:20px 24px 24px}}</style></head><body><p class="screen-note">A print dialog will open next. Choose your printer or <strong>Save as PDF</strong>.</p><article class="form"><div class="form-accent"></div><div class="form-inner"><header class="form-header"><div><h1 class="clinic-name">Relief Chiropractic</h1><p class="doc-title">Appointment confirmation</p></div><div class="badge-wrap"><span class="badge">Confirmed</span></div></header><h2 class="section-title">Visit details</h2><table class="details"><tbody>${rowsHtml}${grandRow}</tbody></table><div class="instructions"><strong>Before your visit:</strong> Please arrive a few minutes early. Bring this confirmation or check in at the clinic kiosk using your phone number. <strong>Payment:</strong> Amounts above are estimates for the booked service(s); your final balance may change with insurance, taxes, or additional services at check-out.</div><footer class="form-footer">Document generated ${generated} · Relief Chiropractic · Online booking confirmation</footer></div></article><script>window.onload=function(){window.print()};<\/script></body></html>`;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Sidebar / summary: reschedule = one slot; new booking = each cart line uses its own date & time (no chaining).
  const cartSchedule = useMemo(() => {
    if (bookingFlow === "reschedule" && reschedulePick && options) {
      const svc = options.services.find((s) => s.id === reschedulePick.service_id);
      if (!svc) return [];
      const prov: ProviderOption = {
        id: reschedulePick.provider_id,
        provider_name: reschedulePick.provider_name,
      };
      return [
        {
          lineId: "reschedule",
          service: svc,
          provider: prov,
          providerSkipped: false,
          visitDate: selectedDate,
          visitTime: selectedTime,
        },
      ];
    }
    return cart.map((item) => {
      const pick = cartSlotPicksByLineId[item.lineId];
      return {
        lineId: item.lineId,
        service: item.service,
        provider: item.provider,
        providerSkipped: item.providerSkipped,
        visitDate: pick?.date ?? "",
        visitTime: pick?.time ?? "",
      };
    });
  }, [bookingFlow, reschedulePick, options, cart, cartSlotPicksByLineId, selectedDate, selectedTime]);

  return (
    <main className="content-fade-in min-h-[100dvh] min-h-screen overflow-x-hidden bg-gradient-to-b from-background via-[#ecfdf5]/25 to-background">
      <div className="mx-auto max-w-7xl px-[max(1rem,env(safe-area-inset-left))] py-4 pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] md:p-8">
      <nav
        aria-label="Site sections"
        className="mb-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl border border-border/70 bg-card/90 px-3 py-2.5 text-sm shadow-sm backdrop-blur-sm sm:justify-between"
      >
        <span className="w-full text-center text-xs font-medium text-muted-foreground sm:w-auto sm:text-left">
          Looking for something else?
        </span>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:justify-end">
          <Link href="/start" className="font-semibold text-primary underline-offset-4 hover:underline">
            All portals
          </Link>
          <span className="text-muted-foreground" aria-hidden>
            ·
          </span>
          <Link href="/kiosk" className="font-medium text-[#0d5c2e] underline-offset-4 hover:underline">
            Check-in
          </Link>
        </div>
      </nav>
      <section className="mb-8 overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-card via-white to-primary/[0.06] shadow-sm shadow-slate-200/40 ring-1 ring-primary/10">
        <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
          <div className="order-1 p-6 md:p-10">
            <p className="mb-3 inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-slate-800">
              Relief Chiropractic · Online booking
            </p>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-[#e9982f] md:text-5xl">
              Relief Chiropractic
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground md:text-base">
              {bookingFlow === "reschedule" ? (
                "Move a visit you already booked—we'll verify your cell number and show open times for your doctor."
              ) : (
                <>
                  Choose a service, pick your time, and you&apos;re done. Prefer to call?{" "}
                  <a href="tel:+12694080303" className="font-medium text-[#0d5c2e] underline-offset-4 hover:underline">
                    +1 (269) 408-0303
                  </a>
                </>
              )}
            </p>
            <div className="mt-4 flex w-full max-w-lg flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => activateNewBookingFlow()}
                className={cn(
                  "min-h-11 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-all sm:min-h-0 sm:w-auto sm:flex-1 sm:max-w-xs",
                  bookingFlow === "new"
                    ? "bg-[#16a349] text-white shadow-sm shadow-[#16a349]/20"
                    : "border border-border/80 bg-card text-foreground hover:border-primary/30",
                )}
              >
                Book a new visit
              </button>
              <button
                type="button"
                onClick={() => activateRescheduleFlow()}
                className={cn(
                  "min-h-11 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-all sm:min-h-0 sm:w-auto sm:flex-1 sm:max-w-xs",
                  bookingFlow === "reschedule"
                    ? "border border-transparent bg-[#16a349] text-white shadow-sm shadow-[#16a349]/20"
                    : "border border-border/80 bg-card text-foreground hover:border-primary/30",
                )}
              >
                Reschedule a visit
              </button>
            </div>
            <p className="mt-4 max-w-lg text-center text-xs text-muted-foreground sm:text-left">
              Already have a visit?{" "}
              <Link href="/kiosk" className="font-medium text-[#0d5c2e] underline-offset-4 hover:underline">
                Check in here
              </Link>
            </p>
          </div>
          <div className="relative order-2 min-h-[180px] w-full overflow-hidden md:min-h-[min(56vh,22rem)]">
            <Image
              src="/images/clinic-reception.png"
              alt="Clinic reception"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/20 to-transparent md:bg-gradient-to-l" aria-hidden />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="order-1 min-w-0 rounded-2xl border border-border/90 bg-card p-5 shadow-sm ring-1 ring-slate-100/80 md:p-6 space-y-5">
          <div className="grid grid-cols-4 gap-1 sm:gap-2">
            {([1, 2, 3, 4] as Step[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStep(item)}
                className={cn(
                  "min-h-11 shrink rounded-lg px-1.5 py-2 text-[11px] font-semibold leading-tight transition-all sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-sm",
                  step === item
                    ? "bg-[#e9982f] text-white shadow-md shadow-[#e9982f]/25 ring-2 ring-[#e9982f]/40"
                    : "border border-border/80 bg-muted/50 text-muted-foreground hover:border-primary/20 hover:bg-primary/[0.06] hover:text-foreground",
                )}
              >
                Step {item}
              </button>
            ))}
          </div>

          {bookingFlow === "new" && chiroGapBlocksCart && chiroIntakeRule && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm">
              <p className="font-semibold">New office visit required for chiropractic</p>
              <p className="mt-1 leading-relaxed">
                {chiroIntakeRule.reason === "new_patient" ? (
                  <>
                    This looks like your <strong>first time</strong> booking with us under this number. For chiropractic
                    care, please start with a <strong>new patient</strong> or <strong>new office visit</strong>:{" "}
                    {chiroIntakeRule.intakeServices.map((s) => s.name).join(", ") || "ask the clinic to mark a visit type in Admin → Services."}{" "}
                    Remove the chiropractic line below if it isn&apos;t one of those, then add the correct visit. Massage
                    is fine to add as usual.
                  </>
                ) : chiroIntakeRule.reason === "first_chiro" ? (
                  <>
                    We don&apos;t have a <strong>completed chiropractic visit</strong> on file for you yet. Please choose
                    a <strong>new patient</strong> or <strong>new office visit</strong> first:{" "}
                    {chiroIntakeRule.intakeServices.map((s) => s.name).join(", ") || "ask the clinic to mark a visit type in Admin → Services."}{" "}
                    Swap your chiropractic selection below. Massage-only bookings are fine.
                  </>
                ) : (
                  <>
                    You haven&apos;t had a <strong>completed chiropractic visit</strong> here in over{" "}
                    {Math.round(chiroIntakeRule.gapDays / 365)} years
                    {chiroIntakeRule.lastVisit ? ` (last one on file: ${chiroIntakeRule.lastVisit})` : ""}. For chiropractic,
                    you need to come back in through a <strong>first-time-style visit</strong> — book a{" "}
                    <strong>new patient</strong>, <strong>new office visit</strong>, or <strong>reactivation</strong> type:{" "}
                    {chiroIntakeRule.intakeServices.map((s) => s.name).join(", ") || "ask the clinic to mark a visit type in Admin → Services."}{" "}
                    Remove the regular chiropractic visit below and add one of those. Massage-only bookings are fine.
                  </>
                )}
              </p>
            </div>
          )}

          {/* ─── STEP 1: Service selection (new) or find visits (reschedule) ─── */}
          {step === 1 && (
            <div className="animate-fade-in-up space-y-3">
              {bookingFlow === "reschedule" && (
                <div className="space-y-4 rounded-xl border border-[#166534]/25 bg-[#f0fdf4]/60 p-4">
                  <h2 className="text-lg font-semibold text-[#0d5c2e]">Find your appointment</h2>
                  <p className="text-sm leading-relaxed text-slate-600">
                    Enter the <strong className="text-slate-800">same cell number</strong> you used when you booked. We list
                    upcoming visits you can move. (Checked in or finished visits need the front desk.)
                  </p>
                  <div className={`rounded-lg border bg-white p-2 ${rescheduleListError && !rescheduleListLoading ? "border-amber-300" : "border-slate-200"}`}>
                    <PhoneInput
                      international
                      defaultCountry="US"
                      countryCallingCodeEditable={false}
                      value={phone}
                      onChange={(value) => {
                        setPhone(value);
                        setRescheduleList([]);
                        setRescheduleListError("");
                        setReschedulePick(null);
                        setRescheduleSharedPhone(false);
                      }}
                      placeholder="Cell number on your booking"
                      className="phone-field text-sm"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() => loadMyAppointments()}
                    disabled={rescheduleListLoading}
                    className="h-auto rounded-xl bg-[#0d5c2e] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4d26]"
                  >
                    {rescheduleListLoading ? "Looking up…" : "Show my upcoming visits"}
                  </Button>
                  {rescheduleListError && (
                    <p className="text-sm text-amber-900">{rescheduleListError}</p>
                  )}
                  {rescheduleSharedPhone && rescheduleList.length > 0 && (
                    <p className="text-sm leading-relaxed text-[#14532d]">
                      This number is shared by more than one patient profile — we&apos;re showing everyone&apos;s upcoming visits
                      under this line. Pick the visit you want to change or cancel.
                    </p>
                  )}
                  {rescheduleList.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Reschedule or cancel — same cell number must match the booking
                      </p>
                      {rescheduleList.map((row) => (
                        <div
                          key={row.id}
                          className="flex flex-col gap-2 rounded-xl border border-border/90 bg-card p-3 sm:flex-row sm:items-center"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setReschedulePick(row);
                              setSlotWarning("");
                              setStep(2);
                            }}
                            className="min-w-0 flex-1 rounded-lg border border-transparent p-2 text-left transition-all hover:border-[#16a349]/40 hover:bg-[#f0fdf4]/50"
                          >
                            <p className="font-semibold text-slate-900">{row.service_name}</p>
                            {row.patient_name ? (
                              <p className="text-xs font-medium text-slate-500">Patient: {row.patient_name}</p>
                            ) : null}
                            <p className="mt-1 text-sm text-slate-600">
                              {row.provider_name} ·{" "}
                              {formatWeekdayMonthDayYear(row.appointment_date)} at {row.start_time}
                            </p>
                            <p className="mt-1 text-[11px] text-[#166534]">Tap to pick a new time →</p>
                          </button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-auto shrink-0 rounded-xl border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-800 hover:bg-rose-50"
                            onClick={() => void cancelPublicAppointment(row)}
                          >
                            Cancel visit
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {bookingFlow === "new" && optionsError && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-rose-700">{optionsError}</p>
                  <Button type="button" onClick={fetchOptions} disabled={optionsLoading} size="sm" className="h-auto rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm">
                    {optionsLoading ? "Retrying…" : "Retry"}
                  </Button>
                </div>
              )}
              {bookingFlow === "new" && !options && !optionsError && (
                <Loader variant="page" label="Loading services" sublabel="Fetching available visits and times…" />
              )}

              {/* Cart items already added */}
              {bookingFlow === "new" && options && cart.length > 0 && !addingAnother && !selectedCategory && (
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold">Your selected services</h2>
                  {cart.some((c) => c.service.service_type === "chiropractic") && !chiroGapBlocksCart ? (
                    <p className="text-xs leading-snug text-slate-600">
                      New or returning after 2+ years? Pick <span className="font-medium text-slate-800">New Office Visit</span> from the list.
                    </p>
                  ) : null}
                  <div className="space-y-2">
                    {cart.map((item) => (
                      <div key={item.lineId} className="flex items-center justify-between rounded-xl border-2 border-primary/30 bg-primary/[0.06] p-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                              <IconCheck className="h-3 w-3" />
                            </span>
                            <p className="font-semibold text-[#0d5c2e]">{item.service.name}</p>
                          </div>
                          <p className="ml-7 text-sm text-muted-foreground">
                            {item.service.duration_minutes} min · {formatBookingPrice(item.service.price)}
                            {item.provider && !item.providerSkipped ? ` · ${item.provider.provider_name}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.lineId)}
                          className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>

                  {otherCategoryAvailable && (
                    <button
                      type="button"
                      onClick={() => { setAddingAnother(true); setSelectedCategory(otherCategoryAvailable); }}
                      className="w-full rounded-xl border-2 border-dashed border-primary/30 p-4 text-sm font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-primary/[0.04]"
                    >
                      + Add a {otherCategoryAvailable === "chiropractic" ? "chiropractic" : "massage"} service
                    </button>
                  )}

                  <Button
                    type="button"
                    onClick={proceedFromStep1}
                    className="h-auto w-full rounded-xl bg-foreground px-6 py-3 text-base font-semibold text-background hover:bg-foreground/90"
                  >
                    Continue to scheduling
                  </Button>
                </div>
              )}

              {/* Category selection (empty cart or adding another) */}
              {bookingFlow === "new" && options && cart.length === 0 && !selectedCategory && (
                <>
                  <h2 className="text-lg font-semibold">Choose a category</h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {chiroServices.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedCategory("chiropractic")}
                        className="group rounded-xl border-2 border-primary/20 bg-primary/[0.07] p-5 text-left transition-all hover:border-primary/40 hover:shadow-md"
                      >
                        <p className="text-xs font-bold uppercase tracking-wide text-[#166534]">Chiropractic</p>
                        <p className="mt-2 text-sm text-slate-600">{chiroServices.length} service{chiroServices.length !== 1 ? "s" : ""} available</p>
                        <p className="mt-3 text-xs font-medium text-primary group-hover:underline">View services →</p>
                      </button>
                    )}
                    {massageServices.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedCategory("massage")}
                        className="group rounded-xl border-2 border-amber-200/80 bg-amber-50/90 p-5 text-left transition-all hover:border-amber-400/60 hover:shadow-md"
                      >
                        <p className="text-xs font-bold uppercase tracking-wide text-amber-900/90">Massage</p>
                        <p className="mt-2 text-sm text-slate-600">{massageServices.length} service{massageServices.length !== 1 ? "s" : ""} available</p>
                        <p className="mt-3 text-xs font-medium text-amber-700 group-hover:underline">View services →</p>
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* Service list for selected category */}
              {bookingFlow === "new" && options && selectedCategory && (
                <>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => { setSelectedCategory(null); if (addingAnother && cart.length > 0) setAddingAnother(false); }}
                      className="rounded-lg border border-border/80 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-muted/60"
                    >
                      ← Back
                    </button>
                    <h2 className="text-lg font-semibold">
                      {selectedCategory === "chiropractic" ? "Chiropractic" : "Massage"} services
                    </h2>
                  </div>
                  {selectedCategory === "chiropractic" ? (
                    <p className="rounded-lg border border-[#166534]/20 bg-[#ecfdf5]/80 px-3 py-2 text-xs text-slate-700">
                      New or returning after 2+ years? Select <strong className="text-slate-900">New Office Visit</strong>.
                    </p>
                  ) : null}
                  <div className="space-y-2">
                    {servicesForCategory
                      .filter((svc) => !cart.some((c) => c.service.id === svc.id))
                      .map((service) => (
                        <button
                          key={service.id}
                          type="button"
                          onClick={() => addServiceToCart(service)}
                          className="w-full rounded-xl border border-border/90 bg-card p-4 text-left transition-all hover:border-primary/25 hover:shadow-sm"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm">
                              {service.service_type === "chiropractic" ? "🦴" : "💆"}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-foreground">{service.name}</p>
                                {service.is_new_client_intake ? (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                                    New patient / reactivation
                                  </span>
                                ) : null}
                              </div>
                              {service.description && (
                                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{service.description}</p>
                              )}
                              <p className="mt-1 text-sm font-medium text-muted-foreground">
                                {service.duration_minutes} min · {formatBookingPrice(service.price)}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─── STEP 2: Provider selection (new) or visit summary (reschedule) ─── */}
          {step === 2 && (
            <div className="animate-fade-in-up space-y-4">
              {bookingFlow === "reschedule" && reschedulePick ? (
                <div className="space-y-4 rounded-xl border border-[#166534]/20 bg-[#f0fdf4]/40 p-4">
                  <h2 className="text-lg font-semibold text-[#0d5c2e]">Visit you&apos;re moving</h2>
                  <p className="text-sm text-slate-600">
                    You can change the <strong className="text-slate-800">date and time</strong> only. The visit type and
                    doctor stay the same. Pick a new slot in the next step — we only show times that are open for this
                    visit.
                  </p>
                  <ul className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800">
                    <li>
                      <span className="text-slate-500">Service: </span>
                      <span className="font-medium">{reschedulePick.service_name}</span>
                    </li>
                    <li>
                      <span className="text-slate-500">Doctor: </span>
                      <span className="font-medium">{reschedulePick.provider_name}</span>
                    </li>
                    <li>
                      <span className="text-slate-500">Currently scheduled: </span>
                      <span className="font-medium">
                        {formatWeekdayMonthDayYear(reschedulePick.appointment_date)}{" "}
                        at {reschedulePick.start_time}
                      </span>
                    </li>
                  </ul>
                  <Button
                    type="button"
                    onClick={() => setStep(3)}
                    className="h-auto w-full rounded-xl bg-foreground px-6 py-3 text-base font-semibold text-background hover:bg-foreground/90 sm:w-auto"
                  >
                    Choose new date &amp; time
                  </Button>
                </div>
              ) : (
                <>
              <h2 className="text-lg font-semibold">Choose your provider</h2>
              {needsProviderSelection ? (
                <p className="text-sm text-slate-600">
                  Pick a therapist for each massage below. (Chiropractic does not use this step — you already chose your
                  visit type.)
                </p>
              ) : null}
              {cart.filter((c) => !c.provider && !c.providerSkipped).map((item) => {
                const providers = options?.providers_by_service?.[item.service.id] ?? [];
                return (
                  <div key={item.lineId} className="space-y-2">
                    <p className="text-sm text-slate-600">
                      For <span className="font-medium text-slate-900">{item.service.name}</span>:
                    </p>
                    {providers.length === 0 ? (
                      <p className="text-slate-500">No providers available. Please choose another service.</p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-3">
                        {providers.map((provider) => (
                          <button
                            key={provider.id}
                            type="button"
                            onClick={() => {
                              setCart((prev) =>
                                prev.map((c) =>
                                  c.lineId === item.lineId ? { ...c, provider, providerSkipped: false } : c,
                                ),
                              );
                            }}
                            className={cn(
                              "rounded-xl border p-3 text-sm font-medium transition-all",
                              item.provider?.id === provider.id
                                ? "border-primary/40 bg-primary/8 shadow-sm ring-1 ring-primary/15"
                                : "border-border/90 hover:border-primary/20 hover:bg-muted/50",
                            )}
                          >
                            {provider.provider_name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {!needsProviderSelection && (
                <Button
                  type="button"
                  onClick={() => setStep(3)}
                  className="h-auto rounded-xl bg-foreground px-6 py-3 text-sm font-semibold text-background hover:bg-foreground/90"
                >
                  Continue
                </Button>
              )}
                </>
              )}
            </div>
          )}

          {/* ─── STEP 3: Date & time ─── */}
          {step === 3 && (
            <div className="animate-fade-in-up space-y-4">
              <h2 className="text-lg font-semibold">
                {bookingFlow === "reschedule" ? "Pick your new date & time" : "Select date & time"}
              </h2>
              {bookingFlow === "new" && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <label className="block text-sm font-semibold text-slate-800">
                    Please let us know what concern you would like your provider to address during the visit (optional)
                  </label>
                  <textarea
                    className="mt-2 min-h-[96px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15"
                    placeholder="Example: neck pain, lower back tightness, headache, shoulder discomfort..."
                    value={reasonForVisit}
                    onChange={(e) => setReasonForVisit(e.target.value)}
                  />
                </div>
              )}

              {bookingFlow === "new" && bookingResults.length > 0 && (
                <div className="rounded-xl border border-[#16a349]/30 bg-[#f0fdf4] p-4 text-sm text-[#14532d]">
                  <p className="font-semibold">Some visits are already confirmed</p>
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    {bookingResults.map((r) => (
                      <li key={r.appointment_id}>
                        {r.service} · {formatWeekdayMonthDayYear(r.appointment_date)} at {r.start_time}{" "}
                        (confirmation #{r.appointment_id})
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[13px] leading-relaxed">
                    Choose new open times below for the remaining visit(s), then tap <strong>Next</strong>.
                  </p>
                </div>
              )}

              {bookingFlow === "reschedule" && (
              <>
              {/* Month calendar: up to 6 months ahead */}
              <div className="rounded-xl border-2 border-primary/25 bg-primary/[0.06] p-4 ring-1 ring-primary/10">
                <label className="mb-1 block text-sm font-semibold text-foreground">Pick a date</label>
                <p className="mb-3 text-xs leading-relaxed text-slate-600">
                  Book up to <strong className="font-medium text-slate-800">6 months</strong> ahead. Use the arrows to
                  change month.
                </p>
                {(() => {
                  const monthStart = startOfCalendarMonth(bookingCalendarMonth);
                  const firstDow = monthStart.getDay();
                  const daysInMonth = new Date(
                    monthStart.getFullYear(),
                    monthStart.getMonth() + 1,
                    0,
                    12,
                    0,
                    0,
                    0,
                  ).getDate();
                  const todayMonthStart = startOfCalendarMonth(new Date(`${today}T12:00:00`));
                  const canPrevMonth =
                    monthStart.getFullYear() > todayMonthStart.getFullYear() ||
                    (monthStart.getFullYear() === todayMonthStart.getFullYear() &&
                      monthStart.getMonth() > todayMonthStart.getMonth());
                  const nextMonthFirstIso = toLocalISODate(addCalendarMonths(monthStart, 1));
                  const canNextMonth = nextMonthFirstIso <= maxBookDateIso;
                  const cells: (Date | null)[] = [];
                  for (let i = 0; i < firstDow; i++) cells.push(null);
                  for (let day = 1; day <= daysInMonth; day++) {
                    cells.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), day, 12, 0, 0, 0));
                  }
                  while (cells.length % 7 !== 0) cells.push(null);
                  return (
                    <>
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          aria-label="Previous month"
                          disabled={!canPrevMonth}
                          onClick={() => setBookingCalendarMonth((m) => addCalendarMonths(m, -1))}
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50",
                            !canPrevMonth && "cursor-not-allowed opacity-40",
                          )}
                        >
                          <IconChevronLeft className="h-4 w-4" />
                        </button>
                        <p className="min-w-0 flex-1 text-center text-sm font-semibold text-slate-900 sm:text-base">
                          {formatMonthDayYear(monthStart.toISOString().slice(0, 10))}
                        </p>
                        <button
                          type="button"
                          aria-label="Next month"
                          disabled={!canNextMonth}
                          onClick={() => setBookingCalendarMonth((m) => addCalendarMonths(m, 1))}
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50",
                            !canNextMonth && "cursor-not-allowed opacity-40",
                          )}
                        >
                          <IconChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-7 gap-1 text-center sm:gap-1.5">
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                          <div
                            key={d}
                            className="pb-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 sm:text-[11px] sm:tracking-wider"
                          >
                            {d}
                          </div>
                        ))}
                        {cells.map((d, idx) => {
                          if (!d) {
                            return <div key={`pad-${idx}`} className="h-9 sm:h-11" aria-hidden />;
                          }
                          const iso = toLocalISODate(d);
                          const isPast = iso < today;
                          const isAfterMax = iso > maxBookDateIso;
                          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                          const isDisabled = isPast || isWeekend || isAfterMax;
                          const isSelected = iso === selectedDate;
                          const isTodayCell = iso === today;
                          return (
                            <button
                              key={iso}
                              type="button"
                              disabled={isDisabled}
                              onClick={() => setSelectedDate(iso)}
                              className={cn(
                                "relative flex h-9 w-full items-center justify-center rounded-lg text-xs font-medium transition-all sm:h-11 sm:text-sm",
                                isDisabled
                                  ? "cursor-not-allowed text-slate-300"
                                  : isSelected
                                    ? "bg-[#16a349] font-bold text-white shadow-md shadow-[#16a349]/25"
                                    : "hover:bg-primary/10 text-slate-700",
                                isTodayCell && !isSelected && "ring-2 ring-[#16a349]/40",
                              )}
                            >
                              {d.getDate()}
                              {isTodayCell && (
                                <span
                                  className={cn(
                                    "absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full",
                                    isSelected ? "bg-white" : "bg-[#16a349]",
                                  )}
                                  aria-hidden
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
                <p className="mt-3 text-sm text-slate-600">
                  Selected:{" "}
                  <strong className="text-[#166534]">
                    {formatWeekdayMonthDayYear(selectedDate)}
                  </strong>
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  Online booking is <strong className="font-medium text-slate-700">Monday–Friday</strong> only (closed
                  weekends). Chiropractic: 8:00 AM–6:00 PM; massage: 9:00 AM–6:00 PM;{" "}
                  <strong className="font-medium text-slate-700">Friday we close at 4:00 PM</strong>. Times shown match
                  your visit type and the schedule.
                </p>
              </div>

              {/* Time slots grouped by period */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Available time</label>
                {slotsLoading && <Loader variant="dots" label="Checking availability…" className="mb-2" />}
                {(() => {
                  if (slotsLoading) {
                    return null;
                  }
                  if (availableSlots === null) {
                    return (
                      <p className="text-sm text-slate-500">
                        Select a date — open times load from the clinic schedule (Friday closes at 4:00 PM).
                      </p>
                    );
                  }
                  const slotsToShow = availableSlots;
                  if (slotsToShow.length === 0) {
                    return (
                      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                        No open times on this day — try another date or call the clinic.
                      </p>
                    );
                  }
                  const parseHour = (s: string) => {
                    const m = s.match(/^(\d+):.*\s*(AM|PM)$/i);
                    if (!m) return 12;
                    let h = parseInt(m[1], 10);
                    if (m[2].toUpperCase() === "PM" && h !== 12) h += 12;
                    if (m[2].toUpperCase() === "AM" && h === 12) h = 0;
                    return h;
                  };
                  const morning = slotsToShow.filter((s) => parseHour(s) < 12);
                  const afternoon = slotsToShow.filter((s) => { const h = parseHour(s); return h >= 12 && h < 17; });
                  const evening = slotsToShow.filter((s) => parseHour(s) >= 17);
                  const groups = [
                    { label: "Morning", slots: morning, icon: "☀️" },
                    { label: "Afternoon", slots: afternoon, icon: "🌤" },
                    { label: "Evening", slots: evening, icon: "🌙" },
                  ].filter((g) => g.slots.length > 0);
                  return (
                    <div className="space-y-3">
                      {groups.map((group) => (
                        <div key={group.label}>
                          <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                            {group.icon} {group.label} · {group.slots.length} {group.slots.length === 1 ? "slot" : "slots"}
                          </p>
                          <div className="grid gap-2 sm:grid-cols-3">
                            {group.slots.map((slot) => (
                              <button
                                key={slot}
                                type="button"
                                onClick={() => { setSelectedTime(slot); setSlotWarning(""); setStep(4); }}
                                className={cn(
                                  "rounded-xl border px-4 py-3 text-sm font-medium transition-all",
                                  selectedTime === slot
                                    ? "border-primary bg-primary/10 font-semibold text-[#0d5c2e] shadow-sm ring-1 ring-primary/15"
                                    : "border-border/90 hover:border-primary/30 hover:bg-muted/40",
                                )}
                              >
                                {slot}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
              {slotWarning && <p className="text-sm font-medium text-rose-700">{slotWarning}</p>}
              </>
              )}

              {bookingFlow === "new" && (
                <div className="space-y-8">
                  {cart.map((item) => {
                    const pick = cartSlotPicksByLineId[item.lineId];
                    if (!pick) return null;
                    const lineErr = bookingSubmitErrorByLineId[item.lineId];
                    const monthStored = cartCalendarMonthByLineId[item.lineId];
                    const monthStartCal = startOfCalendarMonth(
                      monthStored ?? new Date(`${pick.date}T12:00:00`),
                    );
                    const slotsLine = cartSlotsByLineId[item.lineId];
                    const loadingLine = cartSlotsLoadingByLineId[item.lineId];
                    const parseHour = (s: string) => {
                      const m = s.match(/^(\d+):.*\s*(AM|PM)$/i);
                      if (!m) return 12;
                      let h = parseInt(m[1], 10);
                      if (m[2].toUpperCase() === "PM" && h !== 12) h += 12;
                      if (m[2].toUpperCase() === "AM" && h === 12) h = 0;
                      return h;
                    };
                    const morning = (slotsLine ?? []).filter((s) => parseHour(s) < 12);
                    const afternoon = (slotsLine ?? []).filter((s) => {
                      const h = parseHour(s);
                      return h >= 12 && h < 17;
                    });
                    const evening = (slotsLine ?? []).filter((s) => parseHour(s) >= 17);
                    const groups = [
                      { label: "Morning", slots: morning, icon: "☀️" },
                      { label: "Afternoon", slots: afternoon, icon: "🌤" },
                      { label: "Evening", slots: evening, icon: "🌙" },
                    ].filter((g) => g.slots.length > 0);
                    const firstDowCal = monthStartCal.getDay();
                    const daysInMonthCal = new Date(
                      monthStartCal.getFullYear(),
                      monthStartCal.getMonth() + 1,
                      0,
                      12,
                      0,
                      0,
                      0,
                    ).getDate();
                    const todayMonthStartCal = startOfCalendarMonth(new Date(`${today}T12:00:00`));
                    const canPrevMonthCal =
                      monthStartCal.getFullYear() > todayMonthStartCal.getFullYear() ||
                      (monthStartCal.getFullYear() === todayMonthStartCal.getFullYear() &&
                        monthStartCal.getMonth() > todayMonthStartCal.getMonth());
                    const nextMonthFirstIsoCal = toLocalISODate(addCalendarMonths(monthStartCal, 1));
                    const canNextMonthCal = nextMonthFirstIsoCal <= maxBookDateIso;
                    const cellsCal: (Date | null)[] = [];
                    for (let i = 0; i < firstDowCal; i++) cellsCal.push(null);
                    for (let day = 1; day <= daysInMonthCal; day++) {
                      cellsCal.push(
                        new Date(monthStartCal.getFullYear(), monthStartCal.getMonth(), day, 12, 0, 0, 0),
                      );
                    }
                    while (cellsCal.length % 7 !== 0) cellsCal.push(null);

                    return (
                      <div
                        key={item.lineId}
                        id={`booking-schedule-${item.lineId}`}
                        className="rounded-2xl border-2 border-primary/20 bg-primary/[0.04] p-4 ring-1 ring-primary/10 scroll-mt-24"
                      >
                        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                          <div>
                            <p className="text-base font-bold text-slate-900">{item.service.name}</p>
                            <p className="text-sm text-slate-600">
                              {item.service.duration_minutes} min · {formatBookingPrice(item.service.price)}
                              {item.provider && !item.providerSkipped
                                ? ` · ${item.provider.provider_name}`
                                : ""}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-[#166534]">
                            {formatWeekdayMonthDayYear(pick.date)} at {pick.time}
                          </p>
                        </div>
                        {lineErr ? (
                          <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                            {lineErr}
                          </p>
                        ) : null}

                        <div className="rounded-xl border-2 border-primary/25 bg-white p-4 ring-1 ring-primary/10">
                          <label className="mb-1 block text-sm font-semibold text-foreground">Pick a date</label>
                          <p className="mb-3 text-xs leading-relaxed text-slate-600">
                            Book up to <strong className="font-medium text-slate-800">6 months</strong> ahead. Use the
                            arrows to change month.
                          </p>
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              aria-label="Previous month"
                              disabled={!canPrevMonthCal}
                              onClick={() =>
                                setCartCalendarMonthByLineId((p) => ({
                                  ...p,
                                  [item.lineId]: addCalendarMonths(monthStartCal, -1),
                                }))
                              }
                              className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50",
                                !canPrevMonthCal && "cursor-not-allowed opacity-40",
                              )}
                            >
                              <IconChevronLeft className="h-4 w-4" />
                            </button>
                            <p className="min-w-0 flex-1 text-center text-sm font-semibold text-slate-900 sm:text-base">
                              {formatMonthDayYear(monthStartCal.toISOString().slice(0, 10))}
                            </p>
                            <button
                              type="button"
                              aria-label="Next month"
                              disabled={!canNextMonthCal}
                              onClick={() =>
                                setCartCalendarMonthByLineId((p) => ({
                                  ...p,
                                  [item.lineId]: addCalendarMonths(monthStartCal, 1),
                                }))
                              }
                              className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50",
                                !canNextMonthCal && "cursor-not-allowed opacity-40",
                              )}
                            >
                              <IconChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-7 gap-1 text-center sm:gap-1.5">
                            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                              <div
                                key={`${item.lineId}-${d}`}
                                className="pb-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 sm:text-[11px] sm:tracking-wider"
                              >
                                {d}
                              </div>
                            ))}
                            {cellsCal.map((d, idx) => {
                              if (!d) {
                                return <div key={`pad-${item.lineId}-${idx}`} className="h-9 sm:h-11" aria-hidden />;
                              }
                              const iso = toLocalISODate(d);
                              const isPast = iso < today;
                              const isAfterMax = iso > maxBookDateIso;
                              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                              const isDisabled = isPast || isWeekend || isAfterMax;
                              const isSelected = iso === pick.date;
                              const isTodayCell = iso === today;
                              return (
                                <button
                                  key={iso}
                                  type="button"
                                  disabled={isDisabled}
                                  onClick={() => {
                                    setCartSlotPicksByLineId((p) => ({
                                      ...p,
                                      [item.lineId]: { ...p[item.lineId], date: iso },
                                    }));
                                    setBookingSubmitErrorByLineId((e) => {
                                      const n = { ...e };
                                      delete n[item.lineId];
                                      return n;
                                    });
                                  }}
                                  className={cn(
                                    "relative flex h-9 w-full items-center justify-center rounded-lg text-xs font-medium transition-all sm:h-11 sm:text-sm",
                                    isDisabled
                                      ? "cursor-not-allowed text-slate-300"
                                      : isSelected
                                        ? "bg-[#16a349] font-bold text-white shadow-md shadow-[#16a349]/25"
                                        : "hover:bg-primary/10 text-slate-700",
                                    isTodayCell && !isSelected && "ring-2 ring-[#16a349]/40",
                                  )}
                                >
                                  {d.getDate()}
                                  {isTodayCell && (
                                    <span
                                      className={cn(
                                        "absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full",
                                        isSelected ? "bg-white" : "bg-[#16a349]",
                                      )}
                                      aria-hidden
                                    />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          <p className="mt-3 text-sm text-slate-600">
                            Selected:{" "}
                            <strong className="text-[#166534]">{formatWeekdayMonthDayYear(pick.date)}</strong>
                          </p>
                        </div>

                        <div className="mt-4">
                          <label className="mb-2 block text-sm font-semibold text-slate-700">Available time</label>
                          {loadingLine && (
                            <Loader variant="dots" label="Checking availability…" className="mb-2" />
                          )}
                          {!item.provider ? (
                            <p className="text-sm text-slate-500">Choose a provider in Step 2 to see open times.</p>
                          ) : loadingLine ? null : !Array.isArray(slotsLine) ? (
                            <p className="text-sm text-slate-500">Loading open times…</p>
                          ) : slotsLine.length === 0 ? (
                            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                              No open times on this day — try another date or call the clinic.
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {groups.map((group) => (
                                <div key={group.label}>
                                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                                    {group.icon} {group.label} · {group.slots.length}{" "}
                                    {group.slots.length === 1 ? "slot" : "slots"}
                                  </p>
                                  <div className="grid gap-2 sm:grid-cols-3">
                                    {group.slots.map((slot) => (
                                      <button
                                        key={slot}
                                        type="button"
                                        onClick={() => {
                                          setCartSlotPicksByLineId((p) => ({
                                            ...p,
                                            [item.lineId]: { ...p[item.lineId], time: slot },
                                          }));
                                          setBookingSubmitErrorByLineId((e) => {
                                            const n = { ...e };
                                            delete n[item.lineId];
                                            return n;
                                          });
                                        }}
                                        className={cn(
                                          "rounded-xl border px-4 py-3 text-sm font-medium transition-all",
                                          pick.time === slot
                                            ? "border-primary bg-primary/10 font-semibold text-[#0d5c2e] shadow-sm ring-1 ring-primary/15"
                                            : "border-border/90 hover:border-primary/30 hover:bg-muted/40",
                                        )}
                                      >
                                        {slot}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-xs text-slate-500">
                    Mon–Fri only · Chiro from 8:00 AM · Massage from 9:00 AM · Fri closes 4:00 PM
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 4: Details & submit (new) or confirm reschedule ─── */}
          {step === 4 && bookingResults.length === 0 && bookingFlow === "reschedule" && reschedulePick && (
            <div className="animate-fade-in-up space-y-4">
              <h2 className="text-lg font-semibold">Confirm your new time</h2>
              <p className="text-sm text-slate-600">
                We&apos;ll move <strong className="text-slate-900">{reschedulePick.service_name}</strong> with{" "}
                <strong className="text-slate-900">{reschedulePick.provider_name}</strong> to the time you picked. Your
                cell number must match the booking.
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-800">
                <p>
                  <span className="text-slate-500">New time: </span>
                  <span className="font-semibold">
                    {formatWeekdayMonthDayYear(selectedDate)} at {selectedTime}
                  </span>
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  Was:{" "}
                  {formatWeekdayMonthDayYear(reschedulePick.appointment_date)} at {reschedulePick.start_time}
                </p>
              </div>
              <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <Checkbox
                  id="sms-consent-reschedule"
                  checked={smsConsent}
                  onCheckedChange={setSmsConsent}
                  className="mt-0.5"
                />
                <label htmlFor="sms-consent-reschedule" className="cursor-pointer text-sm leading-relaxed text-slate-700">
                  By checking this box, I consent to receive SMS text message appointment reminders and updates from Relief
                  Chiropractic at the phone number I provided. Message & data rates may apply. Reply STOP to opt out at any
                  time. View our Terms of Service:{" "}
                  <a
                    href="https://www.reliefchiropractic.net/terms-of-service-3"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[#16a349] underline decoration-[#16a349]/50 underline-offset-2 hover:text-[#13823d]"
                  >
                    https://www.reliefchiropractic.net/terms-of-service-3
                  </a>
                </label>
              </div>
              <Button
                type="button"
                onClick={() => void submitReschedule()}
                disabled={isSubmitting || !phone || !isValidPhoneNumber(phone) || !smsConsent}
                className="h-auto w-full max-w-xs rounded-xl bg-[#e9982f] px-6 py-3 text-base font-semibold text-white shadow-md shadow-[#e9982f]/25 hover:bg-[#cf8727] sm:w-auto"
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader variant="spinner" />
                    Updating…
                  </span>
                ) : (
                  "Confirm new time"
                )}
              </Button>
              {bookingMessage && (
                <p className={`text-sm font-medium ${bookingMessageKind === "success" ? "text-[#166534]" : "text-rose-700"}`}>
                  {bookingMessage}
                </p>
              )}
            </div>
          )}

          {step === 4 && bookingFlow === "new" && cart.length > 0 && (
            <div className="animate-fade-in-up space-y-5">
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">Review your appointments</h2>
                <p className="text-sm leading-relaxed text-slate-600">
                  {cart.length > 1 ? (
                    <>
                      Each block below is a <strong className="font-semibold text-slate-800">separate appointment</strong>
                      —not one combined visit. You can edit one date or time without changing the others.
                    </>
                  ) : (
                    <>
                      Confirm the visit below matches what you want before you enter your contact info—this books{" "}
                      <strong className="font-semibold text-slate-800">one independent appointment</strong>.
                    </>
                  )}
                </p>
                <div className="space-y-3">
                  {cart.map((item) => {
                    const pick = cartSlotPicksByLineId[item.lineId];
                    const providerLabel = item.provider?.provider_name ?? "—";
                    return (
                      <div
                        key={item.lineId}
                        className="rounded-xl border border-border/90 bg-card p-4 shadow-sm ring-1 ring-slate-100/80"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1 space-y-2">
                            <p className="text-base font-bold text-slate-900">{item.service.name}</p>
                            <dl className="grid gap-1.5 text-sm text-slate-700">
                              <div className="flex flex-wrap gap-x-2">
                                <dt className="font-semibold text-slate-600">Provider</dt>
                                <dd>{providerLabel}</dd>
                              </div>
                              <div className="flex flex-wrap gap-x-2">
                                <dt className="font-semibold text-slate-600">Date</dt>
                                <dd>
                                  {pick?.date ? formatWeekdayMonthDayYear(pick.date) : "—"}
                                </dd>
                              </div>
                              <div className="flex flex-wrap gap-x-2">
                                <dt className="font-semibold text-slate-600">Time</dt>
                                <dd>{pick?.time ?? "—"}</dd>
                              </div>
                              <div className="flex flex-wrap gap-x-2">
                                <dt className="font-semibold text-slate-600">Duration &amp; price</dt>
                                <dd>
                                  {item.service.duration_minutes} min · {formatBookingPrice(item.service.price)}
                                </dd>
                              </div>
                            </dl>
                          </div>
                          <button
                            type="button"
                            onClick={() => goEditScheduleLine(item.lineId)}
                            className="shrink-0 rounded-xl border border-[#16a349]/40 bg-white px-4 py-2 text-sm font-semibold text-[#0d5c2e] shadow-sm transition hover:bg-[#f0fdf4]"
                          >
                            Edit date &amp; time
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-border/80 pt-5 space-y-3">
              <h2 className="text-lg font-semibold">Your details</h2>
              <p className="text-sm text-slate-600">
                Cell required; email optional. We&apos;ll look up your info when you enter your number.
              </p>
              <p className="rounded-xl border border-[#16a349]/20 bg-[#f0fdf4]/70 px-3 py-2 text-sm text-[#14532d]">
                Booking for someone else? Use their legal name—the phone number can be a parent or guardian&apos;s.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Cell number <span className="text-rose-600">*</span>
                  </label>
                  <div className={`rounded-lg border bg-white p-2 ${formErrors.phone ? "border-rose-400 bg-rose-50" : "border-slate-200"}`}>
                    <PhoneInput
                      international defaultCountry="US" countryCallingCodeEditable={false}
                      value={phone}
                      onChange={(value) => {
                        setPhone(value);
                        setFormErrors((p) => ({ ...p, phone: undefined }));
                        setPatientLookup("idle");
                        setLookupSavedCard(null);
                        setChiroIntakeRule(null);
                        setHouseholdPickList([]);
                      }}
                      placeholder="Enter cell number" className="phone-field text-sm"
                    />
                  </div>
                  {formErrors.phone && <p className="mt-1 text-xs text-rose-700">{formErrors.phone}</p>}
                  {patientLookup === "loading" && <p className="mt-1 text-sm text-slate-500">Looking up…</p>}
                  {patientLookup === "returning" && firstName && (
                    <p className="mt-2 rounded-lg bg-[#16a349]/10 px-3 py-2 text-sm font-medium text-[#166534]">
                      Welcome back, {firstName}! We&apos;ve filled in your details.
                    </p>
                  )}
                  {patientLookup === "ambiguous" && (
                    <div className="mt-2 space-y-2 rounded-lg border border-[#166534]/25 bg-[#f0fdf4]/80 px-3 py-2 text-sm text-[#14532d]">
                      <p className="font-medium">This number is linked to more than one person here.</p>
                      <p className="text-[13px] leading-relaxed text-[#166534]/90">
                        Enter the first and last name of the patient who is coming in, or tap a saved name below.
                      </p>
                      {householdPickList.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {householdPickList.map((m) => (
                            <Button
                              key={`${m.first_name}-${m.last_name}`}
                              type="button"
                              variant="outline"
                              className="h-auto rounded-full border-[#16a349]/40 bg-white px-3 py-1.5 text-xs font-semibold text-[#14532d] hover:bg-[#f0fdf4]"
                              onClick={() => {
                                setFirstName(m.first_name);
                                setLastName(m.last_name);
                              }}
                            >
                              {m.first_name} {m.last_name}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {patientLookup === "new" && (
                    <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">First visit? Please fill in your details below.</p>
                  )}
                </div>
                <input className={`rounded-lg border p-2 ${formErrors.firstName ? "border-rose-400 bg-rose-50" : "border-slate-200"}`} placeholder="First name" value={firstName} onChange={(e) => { setFirstName(e.target.value); setFormErrors((p) => ({ ...p, firstName: undefined })); }} />
                {formErrors.firstName && <p className="-mt-2 text-xs text-rose-700">{formErrors.firstName}</p>}
                <input className={`rounded-lg border p-2 ${formErrors.lastName ? "border-rose-400 bg-rose-50" : "border-slate-200"}`} placeholder="Last name" value={lastName} onChange={(e) => { setLastName(e.target.value); setFormErrors((p) => ({ ...p, lastName: undefined })); }} />
                {formErrors.lastName && <p className="-mt-2 text-xs text-rose-700">{formErrors.lastName}</p>}
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Email <span className="font-normal normal-case text-slate-400">(optional)</span>
                  </label>
                  <input
                    type="email"
                    autoComplete="email"
                    className={`w-full rounded-lg border p-2 ${formErrors.email ? "border-rose-400 bg-rose-50" : "border-slate-200"}`}
                    placeholder="Optional — for confirmation email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setFormErrors((p) => ({ ...p, email: undefined }));
                    }}
                  />
                  {formErrors.email && <p className="mt-1 text-xs text-rose-700">{formErrors.email}</p>}
                </div>
              </div>
              <BookingCardSetup
                firstName={firstName}
                lastName={lastName}
                email={email}
                phone={phone}
                existingSavedCard={lookupSavedCard}
              />
              <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <Checkbox
                  id="sms-consent-new"
                  checked={smsConsent}
                  onCheckedChange={setSmsConsent}
                  className="mt-0.5"
                />
                <label htmlFor="sms-consent-new" className="cursor-pointer text-sm leading-relaxed text-slate-700">
                  By checking this box, I consent to receive SMS text message appointment reminders and updates from Relief
                  Chiropractic at the phone number I provided. Message & data rates may apply. Reply STOP to opt out at any
                  time. View our Terms of Service:{" "}
                  <a
                    href="https://www.reliefchiropractic.net/terms-of-service-3"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[#16a349] underline decoration-[#16a349]/50 underline-offset-2 hover:text-[#13823d]"
                  >
                    https://www.reliefchiropractic.net/terms-of-service-3
                  </a>
                </label>
              </div>
              <Button
                type="button"
                onClick={() => void submitBooking()}
                disabled={isSubmitting || !smsConsent}
                className="h-auto w-full max-w-xs rounded-xl bg-[#e9982f] px-6 py-3 text-base font-semibold text-white shadow-md shadow-[#e9982f]/25 hover:bg-[#cf8727] sm:w-auto"
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2"><Loader variant="spinner" />Confirming…</span>
                ) : cart.length > 1 ? (
                  `Confirm ${cart.length} appointments`
                ) : (
                  "Confirm appointment"
                )}
              </Button>
              {bookingMessage && (
                <p className={`text-sm font-medium ${bookingMessageKind === "success" ? "text-[#166534]" : "text-rose-700"}`}>{bookingMessage}</p>
              )}
              </div>
            </div>
          )}

          {/* ─── STEP 4: Confirmation ─── */}
          {step === 4 && bookingResults.length > 0 && cart.length === 0 && (
            <div className="animate-fade-in-up rounded-2xl border border-[#16a349]/25 bg-gradient-to-b from-[#f0fdf4] to-white p-6 sm:p-8">
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#16a349] text-white shadow-md shadow-[#16a349]/25" aria-hidden>
                  <IconCheck className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Thank you!</h2>
                <p className="mt-2 max-w-md text-sm text-slate-600 sm:text-base">
                  {bookingFlow === "reschedule"
                    ? "Your appointment has been updated to the new date and time. We look forward to seeing you."
                    : bookingResults.length > 1
                      ? "Both appointments are confirmed. We look forward to seeing you."
                      : "Your appointment is confirmed. We look forward to seeing you."}
                </p>
              </div>

              <div className="mx-auto mt-6 max-w-md space-y-4">
                {bookingResults.map((result, idx) => (
                  <div key={result.appointment_id} className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm">
                    {bookingResults.length > 1 && (
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">Appointment {idx + 1}</p>
                    )}
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confirmation</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">#{result.appointment_id}</p>
                    <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm text-slate-700">
                      <li><span className="text-slate-500">Patient: </span><span className="font-medium text-slate-900">{result.patient}</span></li>
                      <li><span className="text-slate-500">Service: </span><span className="font-medium text-slate-900">{result.service}</span></li>
                      <li>
                        <span className="text-slate-500">When: </span>
                        <span className="font-medium text-slate-900">
                          {formatWeekdayMonthDayYear(result.appointment_date)} at {result.start_time}
                        </span>
                      </li>
                      <li>
                        <span className="text-slate-500">Estimated at visit: </span>
                        <span className="font-semibold text-[#b45309]">{formatBookingPrice(result.total_amount)}</span>
                      </li>
                    </ul>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                      This is what you can expect to pay for this booked service at check-in; add-on services may change the
                      final total.
                    </p>
                  </div>
                ))}
              </div>

              {/* Next steps */}
              <div className="mx-auto mt-6 max-w-md space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">What&apos;s next</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="flex items-start gap-2.5 rounded-xl border border-[#16a349]/20 bg-[#f0fdf4] p-3">
                    <span className="mt-0.5 text-lg">📱</span>
                    <div>
                      <p className="text-xs font-semibold text-[#166534]">Confirmation sent</p>
                      <p className="text-[11px] text-[#166534]/70">
                        {phone ? `Text to ${phone}` : "By text"}
                        {email?.trim() ? ` · Email copy to ${email}` : " · No email given — confirmation is by text only."}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 p-3">
                    <span className="mt-0.5 text-lg">📋</span>
                    <div>
                      <p className="text-xs font-semibold text-blue-900">On arrival</p>
                      <p className="text-[11px] text-blue-700">
                        <Link href="/kiosk" className="font-medium underline">Check-in at the kiosk</Link> with your cell number
                      </p>
                    </div>
                  </div>
                </div>
                {bookingFlow === "new" && patientLookup === "new" && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <span className="mt-0.5 text-lg">⏰</span>
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-amber-900">First visit?</p>
                      <p className="text-[11px] text-amber-700">
                        <a
                          href="https://www.reliefchiropractic.net/s/New-Patient-Paperwork-2025.doc"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium underline decoration-amber-600/70 underline-offset-2 hover:text-amber-900"
                        >
                          Download new-patient paperwork
                        </a>{" "}
                        and bring the completed forms,{" "}
                        <span className="font-medium text-amber-900">or</span> arrive{" "}
                        <span className="font-medium text-amber-900">25 minutes early</span> to fill them out at the office.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mx-auto mt-6 flex max-w-md flex-col gap-3 sm:flex-row-reverse sm:justify-center">
                <Button type="button" onClick={resetBookingFlow} className="h-auto rounded-xl px-6 py-3 text-sm font-semibold shadow-sm">Done</Button>
                <Button type="button" variant="outline" onClick={downloadCalendar} className="h-auto rounded-xl border-border px-6 py-3 text-sm font-semibold">Add to calendar</Button>
                <Button type="button" variant="outline" onClick={printBookingConfirmation} className="h-auto rounded-xl border-border px-6 py-3 text-sm font-semibold">Print</Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 pt-4">
            <Button
              type="button" variant="outline" onClick={goToPreviousStep}
              disabled={
                (step === 1 && !selectedCategory && cart.length === 0 && !addingAnother && bookingFlow !== "reschedule") ||
                (step === 4 && bookingResults.length > 0 && cart.length === 0)
              }
              className="h-auto min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold sm:min-h-0"
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (step === 1 && bookingFlow === "new") {
                  if (cart.length === 0) return;
                  if (selectedCategory || addingAnother) {
                    toast.error("Finish adding your visit to the cart, or close the category picker first.");
                    return;
                  }
                  proceedFromStep1();
                  return;
                }
                if (step === 2) {
                  if (bookingFlow === "reschedule") {
                    setStep(3);
                    return;
                  }
                  if (needsProviderSelection) {
                    toast.error("Choose a provider for each service above.");
                    return;
                  }
                  setStep(3);
                  return;
                }
                if (step === 3 && bookingFlow === "new") {
                  for (const item of cart) {
                    const pick = cartSlotPicksByLineId[item.lineId];
                    if (!item.provider) {
                      toast.error("Each visit needs a provider. Go back to Step 2.");
                      setStep(2);
                      return;
                    }
                    if (!pick?.date) {
                      toast.error("Pick a date for each service.");
                      return;
                    }
                    if (cartSlotsLoadingByLineId[item.lineId]) {
                      toast.error("Still loading open times — wait a moment.");
                      return;
                    }
                    const slots = cartSlotsByLineId[item.lineId];
                    if (!slots || slots.length === 0) {
                      toast.error(
                        `No open times for ${item.service.name} on the day you picked — choose another date.`,
                      );
                      return;
                    }
                    if (!slots.includes(pick.time)) {
                      toast.error(`Pick an open time for ${item.service.name}.`);
                      return;
                    }
                  }
                  setStep(4);
                  return;
                }
                if (step === 3 && bookingFlow === "reschedule") {
                  setStep(4);
                  return;
                }
                if (step < 4) {
                  setStep((step + 1) as Step);
                }
              }}
              disabled={
                step === 4 ||
                (bookingResults.length > 0 && cart.length === 0) ||
                (step === 1 && bookingFlow === "new" && cart.length === 0) ||
                (step === 1 && bookingFlow === "reschedule") ||
                (step === 2 && bookingFlow === "new" && needsProviderSelection)
              }
              className="h-auto min-h-11 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:bg-foreground/90 sm:min-h-0"
            >
              Next
            </Button>
          </div>
        </section>

        {/* ─── Sidebar: Booking summary (below steps on mobile) ─── */}
        <aside className="order-2 min-w-0 space-y-4 lg:order-2 lg:pt-1">
          <div className="rounded-2xl border border-border/90 bg-card p-5 shadow-sm ring-1 ring-slate-100/80">
            <h3 className="text-lg font-bold tracking-tight text-foreground">
              {bookingFlow === "reschedule" ? "Reschedule summary" : "Booking summary"}
            </h3>

            <div className="mt-4 rounded-xl border border-border/80 bg-muted/40 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Appointment date & time</p>
              {bookingFlow === "reschedule" ? (
                step >= 3 ? (
                  <p className="font-semibold text-foreground">
                    {formatWeekdayMonthDayYear(selectedDate)} at {selectedTime}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">No date selected yet</p>
                )
              ) : cart.length === 1 ? (
                step >= 3 && cartSlotPicksByLineId[cart[0].lineId]?.date ? (
                  <p className="font-semibold text-foreground">
                    {formatWeekdayMonthDayYear(cartSlotPicksByLineId[cart[0].lineId].date)} at{" "}
                    {cartSlotPicksByLineId[cart[0].lineId].time}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">No date selected yet</p>
                )
              ) : cart.length > 1 ? (
                step >= 3 ? (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Each service below has its own date and time — they do not have to be the same day.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">No date selected yet</p>
                )
              ) : (
                <p className="text-sm text-muted-foreground">No date selected yet</p>
              )}
            </div>

            {cart.length === 0 && !(bookingFlow === "reschedule" && reschedulePick) && (
              <div className="mt-4 rounded-xl border border-border/80 bg-background p-4">
                <p className="text-sm text-muted-foreground">No services selected yet</p>
              </div>
            )}

            {cartSchedule.map((item) => (
              <div key={item.lineId} className="mt-4 rounded-xl border border-border/80 bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected visit</p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500">Service</span>
                    <span className="text-right font-medium text-slate-900">{item.service.name}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500">Duration</span>
                    <span className="font-medium text-slate-900">{item.service.duration_minutes} min</span>
                  </div>
                  {item.provider && !item.providerSkipped && (
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-500">Provider</span>
                      <span className="text-right font-medium text-slate-900">{item.provider.provider_name}</span>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500">Date & time</span>
                    <span className="text-right font-medium text-slate-900">
                      {step >= 3 && item.visitDate ? (
                        `${formatWeekdayMonthDayYear(item.visitDate)} at ${item.visitTime}`
                      ) : (
                        <span className="font-normal text-muted-foreground">No date selected yet</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500">Price</span>
                    <span className="font-medium text-slate-900">{formatBookingPrice(item.service.price)}</span>
                  </div>
                </div>
              </div>
            ))}

            <div className="mt-4 rounded-xl border border-[#e9982f]/30 bg-[#e9982f]/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#9a6700]">Total due at visit</p>
              <p className="mt-1 text-3xl font-extrabold text-[#9a6700]">{formatBookingPrice(String(totalPrice))}</p>
              <p className="mt-2 text-xs leading-snug text-[#9a6700]/90">
                Please note payment is due at time of service.
              </p>
              {cart.length > 1 && (
                <p className="mt-1 text-xs text-[#9a6700]">{cart.length} separate visits in your cart</p>
              )}
            </div>
          </div>
        </aside>
      </div>
      </div>
    </main>
  );
}
