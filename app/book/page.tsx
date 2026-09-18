"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAppFeedback } from "@/components/app-feedback";
import { IconAlertCircle, IconArrowRight, IconCheck, IconClock, IconHandHeart, IconMail, IconStethoscope } from "@/components/icons";
import { BrandLogo } from "@/components/brand-logo";
import { BookingProgress } from "@/components/booking-progress";
import { BookingProviderCard } from "@/components/booking-provider-card";
import {
  BookingMonthCalendar,
  BookingTimeSlotList,
} from "@/components/booking-date-time-picker";
import { Loader } from "@/components/loader";
import { BookingCardSetup } from "@/components/booking-card-setup";
import { BookingUpdateInfoPanel } from "@/components/booking-update-info-panel";
import { PublicBookingClinicHelp } from "@/components/public-booking-clinic-help";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SmsConsentCheckbox } from "@/components/sms-consent-checkbox";
import { ApiError, apiGet, apiPostPublic } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatWeekdayMonthDayYear } from "@/lib/format-date";
import { useFindNextOpenBookingDay } from "@/hooks/use-find-next-open-booking-day";
import { publicBookingStepLabel } from "@/lib/public-booking-step-labels";
import type {
  AvailabilityApiResponse,
  BookingFlowMode,
  BookingOptions,
  BookingResult,
  CartItem,
  CartSlotPick,
  FormErrors,
  ProviderOption,
  RescheduleAppointmentRow,
  ServiceOption,
  SlotGridEntry,
  Step,
  RecurrenceFrequency,
  RecurringPreviewResponse,
  RecurringBookResponse,
} from "@/lib/public-booking-types";
import {
  addCalendarMonths,
  bookingDurationMinutes,
  buildFallbackTimeSlots,
  chiroIntakeRuleFromLookupResponse,
  formatBookingPrice,
  isMassageLateCancelWindow,
  massagePastClosingScheduleMessage,
  massageReservedBlockExtendsPastPublicClose,
  newCartLineId,
  nextWeekdayOnOrAfter,
  normalizeAvailabilityFromResponse,
  providerPickForService,
  startOfCalendarMonth,
  toLocalISODate,
  lastWeekdayOnOrBefore,
} from "@/lib/public-booking-utils";
import { downloadBookingIcsFile } from "@/lib/booking-calendar-ics";
import { withMinimumDelay } from "@/lib/with-minimum-delay";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";

export default function BookingPage() {
  const router = useRouter();
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
  /** When the API returns ``slot_grid``, full 15-min rows (some not bookable) for that cart line. */
  const [cartSlotGridByLineId, setCartSlotGridByLineId] = useState<Record<string, SlotGridEntry[] | null>>({});
  const [cartSlotsLoadingByLineId, setCartSlotsLoadingByLineId] = useState<Record<string, boolean>>({});
  const [bookingSubmitErrorByLineId, setBookingSubmitErrorByLineId] = useState<Record<string, string>>({});
  /** After “Edit” from Step 4, scroll this cart line into view on Step 3. */
  const [step3FocusLineId, setStep3FocusLineId] = useState<string | null>(null);
  /** Main booking steps card (below hero on mobile). */
  const bookingSessionRef = useRef<HTMLElement>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState<string | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  /** Reschedule: server conflict (e.g. slot taken) when sent back to step 3 — not used for massage closing hints (those are derived). */
  const [slotWarning, setSlotWarning] = useState("");
  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingMessageKind, setBookingMessageKind] = useState<"success" | "error">("success");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingResults, setBookingResults] = useState<BookingResult[]>([]);
  const [availableSlots, setAvailableSlots] = useState<string[] | null>(null);
  /** Reschedule: optional full 15-min grid from API (``slot_grid``) with bookable flags. */
  const [scheduleSlotGrid, setScheduleSlotGrid] = useState<SlotGridEntry[] | null>(null);
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
  const [lookupSavedCard, setLookupSavedCard] = useState<{
    card_brand: string;
    card_last4: string;
    saved_cards?: Array<{ id?: number; card_brand: string; card_last4: string; is_default?: boolean }>;
  } | null>(null);
  const [lookupSavedCards, setLookupSavedCards] = useState<
    Array<{ id?: number; card_brand: string; card_last4: string; is_default?: boolean }>
  >([]);
  /** Chiropractic: must use flagged new-office visit when new to practice, no chiro on file, or long inactive (server + lookup). */
  const [chiroIntakeRule, setChiroIntakeRule] = useState<{
    requiresIntake: boolean;
    intakeServices: Array<{ id: number; name: string }>;
    gapDays: number;
    lastVisit: string | null;
    reason: "gap" | "first_chiro" | "new_patient" | null;
  } | null>(null);
  /** SMS opt-in on the final submit step; checked by default; user can uncheck to opt out. */
  const [smsConsent, setSmsConsent] = useState(true);
  /** Set only when the patient explicitly unchecks SMS on step 4 (stops auto re-check). */
  const smsUserDeclinedRef = useRef(false);
  const [reasonForVisit, setReasonForVisit] = useState("");
  /** Single-service cart only: repeat this visit weekly / every 2 weeks / monthly. */
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceFrequency>("weekly");
  const [occurrenceCount, setOccurrenceCount] = useState(4);
  const [recurringPreview, setRecurringPreview] = useState<RecurringPreviewResponse | null>(null);
  const [recurringPreviewLoading, setRecurringPreviewLoading] = useState(false);

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
    const nextIso = toLocalISODate(n);
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
    setCartSlotGridByLineId((prev) => {
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
      setScheduleSlotGrid(null);
      return;
    }
    setSlotsLoading(true);
    setAvailableSlots(null);
    setScheduleSlotGrid(null);
    const params = new URLSearchParams({
      date: selectedDate,
      provider_id: String(effectiveSlotProvider.id),
      service_id: String(effectiveSlotService.id),
    });
    if (bookingFlow === "reschedule" && reschedulePick && phone && isValidPhoneNumber(phone)) {
      params.set("exclude_appointment_id", String(reschedulePick.id));
      params.set("phone", phone);
    }
    apiGet<AvailabilityApiResponse>(`/booking-options/availability/?${params.toString()}`)
      .then((res) => {
        const visitDurationMin = bookingDurationMinutes(
          res.visit_duration_minutes ?? effectiveSlotService.duration_minutes,
        );
        const { bookableLabels, slotGrid } = normalizeAvailabilityFromResponse(
          res,
          selectedDate,
          visitDurationMin,
        );
        setScheduleSlotGrid(slotGrid);
        setAvailableSlots(bookableLabels);
        setSlotWarning("");
      })
      .catch(() => {
        if (!effectiveSlotService) {
          setAvailableSlots([]);
          setScheduleSlotGrid(null);
          return;
        }
        const fb = buildFallbackTimeSlots(
          selectedDate,
          effectiveSlotService.service_type,
          bookingDurationMinutes(effectiveSlotService.duration_minutes),
        );
        setScheduleSlotGrid(fb.map((label) => ({ label, bookable: true })));
        setAvailableSlots(fb);
      })
      .finally(() => setSlotsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: source fields tracked via provider/service ?.id
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
        setCartSlotGridByLineId((p) => ({ ...p, [lineId]: null }));
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

      apiGet<AvailabilityApiResponse>(`/booking-options/availability/?${params.toString()}`)
        .then((res) => {
          if (cartSlotFetchGenRef.current[lineId] !== gen) return;
          const visitDurationMin = bookingDurationMinutes(
            res.visit_duration_minutes ?? item.service.duration_minutes,
          );
          const { bookableLabels, slotGrid } = normalizeAvailabilityFromResponse(
            res,
            dateSnapshot,
            visitDurationMin,
          );
          setCartSlotGridByLineId((p) => ({ ...p, [lineId]: slotGrid }));
          setCartSlotsByLineId((p) => ({ ...p, [lineId]: bookableLabels }));
        })
        .catch(() => {
          if (cartSlotFetchGenRef.current[lineId] !== gen) return;
          const fb = buildFallbackTimeSlots(
            dateSnapshot,
            item.service.service_type,
            bookingDurationMinutes(item.service.duration_minutes),
          );
          setCartSlotGridByLineId((p) => ({
            ...p,
            [lineId]: fb.map((label) => ({ label, bookable: true })),
          }));
          setCartSlotsByLineId((p) => ({ ...p, [lineId]: fb }));
        })
        .finally(() => {
          if (cartSlotFetchGenRef.current[lineId] === gen) {
            setCartSlotsLoadingByLineId((p) => ({ ...p, [lineId]: false }));
          }
        });
    }
  }, [bookingFlow, step, cart, cartSlotPicksByLineId]);

  useEffect(() => {
    if (cart.length !== 1) {
      setRepeatEnabled(false);
      setRecurringPreview(null);
    }
  }, [cart.length]);

  /** Recurring preview (single-service cart, step 3). */
  useEffect(() => {
    if (bookingFlow !== "new" || step !== 3 || cart.length !== 1 || !repeatEnabled) {
      setRecurringPreview(null);
      setRecurringPreviewLoading(false);
      return;
    }
    const item = cart[0];
    const pick = cartSlotPicksByLineId[item.lineId];
    const provider = item.provider;
    if (!provider || !pick?.date || !pick.time) {
      setRecurringPreview(null);
      return;
    }
    const t = window.setTimeout(() => {
      setRecurringPreviewLoading(true);
      apiPostPublic<RecurringPreviewResponse>("/appointments/recurring-preview/", {
        service_id: item.service.id,
        provider_id: provider.id,
        appointment_date: pick.date,
        start_time: pick.time,
        recurrence,
        occurrence_count: occurrenceCount,
        phone: phone ?? "",
      })
        .then((res) => setRecurringPreview(res))
        .catch((error) =>
          setRecurringPreview({
            ok: false,
            detail:
              error instanceof ApiError
                ? error.message
                : "Could not reach the server to preview recurring visits. Check your connection or try again.",
          }),
        )
        .finally(() => setRecurringPreviewLoading(false));
    }, 400);
    return () => window.clearTimeout(t);
  }, [
    bookingFlow,
    step,
    cart,
    cartSlotPicksByLineId,
    repeatEnabled,
    recurrence,
    occurrenceCount,
    phone,
  ]);

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

  // Step 4 (Your Info): SMS consent stays on unless the patient explicitly turned it off.
  useLayoutEffect(() => {
    if (bookingFlow !== "new" || step !== 4) {
      if (bookingFlow === "new" && step !== 4) {
        smsUserDeclinedRef.current = false;
      }
      return;
    }
    if (!smsUserDeclinedRef.current) {
      setSmsConsent(true);
    }
  }, [bookingFlow, step, patientLookup, phone, firstName, lastName]);

  useEffect(() => {
    // Phone-only lookup: run when reaching Your Info (step 4, new booking) or when the cell number changes.
    if (bookingFlow !== "new" || step !== 4 || !phone || !isValidPhoneNumber(phone)) {
      if (bookingFlow !== "new" || step !== 4) {
        setPatientLookup("idle");
        setLookupSavedCard(null);
        setLookupSavedCards([]);
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
        saved_cards?: Array<{ id?: number; card_brand: string; card_last4: string; is_default?: boolean }>;
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
            setLookupSavedCards([]);
            setChiroIntakeRule(nextRule);
            return;
          }

          if (res.found && res.first_name != null && res.last_name != null) {
            setFirstName((prev) => (prev.trim() ? prev : res.first_name ?? ""));
            setLastName((prev) => (prev.trim() ? prev : res.last_name ?? ""));
            setEmail((prev) => (prev.trim() ? prev : res.email ?? ""));
            setPatientLookup("returning");
            {
              const list = res.saved_cards || [];
              setLookupSavedCards(list);
              setLookupSavedCard(
                res.has_saved_card && res.card_last4
                  ? { card_brand: res.card_brand ?? "", card_last4: res.card_last4, saved_cards: list }
                  : list.length
                    ? { card_brand: list[0].card_brand, card_last4: list[0].card_last4, saved_cards: list }
                    : null,
              );
            }
            setChiroIntakeRule(nextRule);
            return;
          }

          setPatientLookup("new");
          setLookupSavedCard(null);
          setLookupSavedCards([]);
          setChiroIntakeRule(nextRule);
        })
        .catch(() => {
          setPatientLookup("new");
          setLookupSavedCard(null);
          setLookupSavedCards([]);
          setChiroIntakeRule(null);
          setHouseholdPickList([]);
        });
    }, 500);
    return () => clearTimeout(t);
  }, [bookingFlow, step, phone]);

  useEffect(() => {
    // Refined lookup with first + last name (household picks, booking a minor on a parent's number, etc.).
    if (bookingFlow !== "new" || step !== 4 || !phone || !isValidPhoneNumber(phone)) return;
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
        saved_cards?: Array<{ id?: number; card_brand: string; card_last4: string; is_default?: boolean }>;
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
            setLookupSavedCards([]);
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
            setLookupSavedCards([]);
            setChiroIntakeRule(nextRule);
            return;
          }

          if (res.found && res.first_name != null && res.last_name != null) {
            setPatientLookup("returning");
            setEmail(res.email ?? "");
            {
              const list = res.saved_cards || [];
              setLookupSavedCards(list);
              setLookupSavedCard(
                res.has_saved_card && res.card_last4
                  ? { card_brand: res.card_brand ?? "", card_last4: res.card_last4, saved_cards: list }
                  : list.length
                    ? { card_brand: list[0].card_brand, card_last4: list[0].card_last4, saved_cards: list }
                    : null,
              );
            }
            setChiroIntakeRule(nextRule);
            return;
          }

          setPatientLookup("new");
          setLookupSavedCard(null);
          setLookupSavedCards([]);
          setChiroIntakeRule(nextRule);
        })
        .catch(() => {
          setPatientLookup("new");
          setLookupSavedCard(null);
          setLookupSavedCards([]);
          setChiroIntakeRule(null);
          setHouseholdPickList([]);
        });
    }, 450);
    return () => clearTimeout(t);
  }, [bookingFlow, step, phone, firstName, lastName]);

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

  /** On phones, jump to the step card so patients don't hunt below the hero image. */
  const scrollToBookingSession = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    const run = () => {
      bookingSessionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(run);
    });
  }, []);

  const activateNewBookingFlow = () => {
    setBookingFlow("new");
    setReschedulePick(null);
    setRescheduleList([]);
    setRescheduleListError("");
    setSmsConsent(true);
    setStep(1);
    setAvailableSlots(null);
    setScheduleSlotGrid(null);
    setCartSlotPicksByLineId({});
    setCartCalendarMonthByLineId({});
    setCartSlotsByLineId({});
    setCartSlotGridByLineId({});
    setCartSlotsLoadingByLineId({});
    setBookingSubmitErrorByLineId({});
    setStep3FocusLineId(null);
    scrollToBookingSession();
  };

  const { findNextOpenDay, findingNextOpenDay } = useFindNextOpenBookingDay({
    maxBookDateIso,
    phone,
    toast,
  });

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
    setSmsConsent(true);
    setStep(1);
    setAvailableSlots(null);
    setScheduleSlotGrid(null);
    setCartSlotPicksByLineId({});
    setCartCalendarMonthByLineId({});
    setCartSlotsByLineId({});
    setCartSlotGridByLineId({});
    setCartSlotsLoadingByLineId({});
    setBookingSubmitErrorByLineId({});
    setStep3FocusLineId(null);
    scrollToBookingSession();
  };

  const activateUpdateInfoFlow = () => {
    setBookingFlow("update_info");
    setCart([]);
    setSelectedCategory(null);
    setAddingAnother(false);
    setBookingResults([]);
    setBookingMessage("");
    setReschedulePick(null);
    setRescheduleList([]);
    setRescheduleListError("");
    setStep(1);
    scrollToBookingSession();
  };

  /**
   * Home portal deep-links:
   * - ?manage=1 (SMS reminders) -> reschedule / cancel
   * - ?flow=update -> update contact / card
   * - ?flow=reschedule -> same as manage
   * Clean the URL after applying so refresh does not re-trigger.
   */
  const portalDeepLinkHandled = useRef(false);
  useEffect(() => {
    if (portalDeepLinkHandled.current) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const manage = (params.get("manage") || "").trim().toLowerCase();
    const flow = (params.get("flow") || "").trim().toLowerCase();
    const wantsReschedule =
      manage === "1" || manage === "true" || manage === "yes" || flow === "reschedule" || flow === "manage";
    const wantsUpdate = flow === "update" || flow === "update_info" || flow === "info";
    if (!wantsReschedule && !wantsUpdate) return;
    portalDeepLinkHandled.current = true;
    if (wantsUpdate) {
      activateUpdateInfoFlow();
    } else {
      activateRescheduleFlow();
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("manage");
      url.searchParams.delete("flow");
      const next = url.pathname + (url.search || "") + url.hash;
      window.history.replaceState({}, "", next);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount to clear manage URL params
  }, []);

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
        empty_hint?: string;
        first_name: string;
        last_name: string;
        email: string;
        appointments: RescheduleAppointmentRow[];
      }>(
        `/booking-options/my-appointments/?phone=${encodeURIComponent(phone)}&purpose=view`,
      );
      setRescheduleList(res.appointments ?? []);
      setFirstName(res.first_name ?? "");
      setLastName(res.last_name ?? "");
      setEmail(res.email ?? "");
      setRescheduleSharedPhone(res.ambiguous_phone === true);
      if ((res.appointments ?? []).length === 0) {
        setRescheduleListError(
          (res.empty_hint || "").trim() ||
            "No upcoming visits found for this number. Call the clinic if you need help.",
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

  const confirmBeforeReschedule = (row: RescheduleAppointmentRow) => {
    return window.confirm(
      `Reschedule your ${row.service_name} on ${formatWeekdayMonthDayYear(row.appointment_date)} at ${row.start_time}?\n\nYou will pick a new date and time on the next steps.`,
    );
  };

  const confirmBeforeRescheduleSubmit = (row: RescheduleAppointmentRow, newDate: string, newTime: string) => {
    return window.confirm(
      `Confirm reschedule to ${formatWeekdayMonthDayYear(newDate)} at ${newTime}?\n\nYour previous time was ${formatWeekdayMonthDayYear(row.appointment_date)} at ${row.start_time}.`,
    );
  };

  const startRescheduleForVisit = (row: RescheduleAppointmentRow) => {
    if (!confirmBeforeReschedule(row)) return;
    setReschedulePick(row);
    setSlotWarning("");
    setStep(2);
  };

  const cancelPublicAppointment = async (row: RescheduleAppointmentRow) => {
    if (!phone || !isValidPhoneNumber(phone)) {
      toast.error("Enter a valid cell number first.");
      return;
    }
    const lateMassage = isMassageLateCancelWindow(row, options);
    const msg = lateMassage
      ? `This massage starts within 24 hours. The full massage price (${formatBookingPrice(row.price)}) will be charged for a late cancellation. Cancel online anyway?`
      : "Cancel this appointment? With this much notice there is no cancellation fee.";
    if (!window.confirm(msg)) return;
    try {
      await apiPostPublic<{ detail?: string }>("/booking-options/cancel-appointment/", {
        phone,
        appointment_id: row.id,
      });
      toast.success("Your appointment was cancelled.");
      await loadMyAppointments();
      setReschedulePick((pick) => (pick?.id === row.id ? null : pick));
      setStep(1);
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
    } else if (step === 4 && bookingFlow === "reschedule") {
      setSmsConsent(true);
      setStep(3);
    } else if (step === 4 && bookingFlow === "new" && cart.length > 0) {
      setStep(3);
    } else if (step === 5 && bookingFlow === "new") {
      setStep(4);
    } else if (step > 1) {
      setStep((step - 1) as Step);
    }
  };

  /** Soft-check contact fields before leaving Step 4 (Your Info) for Confirm. */
  const canProceedToConfirmStep = (): boolean => {
    const nextErrors: FormErrors = {};
    if (!phone || !isValidPhoneNumber(phone)) nextErrors.phone = "Enter a valid cell number.";
    if (!firstName.trim()) nextErrors.firstName = "First name is required.";
    if (!lastName.trim()) nextErrors.lastName = "Last name is required.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = "Enter a valid email or leave it blank.";
    }
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast.error("Please complete your details before continuing.");
      return false;
    }
    if (!smsConsent) {
      toast.error("Please agree to SMS updates so we can reach you about this visit.");
      return false;
    }
    return true;
  };

  /** Step 5 recap → Step 3: keep other rows' slots; scroll to this row's calendar card. */
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

    if (cart.length === 1 && repeatEnabled) {
      if (recurringPreviewLoading) {
        setBookingMessageKind("error");
        setBookingMessage("Still checking recurring visit dates — wait a moment.");
        return;
      }
      if (!recurringPreview?.ok || !recurringPreview.all_available) {
        setBookingMessageKind("error");
        setBookingMessage(
          recurringPreview?.detail ||
            "One or more recurring visits are not available. Go back and adjust your schedule or turn off repeat visits.",
        );
        setStep(3);
        return;
      }
    }

    setIsSubmitting(true);
    const succeeded: BookingResult[] = [];
    const failedItems: CartItem[] = [];
    const errByLine: Record<string, string> = {};

    try {
      if (cart.length === 1 && repeatEnabled) {
        const item = cart[0];
        const pick = cartSlotPicksByLineId[item.lineId];
        if (pick && item.provider) {
          try {
            const seriesResult = await apiPostPublic<RecurringBookResponse>("/appointments/book-recurring/", {
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
              recurrence,
              occurrence_count: occurrenceCount,
            });
            const rows = (seriesResult.appointments ?? []).map((row) => ({
              ...row,
              duration_minutes: item.service.duration_minutes,
            }));
            if (rows.length > 0) {
              setBookingResults((prev) => [...prev, ...rows]);
              setCart([]);
              setBookingMessageKind("success");
              const ids = rows.map((r) => `#${r.appointment_id}`).join(", ");
              setBookingMessage(
                `Recurring visits booked successfully (${rows.length} visits). IDs: ${ids}`,
              );
              toast.success(
                `Your ${rows.length} recurring visits are confirmed! One combined confirmation is on the way.`,
              );
            }
          } catch (error) {
            const msg =
              error instanceof ApiError ? error.message : "Could not complete recurring booking. Please try again.";
            setBookingMessageKind("error");
            setBookingMessage(msg);
            setBookingSubmitErrorByLineId({ [item.lineId]: msg });
          } finally {
            setIsSubmitting(false);
          }
          return;
        }
      }

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
          succeeded.push({
            ...result,
            duration_minutes: item.service.duration_minutes,
          });
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
    if (!confirmBeforeRescheduleSubmit(reschedulePick, selectedDate, selectedTime)) {
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
      setBookingResults([
        {
          ...result,
          duration_minutes: reschedulePick.duration_minutes,
        },
      ]);
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
    if (bookingResults.length === 0) {
      toast.error("No appointment details to add to your calendar.");
      return;
    }
    const firstDate = bookingResults[0]?.appointment_date ?? "appointment";
    const filename =
      bookingResults.length === 1
        ? `relief-appointment-${firstDate}.ics`
        : `relief-appointments-${firstDate}.ics`;
    const ok = downloadBookingIcsFile(bookingResults, filename);
    if (ok) {
      toast.success("Calendar file downloaded — open it to add the visit to your calendar.");
    } else {
      toast.error("Could not build the calendar file. Please call the clinic if you need the details.");
    }
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

  /**
   * Sidebar summary only for reschedule Confirm (step 4).
   * New booking uses the Banani confirmation card on step 5 instead.
   */
  const hideBookingSidebar =
    bookingFlow === "new" ||
    step !== 4 ||
    (bookingResults.length > 0 && cart.length === 0);

  const wizardProgressSteps =
    bookingFlow === "reschedule"
      ? ["My visits", "Your visit", "New time", "Confirm"]
      : ["Visit Type", "Provider", "Date & Time", "Your Info", "Confirm"];

  const wizardTitle =
    bookingFlow === "reschedule"
      ? "View / Reschedule or Cancel"
      : bookingFlow === "update_info"
        ? "Update my information"
        : "Book Your Appointment";

  const wizardSubtitle =
    bookingFlow === "reschedule"
      ? "Find your visit with the cell number on your booking."
      : bookingFlow === "update_info"
        ? "We text a one-time code before changing your details."
        : "Follow the steps below to schedule your visit.";

  return (
    <main className="content-fade-in flex min-h-[100dvh] min-h-screen flex-col overflow-x-hidden bg-[#ecfdf5]">
      {/* Banani PatientTopBar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#e8e8e8] bg-white px-4 py-4 sm:px-8 md:px-10">
        <BrandLogo variant="full" className="max-h-10 sm:max-h-11" priority />
        <Link
          href="/"
          className="flex items-center gap-1 text-sm text-[#949494] transition-colors hover:text-[#0d5c2e]"
        >
          <span aria-hidden>←</span> Back to Home
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-[max(1rem,env(safe-area-inset-left))] py-8 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-8 md:px-10 lg:px-12 md:py-10">
        {bookingFlow !== "update_info" && (
          <div className="mb-6 md:mb-8">
            <h1 className="text-2xl font-bold text-[#0d5c2e] sm:text-3xl">{wizardTitle}</h1>
            <p className="mt-2 text-base text-[#949494]">{wizardSubtitle}</p>
          </div>
        )}

        {bookingFlow !== "update_info" && (
          <div className="mb-6 md:mb-8">
            <BookingProgress
              current={step - 1}
              steps={wizardProgressSteps}
              onStepClick={(n) => setStep(n as Step)}
            />
            <p className="mt-3 text-center text-xs text-[#949494] sm:hidden" aria-live="polite">
              Step {step}: {publicBookingStepLabel(bookingFlow, step)}
            </p>
          </div>
        )}

      <div
        className={cn(
          "grid grid-cols-1 items-start gap-6 lg:gap-8",
          !hideBookingSidebar && bookingFlow !== "update_info" && "lg:grid-cols-[minmax(0,1fr)_minmax(17.5rem,20rem)] xl:grid-cols-[minmax(0,1fr)_22rem]",
        )}
      >
        <section
          ref={bookingSessionRef}
          id="booking-session"
          aria-label="Online booking steps"
          className="order-1 min-w-0 scroll-mt-3 space-y-5"
        >
          {bookingFlow === "update_info" ? (
            <div className="rounded-xl border border-[#e8e8e8] bg-white p-5 md:p-8">
              <BookingUpdateInfoPanel onBack={() => activateNewBookingFlow()} />
            </div>
          ) : (
            <>

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
            <div className="animate-fade-in-up space-y-4 rounded-xl border border-[#e8e8e8] bg-white p-5 sm:p-8">
              {bookingFlow === "new" ? (
                <div className="mb-1">
                  <h2 className="text-xl font-semibold text-[#0d1f14]">Select Visit Type</h2>
                  <p className="mt-1 text-sm text-[#949494]">Choose the type of appointment you need.</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => activateNewBookingFlow()}
                  className="text-sm text-[#949494] underline-offset-2 hover:text-[#16a349] hover:underline"
                >
                  ← Book a new visit instead
                </button>
              )}

              {bookingFlow === "reschedule" && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-xl font-semibold text-[#0d1f14]">Find your visit</h2>
                    <p className="mt-2 text-sm leading-relaxed text-[#5a7a62]">
                      Enter the cell phone number from your booking. Next you can view it, pick a new time, or cancel.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="reschedule-phone" className="block text-sm font-semibold text-[#0d5c2e]">
                      Cell phone number
                    </label>
                    <div
                      className={`rounded-xl border bg-white p-2.5 ${
                        rescheduleListError && !rescheduleListLoading ? "border-amber-300" : "border-[#e8e8e8]"
                      }`}
                    >
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
                        placeholder="(555) 123-4567"
                        className="phone-field text-sm"
                        numberInputProps={{ id: "reschedule-phone" }}
                      />
                    </div>
                    <p className="text-xs text-[#949494]">
                      Use the same number you used when you booked. Already checked in? Please see the front desk.
                    </p>
                  </div>

                  <Button
                    type="button"
                    onClick={() => loadMyAppointments()}
                    disabled={rescheduleListLoading}
                    className="h-auto w-full rounded-lg bg-[#16a349] px-6 py-3.5 text-sm font-semibold text-white hover:bg-[#13823d] sm:w-auto"
                  >
                    {rescheduleListLoading ? "Looking up…" : "Show my visits"}
                  </Button>
                  {rescheduleListError && (
                    <div className="space-y-2">
                      <p className="text-sm text-amber-900">{rescheduleListError}</p>
                      <PublicBookingClinicHelp />
                    </div>
                  )}
                  {rescheduleSharedPhone && rescheduleList.length > 0 && (
                    <p className="rounded-lg border border-[#16a349]/20 bg-[#ecfdf5] px-3 py-2 text-sm leading-relaxed text-[#0d5c2e]">
                      More than one person uses this number. Pick the visit that belongs to you.
                    </p>
                  )}
                  {rescheduleList.length > 0 && (
                    <div className="space-y-3 border-t border-[#e8e8e8] pt-5">
                      <p className="text-sm font-semibold text-[#0d5c2e]">Your upcoming visits</p>
                      {rescheduleList.map((row) => {
                        const statusLabel =
                          row.status === "checked_in"
                            ? "Checked in"
                            : row.status === "in_consultation"
                              ? "In visit"
                              : row.status === "booked"
                                ? "Scheduled"
                                : row.status
                                  ? row.status.replace(/_/g, " ")
                                  : "";
                        const canCancel =
                          row.can_cancel_online !== false && row.status === "booked";
                        const canReschedule = row.can_reschedule_online === true;
                        return (
                          <div
                            key={row.id}
                            className="flex flex-col gap-3 rounded-xl border border-[#e8e8e8] bg-white p-4 sm:flex-row sm:items-stretch"
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="font-semibold text-[#0d1f14]">{row.service_name}</p>
                              {row.patient_name ? (
                                <p className="text-xs font-medium text-[#949494]">Patient: {row.patient_name}</p>
                              ) : null}
                              <p className="text-sm text-[#5a7a62]">
                                {row.provider_name} ·{" "}
                                {formatWeekdayMonthDayYear(row.appointment_date)} at {row.start_time}
                              </p>
                              {statusLabel ? (
                                <p className="text-xs font-semibold uppercase tracking-wide text-[#16a349]">
                                  {statusLabel}
                                  {!canCancel && !canReschedule
                                    ? " · call the clinic to change this visit"
                                    : ""}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 flex-col gap-2 sm:w-[11.5rem]">
                              {canReschedule ? (
                                <Button
                                  type="button"
                                  className="h-auto w-full rounded-lg bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#13823d]"
                                  onClick={() => startRescheduleForVisit(row)}
                                >
                                  Reschedule
                                </Button>
                              ) : null}
                              {canCancel ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-auto w-full rounded-lg border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-800 hover:bg-rose-50"
                                  onClick={() => void cancelPublicAppointment(row)}
                                >
                                  Cancel visit
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-1 h-auto w-full rounded-lg border-[#16a349]/30 px-4 py-2.5 text-sm font-semibold text-[#0d5c2e] hover:bg-[#ecfdf5]"
                        onClick={() => activateNewBookingFlow()}
                      >
                        + Book a new visit
                      </Button>
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
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-[#0d1f14]">Your selected services</h3>
                  {cart.some((c) => c.service.service_type === "chiropractic") && !chiroGapBlocksCart ? (
                    <p className="text-xs leading-snug text-[#5a7a62]">
                      New or returning after 2+ years? Pick <span className="font-medium text-[#0d1f14]">New Office Visit</span> from the list.
                    </p>
                  ) : null}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {cart.map((item) => (
                      <div
                        key={item.lineId}
                        className="flex items-start gap-4 rounded-xl border-2 border-[#16a349] bg-[#ecfdf5] p-5 text-left"
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e8e8e8] text-[#16a349]">
                          {item.service.service_type === "massage" ? (
                            <IconHandHeart className="h-6 w-6" />
                          ) : (
                            <IconStethoscope className="h-6 w-6" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[#0d1f14]">{item.service.name}</p>
                          <p className="mt-1 text-sm text-[#949494]">
                            {item.provider && !item.providerSkipped ? `${item.provider.provider_name} · ` : ""}
                            {formatBookingPrice(item.service.price)}
                          </p>
                          <p className="mt-2 flex items-center gap-1 text-xs font-medium text-[#16a349]">
                            <IconClock className="h-3 w-3" /> {item.service.duration_minutes} min
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#16a349] text-white">
                            <IconCheck className="h-3 w-3" />
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.lineId)}
                            className="text-xs font-medium text-rose-600 hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {otherCategoryAvailable && (
                    <button
                      type="button"
                      onClick={() => { setAddingAnother(true); setSelectedCategory(otherCategoryAvailable); }}
                      className="w-full rounded-xl border-2 border-dashed border-[#16a349]/35 p-4 text-sm font-semibold text-[#16a349] transition-colors hover:border-[#16a349]/55 hover:bg-[#ecfdf5]"
                    >
                      + Add a {otherCategoryAvailable === "chiropractic" ? "chiropractic" : "massage"} service
                    </button>
                  )}
                </div>
              )}

              {/* Category selection — main focus of Step 1 */}
              {bookingFlow === "new" && options && cart.length === 0 && !selectedCategory && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {chiroServices.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedCategory("chiropractic")}
                        className="group flex min-h-[9.5rem] items-start gap-4 rounded-xl border-2 border-[#16a349] bg-[#ecfdf5] p-6 text-left shadow-sm transition-all hover:bg-[#d1fae5] hover:shadow-md"
                      >
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white text-[#16a349] shadow-sm">
                          <IconStethoscope className="h-7 w-7" />
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="text-lg font-bold text-[#0d5c2e]">Chiropractic</p>
                          <p className="mt-1.5 text-sm text-[#5a7a62]">
                            {chiroServices.length} service{chiroServices.length !== 1 ? "s" : ""} available
                          </p>
                        </div>
                        <IconArrowRight className="mt-1 h-5 w-5 shrink-0 text-[#16a349] opacity-70 group-hover:opacity-100" />
                      </button>
                    )}
                    {massageServices.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedCategory("massage")}
                        className="group flex min-h-[9.5rem] items-start gap-4 rounded-xl border-2 border-[#16a349] bg-[#ecfdf5] p-6 text-left shadow-sm transition-all hover:bg-[#d1fae5] hover:shadow-md"
                      >
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white text-[#16a349] shadow-sm">
                          <IconHandHeart className="h-7 w-7" />
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="text-lg font-bold text-[#0d5c2e]">Massage</p>
                          <p className="mt-1.5 text-sm text-[#5a7a62]">
                            {massageServices.length} service{massageServices.length !== 1 ? "s" : ""} available
                          </p>
                        </div>
                        <IconArrowRight className="mt-1 h-5 w-5 shrink-0 text-[#16a349] opacity-70 group-hover:opacity-100" />
                      </button>
                    )}
                  </div>

                  {/* Secondary path — quieter so visit types stay the focus */}
                  <p className="text-center text-sm text-[#949494]">
                    Already booked?{" "}
                    <button
                      type="button"
                      onClick={() => activateRescheduleFlow()}
                      className="font-medium text-[#5a7a62] underline decoration-[#d1e8d8] underline-offset-2 hover:text-[#16a349] hover:decoration-[#16a349]"
                    >
                      View / Reschedule or Cancel
                    </button>
                  </p>
                </div>
              )}

              {/* Service list for selected category — Banani visit-type cards */}
              {bookingFlow === "new" && options && selectedCategory && (
                <>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => { setSelectedCategory(null); if (addingAnother && cart.length > 0) setAddingAnother(false); }}
                      className="rounded-lg border border-[#e8e8e8] px-3 py-1.5 text-sm text-[#949494] transition-colors hover:bg-[#f5f5f5]"
                    >
                      ← Back
                    </button>
                    <h3 className="text-base font-semibold text-[#0d1f14]">
                      {selectedCategory === "chiropractic" ? "Chiropractic" : "Massage"} services
                    </h3>
                  </div>
                  {selectedCategory === "chiropractic" ? (
                    <p className="rounded-lg border border-[#16a349]/20 bg-[#ecfdf5] px-3 py-2 text-xs text-[#0d1f14]">
                      New or returning after 2+ years? Select <strong>New Office Visit</strong>.
                    </p>
                  ) : null}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {servicesForCategory
                      .filter((svc) => !cart.some((c) => c.service.id === svc.id))
                      .map((service) => (
                        <button
                          key={service.id}
                          type="button"
                          onClick={() => addServiceToCart(service)}
                          className="flex items-start gap-4 rounded-xl border-2 border-[#e8e8e8] bg-white p-5 text-left transition-colors hover:border-[#16a349] hover:bg-[#ecfdf5]"
                        >
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e8e8e8] text-[#16a349]">
                            {service.service_type === "massage" ? (
                              <IconHandHeart className="h-6 w-6" />
                            ) : (
                              <IconStethoscope className="h-6 w-6" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-[#0d1f14]">{service.name}</p>
                              {service.is_new_client_intake ? (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                                  New patient / reactivation
                                </span>
                              ) : null}
                            </div>
                            {service.description ? (
                              <p className="mt-1 text-sm text-[#949494]">{service.description}</p>
                            ) : null}
                            <p className="mt-2 flex items-center gap-1 text-xs font-medium text-[#16a349]">
                              <IconClock className="h-3 w-3" /> {service.duration_minutes} min
                              <span className="text-[#949494]"> · {formatBookingPrice(service.price)}</span>
                            </p>
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
            <div className="animate-fade-in-up space-y-6 rounded-xl border border-[#e8e8e8] bg-white p-5 sm:p-8">
              {bookingFlow === "reschedule" && reschedulePick ? (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold text-[#0d1f14]">Your visit</h2>
                    <p className="mt-1 text-sm text-[#949494]">
                      Reschedule keeps the same service and provider. Cancel removes this visit.
                    </p>
                  </div>
                  <ul className="space-y-2 rounded-xl border border-[#e8e8e8] bg-[#f8fdf9] p-4 text-sm text-[#0d1f14]">
                    <li>
                      <span className="text-[#949494]">Service: </span>
                      <span className="font-medium">{reschedulePick.service_name}</span>
                    </li>
                    <li>
                      <span className="text-[#949494]">Provider: </span>
                      <span className="font-medium">{reschedulePick.provider_name}</span>
                    </li>
                    <li>
                      <span className="text-[#949494]">Currently scheduled: </span>
                      <span className="font-medium">
                        {formatWeekdayMonthDayYear(reschedulePick.appointment_date)}{" "}
                        at {reschedulePick.start_time}
                      </span>
                    </li>
                  </ul>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <Button
                      type="button"
                      onClick={() => setStep(3)}
                      className="h-auto w-full rounded-lg bg-[#16a349] px-6 py-3 text-sm font-semibold text-white hover:bg-[#13823d] sm:w-auto"
                    >
                      Choose new date &amp; time
                      <IconArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto w-full rounded-lg border-rose-200 px-6 py-3 text-sm font-semibold text-rose-800 hover:bg-rose-50 sm:w-auto"
                      onClick={() => void cancelPublicAppointment(reschedulePick)}
                    >
                      Cancel this visit
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <h2 className="text-xl font-semibold text-[#0d1f14] sm:text-2xl">
                      Choose Your Provider
                    </h2>
                    <p className="mt-2 text-base text-[#949494]">
                      {needsProviderSelection
                        ? cart.filter((c) => !c.provider && !c.providerSkipped).length === 1
                          ? `Select a provider for your ${cart.find((c) => !c.provider && !c.providerSkipped)?.service.name ?? "visit"}.`
                          : "Select a provider for each visit below."
                        : cart.length === 1 && cart[0].provider
                          ? `Provider for your ${cart[0].service.name} is set. Continue when you are ready.`
                          : "Your provider is set. Continue when you are ready."}
                    </p>
                  </div>

                  {needsProviderSelection ? (
                    <div className="space-y-8">
                      {cart
                        .filter((c) => {
                          if (c.providerSkipped) return false;
                          const providers = options?.providers_by_service?.[c.service.id] ?? [];
                          // Still choosing, or multiple therapists so they can change the pick
                          return !c.provider || providers.length > 1;
                        })
                        .map((item) => {
                          const providers = options?.providers_by_service?.[item.service.id] ?? [];
                          const choiceRows = cart.filter((c) => {
                            if (c.providerSkipped) return false;
                            const list = options?.providers_by_service?.[c.service.id] ?? [];
                            return !c.provider || list.length > 1;
                          });
                          return (
                            <div key={item.lineId} className="space-y-4">
                              {choiceRows.length > 1 ? (
                                <p className="text-sm font-medium text-[#0d5c2e]">
                                  For {item.service.name}
                                </p>
                              ) : null}
                              {providers.length === 0 ? (
                                <p className="text-sm text-[#949494]">
                                  No providers available. Please choose another service.
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
                                  {providers.map((provider) => (
                                    <BookingProviderCard
                                      key={provider.id}
                                      name={provider.provider_name}
                                      subtitle={item.service.name}
                                      selected={item.provider?.id === provider.id}
                                      onClick={() => {
                                        setCart((prev) =>
                                          prev.map((c) =>
                                            c.lineId === item.lineId
                                              ? { ...c, provider, providerSkipped: false }
                                              : c,
                                          ),
                                        );
                                      }}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
                      {cart
                        .filter((c) => c.provider && !c.providerSkipped)
                        .map((item) => (
                          <BookingProviderCard
                            key={item.lineId}
                            name={item.provider!.provider_name}
                            subtitle={item.service.name}
                            selected
                          />
                        ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ─── STEP 3: Date & time (Banani Step 3 look) ─── */}
          {step === 3 && (
            <div className="animate-fade-in-up space-y-6 rounded-xl border border-[#e8e8e8] bg-white p-5 sm:p-8">
              <div>
                <h2 className="text-xl font-semibold text-[#0d1f14] sm:text-2xl">
                  {bookingFlow === "reschedule" ? "Pick Your Date & Time" : "Pick Your Date & Time"}
                </h2>
                <p className="mt-2 text-base text-[#949494]">
                  {bookingFlow === "reschedule" && reschedulePick
                    ? `Select a convenient time with ${reschedulePick.provider_name}.`
                    : cart.length === 1 && cart[0].provider && !cart[0].providerSkipped
                      ? `Select a convenient time with ${cart[0].provider.provider_name}.`
                      : cart.length > 1
                        ? "Choose a date and time for each visit below."
                        : "Select a convenient date and time for your visit."}
                </p>
              </div>
              {bookingFlow === "new" && (
                <div className="rounded-xl border border-[#e8e8e8] bg-[#f8fdf9] p-4">
                  <label className="block text-sm font-semibold text-[#0d5c2e]">
                    What should we focus on during your visit? (optional)
                  </label>
                  <textarea
                    className="mt-2 min-h-[96px] w-full rounded-xl border border-[#e8e8e8] bg-white px-3 py-2 text-sm shadow-sm focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15"
                    placeholder="Example: neck pain, lower back tightness, headache, shoulder discomfort..."
                    value={reasonForVisit}
                    onChange={(e) => setReasonForVisit(e.target.value)}
                  />
                </div>
              )}

              {bookingFlow === "new" && bookingResults.length > 0 && (
                <div className="rounded-xl border border-[#16a349]/30 bg-[#ecfdf5] p-4 text-sm text-[#0d5c2e]">
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
                    Choose new open times below for the remaining visit(s), then continue.
                  </p>
                </div>
              )}

              {bookingFlow === "reschedule" && (
              <>
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
                  const monthLabel = monthStart.toLocaleDateString("en-US", { month: "long" });
                  const yearLabel = String(monthStart.getFullYear());
                  const displayGrid: SlotGridEntry[] =
                    scheduleSlotGrid ??
                    (availableSlots ?? []).map((label) => ({ label, bookable: true }));
                  const todayWeekday = new Date(`${today}T12:00:00`).getDay();
                  const todayBookable =
                    todayWeekday !== 0 && todayWeekday !== 6 && today <= maxBookDateIso;

                  return (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                      <div className="lg:col-span-1">
                        <BookingMonthCalendar
                          monthLabel={monthLabel}
                          yearLabel={yearLabel}
                          cells={cells}
                          selectedIso={selectedDate}
                          todayIso={today}
                          maxBookDateIso={maxBookDateIso}
                          canPrevMonth={canPrevMonth}
                          canNextMonth={canNextMonth}
                          onPrevMonth={() => setBookingCalendarMonth((m) => addCalendarMonths(m, -1))}
                          onNextMonth={() => setBookingCalendarMonth((m) => addCalendarMonths(m, 1))}
                          onSelectDate={(iso) => {
                            setSelectedDate(iso);
                            setSlotWarning("");
                          }}
                          toLocalISODate={toLocalISODate}
                          onToday={
                            todayBookable
                              ? () => {
                                  setSelectedDate(today);
                                  setBookingCalendarMonth(startOfCalendarMonth(new Date(`${today}T12:00:00`)));
                                  setSlotWarning("");
                                }
                              : undefined
                          }
                        />
                        <p className="mt-3 text-xs leading-relaxed text-[#949494]">
                          Mon–Fri only · Book up to 6 months ahead · Chiro from 8:00 AM · Massage from 9:00 AM · Fri closes 4:00 PM
                        </p>
                      </div>
                      <div className="lg:col-span-2">
                        {slotsLoading ? (
                          <BookingTimeSlotList
                            dateLabel={formatWeekdayMonthDayYear(selectedDate)}
                            slots={[]}
                            selectedTime={selectedTime}
                            loading
                            loadingContent={<Loader variant="dots" label="Checking availability…" />}
                            onSelectTime={() => {}}
                          />
                        ) : availableSlots === null ? (
                          <BookingTimeSlotList
                            dateLabel={formatWeekdayMonthDayYear(selectedDate)}
                            slots={null}
                            selectedTime={selectedTime}
                            onSelectTime={() => {}}
                          />
                        ) : (
                          <BookingTimeSlotList
                            dateLabel={formatWeekdayMonthDayYear(selectedDate)}
                            slots={displayGrid}
                            selectedTime={selectedTime}
                            onSelectTime={(slot) => {
                              setSelectedTime(slot);
                              setSlotWarning("");
                            }}
                            slotFootnote={(slot, bookable) =>
                              bookable &&
                              effectiveSlotService != null &&
                              massageReservedBlockExtendsPastPublicClose(
                                selectedDate,
                                slot,
                                effectiveSlotService,
                              ) ? (
                                <span className="text-[11px] font-normal text-amber-800">
                                  Schedule runs past closing
                                </span>
                              ) : null
                            }
                            emptyContent={
                              <div className="space-y-3 text-sm text-amber-950">
                                <p>No open times on this day — try another date.</p>
                                {effectiveSlotService && effectiveSlotProvider ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    disabled={findingNextOpenDay}
                                    onClick={() =>
                                      void findNextOpenDay({
                                        startAfterIso: selectedDate,
                                        providerId: effectiveSlotProvider.id,
                                        serviceId: effectiveSlotService.id,
                                        durationMinutes: bookingDurationMinutes(
                                          effectiveSlotService.duration_minutes,
                                        ),
                                        serviceType: effectiveSlotService.service_type,
                                        excludeAppointmentId: reschedulePick?.id,
                                        onFound: (dateIso) => {
                                          setSelectedDate(dateIso);
                                          setBookingCalendarMonth(
                                            startOfCalendarMonth(new Date(`${dateIso}T12:00:00`)),
                                          );
                                          setSlotWarning("");
                                        },
                                      })
                                    }
                                    className="h-auto rounded-lg border-amber-300 bg-white text-sm font-semibold text-amber-950 hover:bg-amber-50"
                                  >
                                    {findingNextOpenDay ? "Searching…" : "Find next open day"}
                                  </Button>
                                ) : null}
                                <PublicBookingClinicHelp />
                              </div>
                            }
                            infoNote="Times update from the live clinic schedule. We will confirm your visit by text."
                          />
                        )}
                        {effectiveSlotService &&
                          !slotsLoading &&
                          Array.isArray(availableSlots) &&
                          availableSlots.includes(selectedTime) &&
                          massageReservedBlockExtendsPastPublicClose(
                            selectedDate,
                            selectedTime,
                            effectiveSlotService,
                          ) && (
                            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
                              {massagePastClosingScheduleMessage(selectedDate)}
                            </p>
                          )}
                        {slotWarning ? (
                          <div className="mt-3 space-y-2">
                            <p className="text-sm font-medium text-rose-700">{slotWarning}</p>
                            <PublicBookingClinicHelp />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })()}
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
                    const slotGridLine = cartSlotGridByLineId[item.lineId];
                    const loadingLine = cartSlotsLoadingByLineId[item.lineId];
                    const displayGridCart: SlotGridEntry[] =
                      slotGridLine ?? (slotsLine ?? []).map((label) => ({ label, bookable: true }));
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
                    const monthLabelCal = monthStartCal.toLocaleDateString("en-US", { month: "long" });
                    const yearLabelCal = String(monthStartCal.getFullYear());
                    const todayWeekdayCal = new Date(`${today}T12:00:00`).getDay();
                    const todayBookableCal =
                      todayWeekdayCal !== 0 && todayWeekdayCal !== 6 && today <= maxBookDateIso;

                    return (
                      <div
                        key={item.lineId}
                        id={`booking-schedule-${item.lineId}`}
                        className="scroll-mt-24 space-y-4 rounded-xl border border-[#e8e8e8] bg-[#f8fdf9] p-4 sm:p-5"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div>
                            <p className="text-base font-bold text-[#0d1f14]">{item.service.name}</p>
                            <p className="text-sm text-[#5a7a62]">
                              {item.service.duration_minutes} min · {formatBookingPrice(item.service.price)}
                              {item.provider && !item.providerSkipped
                                ? ` · ${item.provider.provider_name}`
                                : ""}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-[#16a349]">
                            {formatWeekdayMonthDayYear(pick.date)} at {pick.time}
                          </p>
                        </div>
                        {lineErr ? (
                          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                            {lineErr}
                          </p>
                        ) : null}

                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                          <div className="lg:col-span-1">
                            <BookingMonthCalendar
                              monthLabel={monthLabelCal}
                              yearLabel={yearLabelCal}
                              cells={cellsCal}
                              selectedIso={pick.date}
                              todayIso={today}
                              maxBookDateIso={maxBookDateIso}
                              canPrevMonth={canPrevMonthCal}
                              canNextMonth={canNextMonthCal}
                              onPrevMonth={() =>
                                setCartCalendarMonthByLineId((p) => ({
                                  ...p,
                                  [item.lineId]: addCalendarMonths(monthStartCal, -1),
                                }))
                              }
                              onNextMonth={() =>
                                setCartCalendarMonthByLineId((p) => ({
                                  ...p,
                                  [item.lineId]: addCalendarMonths(monthStartCal, 1),
                                }))
                              }
                              onSelectDate={(iso) => {
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
                              toLocalISODate={toLocalISODate}
                              onToday={
                                todayBookableCal
                                  ? () => {
                                      setCartSlotPicksByLineId((p) => ({
                                        ...p,
                                        [item.lineId]: { ...p[item.lineId], date: today },
                                      }));
                                      setCartCalendarMonthByLineId((prev) => ({
                                        ...prev,
                                        [item.lineId]: startOfCalendarMonth(
                                          new Date(`${today}T12:00:00`),
                                        ),
                                      }));
                                    }
                                  : undefined
                              }
                            />
                          </div>
                          <div className="lg:col-span-2">
                            {!item.provider ? (
                              <BookingTimeSlotList
                                dateLabel={formatWeekdayMonthDayYear(pick.date)}
                                slots={[]}
                                selectedTime={pick.time}
                                onSelectTime={() => {}}
                                emptyContent={
                                  <p className="text-sm text-[#949494]">
                                    Choose a provider in Step 2 to see open times.
                                  </p>
                                }
                              />
                            ) : (
                              <BookingTimeSlotList
                                dateLabel={formatWeekdayMonthDayYear(pick.date)}
                                slots={
                                  loadingLine
                                    ? []
                                    : !Array.isArray(slotsLine)
                                      ? null
                                      : displayGridCart
                                }
                                selectedTime={pick.time}
                                loading={loadingLine}
                                loadingContent={<Loader variant="dots" label="Checking availability…" />}
                                onSelectTime={(slot) => {
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
                                slotFootnote={(slot, bookable) =>
                                  bookable &&
                                  massageReservedBlockExtendsPastPublicClose(
                                    pick.date,
                                    slot,
                                    item.service,
                                  ) ? (
                                    <span className="text-[11px] font-normal text-amber-800">
                                      Schedule runs past closing
                                    </span>
                                  ) : null
                                }
                                emptyContent={
                                  <div className="space-y-3 text-sm text-amber-950">
                                    <p>No open times on this day — try another date.</p>
                                    {item.provider ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        disabled={findingNextOpenDay}
                                        onClick={() =>
                                          void findNextOpenDay({
                                            startAfterIso: pick.date,
                                            providerId: item.provider!.id,
                                            serviceId: item.service.id,
                                            durationMinutes: bookingDurationMinutes(
                                              item.service.duration_minutes,
                                            ),
                                            serviceType: item.service.service_type,
                                            onFound: (dateIso) => {
                                              setCartSlotPicksByLineId((p) => ({
                                                ...p,
                                                [item.lineId]: { ...p[item.lineId], date: dateIso },
                                              }));
                                              setCartCalendarMonthByLineId((prev) => ({
                                                ...prev,
                                                [item.lineId]: startOfCalendarMonth(
                                                  new Date(`${dateIso}T12:00:00`),
                                                ),
                                              }));
                                            },
                                          })
                                        }
                                        className="h-auto rounded-lg border-amber-300 bg-white text-sm font-semibold text-amber-950 hover:bg-amber-50"
                                      >
                                        {findingNextOpenDay ? "Searching…" : "Find next open day"}
                                      </Button>
                                    ) : null}
                                    <PublicBookingClinicHelp />
                                  </div>
                                }
                                infoNote="Times update from the live clinic schedule."
                              />
                            )}
                            {item.service.service_type === "massage" &&
                              Array.isArray(slotsLine) &&
                              slotsLine.includes(pick.time) &&
                              massageReservedBlockExtendsPastPublicClose(pick.date, pick.time, item.service) && (
                                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
                                  {massagePastClosingScheduleMessage(pick.date)}
                                </p>
                              )}
                          </div>
                        </div>

                        {cart.length === 1 && (
                          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                            <label className="flex cursor-pointer items-start gap-3">
                              <Checkbox
                                checked={repeatEnabled}
                                onCheckedChange={(v) => {
                                  setRepeatEnabled(v === true);
                                  setRecurringPreview(null);
                                }}
                                className="mt-0.5"
                              />
                              <span>
                                <span className="block text-sm font-semibold text-slate-900">
                                  Repeat this visit on a schedule
                                </span>
                                <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                                  Book several visits at once (same day of week and time). You&apos;ll get one
                                  confirmation listing all dates; we still remind you before each visit. Payment is
                                  due at each visit when you check out.
                                </span>
                              </span>
                            </label>

                            {repeatEnabled && (
                              <div className="mt-4 space-y-4 border-t border-slate-200/80 pt-4">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    How often
                                  </p>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {(
                                      [
                                        ["weekly", "Every week"],
                                        ["biweekly", "Every 2 weeks"],
                                        ["monthly", "Every month"],
                                      ] as const
                                    ).map(([value, label]) => (
                                      <button
                                        key={value}
                                        type="button"
                                        onClick={() => setRecurrence(value)}
                                        className={cn(
                                          "rounded-lg border px-3 py-2 text-sm font-medium transition",
                                          recurrence === value
                                            ? "border-[#16a349] bg-[#f0fdf4] text-[#14532d] ring-1 ring-[#16a349]/30"
                                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                                        )}
                                      >
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <label
                                    htmlFor="occurrence-count"
                                    className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                                  >
                                    Number of visits
                                  </label>
                                  <select
                                    id="occurrence-count"
                                    value={occurrenceCount}
                                    onChange={(e) => setOccurrenceCount(Number(e.target.value))}
                                    className="mt-2 w-full max-w-[12rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm"
                                  >
                                    {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                                      <option key={n} value={n}>
                                        {n} visits
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {recurringPreviewLoading && (
                                  <Loader variant="dots" label="Checking all visit dates…" className="py-2" />
                                )}
                                {!recurringPreviewLoading && recurringPreview?.occurrences?.length ? (
                                  <div>
                                    <p className="text-sm font-semibold text-slate-800">Planned visits</p>
                                    <ul className="mt-2 space-y-1.5 text-sm">
                                      {recurringPreview.occurrences.map((occ) => (
                                        <li
                                          key={occ.appointment_date}
                                          className={cn(
                                            "flex flex-wrap items-baseline justify-between gap-2 rounded-lg px-2 py-1.5",
                                            occ.status === "available"
                                              ? "bg-[#f0fdf4] text-[#14532d]"
                                              : "bg-rose-50 text-rose-900",
                                          )}
                                        >
                                          <span>
                                            {formatWeekdayMonthDayYear(occ.appointment_date)} at{" "}
                                            {occ.start_time_display}
                                          </span>
                                          {occ.status !== "available" && (
                                            <span className="text-xs font-medium">
                                              {occ.detail || "Not available"}
                                            </span>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                    {recurringPreview.all_available ? (
                                      <p className="mt-2 text-xs text-[#166534]">
                                        All {recurringPreview.occurrence_count} visits are open — you can continue.
                                      </p>
                                    ) : (
                                      <p className="mt-2 text-xs font-medium text-rose-800">
                                        Fix unavailable dates above, choose fewer visits, or pick another start date.
                                      </p>
                                    )}
                                  </div>
                                ) : null}
                                {!recurringPreviewLoading && recurringPreview && !recurringPreview.ok && (
                                  <p className="text-sm text-rose-800">{recurringPreview.detail}</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 4: Details & submit (new) or confirm reschedule ─── */}
          {step === 4 && bookingResults.length === 0 && bookingFlow === "reschedule" && reschedulePick && (
            <div className="animate-fade-in-up space-y-4 rounded-xl border border-[#e8e8e8] bg-white p-5 sm:p-8">
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
              {effectiveSlotService &&
                massageReservedBlockExtendsPastPublicClose(selectedDate, selectedTime, effectiveSlotService) && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
                    {massagePastClosingScheduleMessage(selectedDate)}
                  </div>
                )}
              <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <SmsConsentCheckbox
                  id="sms-consent-reschedule"
                  checked={smsConsent}
                  onCheckedChange={(value) => {
                    smsUserDeclinedRef.current = !value;
                    setSmsConsent(value);
                  }}
                  className="mt-0.5"
                />
                <div className="text-sm leading-relaxed text-slate-700">
                  <label htmlFor="sms-consent-reschedule" className="cursor-pointer">
                    By checking this box, I consent to receive SMS text message appointment reminders and updates from Relief
                    Chiropractic at the phone number I provided. Message &amp; data rates may apply. Reply STOP to opt out at any
                    time.
                  </label>{" "}
                  <span>
                    View our Terms of Service:{" "}
                    <a
                      href="https://www.reliefchiropractic.net/terms-of-service-3"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[#16a349] underline decoration-[#16a349]/50 underline-offset-2 hover:text-[#13823d]"
                    >
                      https://www.reliefchiropractic.net/terms-of-service-3
                    </a>
                  </span>
                </div>
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
            <div className="animate-fade-in-up space-y-6 rounded-xl border border-[#e8e8e8] bg-white p-5 sm:p-8">
              <div>
                <h2 className="text-xl font-semibold text-[#0d1f14] sm:text-2xl">Tell Us About You</h2>
                <p className="mt-2 text-base text-[#949494]">
                  We need a few details to complete your booking.
                </p>
              </div>

              <p className="rounded-xl border border-[#16a349]/20 bg-[#ecfdf5] px-4 py-3 text-sm text-[#0d5c2e]">
                Booking for someone else? Use their legal name — the phone number can be a parent or guardian&apos;s.
              </p>

              <div className="space-y-5">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#0d1f14]">
                    Cell phone number <span className="text-rose-600">*</span>
                  </label>
                  <div
                    className={`flex items-center gap-2 rounded-lg border bg-[#f8f8f7] px-4 py-3 ${
                      formErrors.phone ? "border-rose-400 bg-rose-50" : "border-[#e8e8e8]"
                    }`}
                  >
                    <PhoneInput
                      international
                      defaultCountry="US"
                      countryCallingCodeEditable={false}
                      value={phone}
                      onChange={(value) => {
                        setPhone(value);
                        setFormErrors((p) => ({ ...p, phone: undefined }));
                        setPatientLookup("idle");
                        setLookupSavedCard(null);
                        setLookupSavedCards([]);
                        setChiroIntakeRule(null);
                        setHouseholdPickList([]);
                      }}
                      placeholder="(555) 123-4567"
                      className="phone-field flex-1 text-sm"
                    />
                  </div>
                  {formErrors.phone && <p className="mt-1 text-xs text-rose-700">{formErrors.phone}</p>}
                  {patientLookup === "loading" && (
                    <p className="mt-2 text-sm text-[#949494]">Looking up…</p>
                  )}
                  {patientLookup === "returning" && firstName && (
                    <p className="mt-2 rounded-lg bg-[#ecfdf5] px-3 py-2 text-sm font-medium text-[#0d5c2e]">
                      Welcome back, {firstName}! We&apos;ve filled in your details.
                    </p>
                  )}
                  {patientLookup === "ambiguous" && (
                    <div className="mt-2 space-y-2 rounded-lg border border-[#16a349]/25 bg-[#ecfdf5] px-3 py-2 text-sm text-[#0d5c2e]">
                      <p className="font-medium">This number is linked to more than one person here.</p>
                      <p className="text-[13px] leading-relaxed text-[#5a7a62]">
                        Enter the first and last name of the patient who is coming in, or tap a saved name below.
                      </p>
                      {householdPickList.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {householdPickList.map((m) => (
                            <Button
                              key={`${m.first_name}-${m.last_name}`}
                              type="button"
                              variant="outline"
                              className="h-auto rounded-full border-[#16a349]/40 bg-white px-3 py-1.5 text-xs font-semibold text-[#0d5c2e] hover:bg-[#ecfdf5]"
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
                    <p className="mt-2 rounded-lg bg-[#f5f5f5] px-3 py-2 text-sm text-[#5a7a62]">
                      First visit? Please fill in your details below.
                    </p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#0d1f14]">
                      First name <span className="text-rose-600">*</span>
                    </label>
                    <input
                      className={`w-full rounded-lg border bg-[#f8f8f7] px-4 py-3 text-sm ${
                        formErrors.firstName ? "border-rose-400 bg-rose-50" : "border-[#e8e8e8]"
                      }`}
                      placeholder="First name"
                      value={firstName}
                      onChange={(e) => {
                        setFirstName(e.target.value);
                        setFormErrors((p) => ({ ...p, firstName: undefined }));
                      }}
                    />
                    {formErrors.firstName && (
                      <p className="mt-1 text-xs text-rose-700">{formErrors.firstName}</p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#0d1f14]">
                      Last name <span className="text-rose-600">*</span>
                    </label>
                    <input
                      className={`w-full rounded-lg border bg-[#f8f8f7] px-4 py-3 text-sm ${
                        formErrors.lastName ? "border-rose-400 bg-rose-50" : "border-[#e8e8e8]"
                      }`}
                      placeholder="Last name"
                      value={lastName}
                      onChange={(e) => {
                        setLastName(e.target.value);
                        setFormErrors((p) => ({ ...p, lastName: undefined }));
                      }}
                    />
                    {formErrors.lastName && (
                      <p className="mt-1 text-xs text-rose-700">{formErrors.lastName}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#0d1f14]">
                    Email <span className="font-normal text-[#949494]">(optional)</span>
                  </label>
                  <input
                    type="email"
                    autoComplete="email"
                    className={`w-full rounded-lg border bg-[#f8f8f7] px-4 py-3 text-sm ${
                      formErrors.email ? "border-rose-400 bg-rose-50" : "border-[#e8e8e8]"
                    }`}
                    placeholder="patient@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setFormErrors((p) => ({ ...p, email: undefined }));
                    }}
                  />
                  {formErrors.email && <p className="mt-1 text-xs text-rose-700">{formErrors.email}</p>}
                </div>

                <BookingCardSetup
                  firstName={firstName}
                  lastName={lastName}
                  email={email}
                  phone={phone}
                  existingSavedCard={lookupSavedCard}
                  existingSavedCards={lookupSavedCards}
                />

                <div className="flex items-start justify-between gap-4 rounded-lg border border-[#e8e8e8] bg-[#f5f5f5] p-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[#0d1f14]">SMS reminders</div>
                    <div className="mt-0.5 text-xs text-[#949494]">
                      Send appointment reminders and updates by text
                    </div>
                    <label htmlFor="sms-consent-new" className="mt-2 block cursor-pointer text-xs leading-relaxed text-[#5a7a62]">
                      By checking this box, I consent to receive SMS text message appointment reminders and updates from
                      Relief Chiropractic at the phone number I provided. Message &amp; data rates may apply. Reply STOP
                      to opt out.{" "}
                      <a
                        href="https://www.reliefchiropractic.net/terms-of-service-3"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-[#16a349] underline underline-offset-2"
                      >
                        Terms of Service
                      </a>
                    </label>
                  </div>
                  <SmsConsentCheckbox
                    id="sms-consent-new"
                    checked={smsConsent}
                    onCheckedChange={(value) => {
                      smsUserDeclinedRef.current = !value;
                      setSmsConsent(value);
                    }}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 5 && bookingFlow === "new" && cart.length > 0 && (
            <div className="animate-fade-in-up space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-[#0d5c2e] sm:text-2xl md:text-3xl">
                  Review &amp; Confirm
                </h2>
                <p className="mt-2 text-base text-[#949494]">
                  Everything looks good? Confirm your booking.
                </p>
              </div>

              {/* Banani BookingConfirmationSummary */}
              <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-[#e8e8e8] bg-white">
                <div className="border-b border-[#e8e8e8] bg-[#dbe7fb] px-6 py-5 sm:px-8 sm:py-6">
                  <h3 className="text-xl font-bold text-[#0d5c2e] sm:text-2xl">Confirm Your Booking</h3>
                  <p className="mt-2 text-base text-[#949494]">
                    Review your appointment details below.
                  </p>
                </div>

                <div className="flex flex-col gap-6 p-5 sm:p-8">
                  {cart.map((item, visitIndex) => {
                    const pick = cartSlotPicksByLineId[item.lineId];
                    const providerLabel = item.provider?.provider_name ?? "—";
                    return (
                      <div key={item.lineId} className="space-y-4">
                        {cart.length > 1 && (
                          <p className="text-xs font-semibold uppercase tracking-wide text-[#949494]">
                            Visit {visitIndex + 1} of {cart.length}
                          </p>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
                          <div className="rounded-lg border border-[#e8e8e8] bg-[#f5f5f5] p-5">
                            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#949494]">
                              Visit type
                            </div>
                            <div className="text-lg font-bold text-[#0d1f14]">{item.service.name}</div>
                            <div className="mt-1 text-sm text-[#949494]">
                              {item.service.duration_minutes} minutes · {formatBookingPrice(item.service.price)}
                            </div>
                          </div>
                          <div className="rounded-lg border border-[#e8e8e8] bg-[#f5f5f5] p-5">
                            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#949494]">
                              Provider
                            </div>
                            <div className="text-lg font-bold text-[#0d1f14]">{providerLabel}</div>
                          </div>
                          <div className="rounded-lg border border-[#e8e8e8] bg-[#f5f5f5] p-5">
                            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#949494]">
                              Date &amp; time
                            </div>
                            <div className="text-lg font-bold text-[#0d1f14]">
                              {pick?.date ? formatWeekdayMonthDayYear(pick.date) : "—"}
                            </div>
                            <div className="mt-1 text-sm text-[#949494]">{pick?.time ?? "—"}</div>
                            {pick?.date &&
                              pick?.time &&
                              massageReservedBlockExtendsPastPublicClose(pick.date, pick.time, item.service) && (
                                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium leading-relaxed text-amber-950">
                                  {massagePastClosingScheduleMessage(pick.date)}
                                </p>
                              )}
                          </div>
                          <div className="rounded-lg border border-[#e8e8e8] bg-[#f5f5f5] p-5">
                            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#949494]">
                              Patient
                            </div>
                            <div className="text-lg font-bold text-[#0d1f14]">
                              {firstName} {lastName}
                            </div>
                            <div className="mt-1 text-sm text-[#949494]">{phone || "—"}</div>
                          </div>
                        </div>
                        {cart.length > 1 && (
                          <button
                            type="button"
                            onClick={() => goEditScheduleLine(item.lineId)}
                            className="text-sm font-semibold text-[#0d5c2e] underline decoration-[#16a349]/40 underline-offset-2 hover:text-[#13823d]"
                          >
                            Edit date &amp; time for this visit
                          </button>
                        )}
                      </div>
                    );
                  })}

                  <div className="rounded-lg border border-[#e8e8e8] bg-[#ecfdf5] p-5">
                    <div className="flex items-start gap-3">
                      <IconMail className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#16a349]" aria-hidden />
                      <div>
                        <div className="text-sm font-medium text-[#0d1f14]">Confirmation will be sent to</div>
                        <div className="mt-1 text-sm text-[#949494]">
                          {email.trim()
                            ? email.trim()
                            : "No email on file — we'll use your phone for updates"}
                        </div>
                        {phone && (
                          <div className="mt-1 text-xs text-[#949494]">
                            We&apos;ll also send SMS reminders to {phone}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#e8e8e8] bg-[#f5f5f5] p-5">
                    <div className="flex items-start gap-3">
                      <IconAlertCircle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#949494]" aria-hidden />
                      <div>
                        <div className="text-sm font-semibold text-[#0d1f14]">Cancellation policy</div>
                        <div className="mt-2 text-xs leading-relaxed text-[#949494]">
                          There is no cancellation fee when you cancel with at least 24 hours&apos; notice.
                          If you cancel a massage less than 24 hours before the visit, you will be charged the
                          full massage price. Other visit types are not charged a late-cancellation fee.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-[#e8e8e8] bg-[#f5f5f5] px-5 py-5 sm:flex-row sm:px-8 sm:py-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(4)}
                    className="h-auto flex-1 rounded-lg border border-[#e8e8e8] bg-white py-3.5 text-sm font-semibold text-[#0d1f14] hover:bg-[#f8f8f7]"
                  >
                    Edit Details
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void submitBooking()}
                    disabled={isSubmitting || !smsConsent}
                    className="h-auto flex-1 rounded-lg bg-[#16a349] py-3.5 text-sm font-semibold text-white hover:bg-[#13823d]"
                  >
                    {isSubmitting ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader variant="spinner" />
                        Confirming…
                      </span>
                    ) : cart.length > 1 ? (
                      `Confirm ${cart.length} Bookings`
                    ) : (
                      "Confirm Booking"
                    )}
                  </Button>
                </div>
              </div>

              {bookingMessage && (
                <p
                  className={`text-sm font-medium ${
                    bookingMessageKind === "success" ? "text-[#166534]" : "text-rose-700"
                  }`}
                >
                  {bookingMessage}
                </p>
              )}

              <div className="rounded-xl border border-[#e8e8e8] bg-white p-6 text-center sm:p-8">
                <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#dbe7fb]">
                  <IconCheck className="h-7 w-7 text-[#16a349]" aria-hidden />
                </div>
                <h3 className="text-xl font-bold text-[#0d5c2e]">Almost there</h3>
                <p className="mx-auto mt-2 max-w-md text-base text-[#949494]">
                  Your appointment is ready to book. Tap &quot;Confirm Booking&quot; above to finish your reservation.
                </p>
              </div>
            </div>
          )}

          {/* ─── Success after confirm (step 5 new / step 4 reschedule) ─── */}
          {((bookingFlow === "new" && step === 5) ||
            (bookingFlow === "reschedule" && step === 4)) &&
            bookingResults.length > 0 &&
            cart.length === 0 && (
            <div className="animate-fade-in-up space-y-6">
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#dbe7fb]">
                  <IconCheck className="h-7 w-7 text-[#16a349]" aria-hidden />
                </div>
                <h2 className="text-2xl font-bold text-[#0d5c2e] sm:text-3xl">You&apos;re all set!</h2>
                <p className="mt-2 text-base text-[#949494]">We&apos;ll see you soon.</p>
              </div>

              <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-[#e8e8e8] bg-white">
                <div className="border-b border-[#e8e8e8] bg-[#ecfdf5] px-6 py-5 sm:px-8 sm:py-6">
                  <h3 className="text-xl font-bold text-[#0d5c2e] sm:text-2xl">
                    {bookingResults.length > 1 ? "Your visits are confirmed" : "Your visit is confirmed"}
                  </h3>
                  <p className="mt-2 text-base text-[#949494]">
                    {bookingResults.length > 1
                      ? `${bookingResults.length} confirmation numbers below — save them for your records.`
                      : `Confirmation #${bookingResults[0].appointment_id}`}
                  </p>
                </div>

                <div className="flex flex-col gap-6 p-5 sm:p-8">
                  {bookingResults.map((result, visitIndex) => (
                    <div key={result.appointment_id} className="space-y-4">
                      {bookingResults.length > 1 && (
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#949494]">
                          Visit {visitIndex + 1} of {bookingResults.length} · Confirmation #
                          {result.appointment_id}
                        </p>
                      )}
                      <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
                        <div className="rounded-lg border border-[#e8e8e8] bg-[#f5f5f5] p-5">
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#949494]">
                            Visit type
                          </div>
                          <div className="text-lg font-bold text-[#0d1f14]">{result.service}</div>
                          {result.duration_minutes != null && (
                            <div className="mt-1 text-sm text-[#949494]">
                              {result.duration_minutes} minutes
                            </div>
                          )}
                        </div>
                        <div className="rounded-lg border border-[#e8e8e8] bg-[#f5f5f5] p-5">
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#949494]">
                            Provider
                          </div>
                          <div className="text-lg font-bold text-[#0d1f14]">
                            {result.provider || "—"}
                          </div>
                        </div>
                        <div className="rounded-lg border border-[#e8e8e8] bg-[#f5f5f5] p-5">
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#949494]">
                            Date &amp; time
                          </div>
                          <div className="text-lg font-bold text-[#0d1f14]">
                            {formatWeekdayMonthDayYear(result.appointment_date)}
                          </div>
                          <div className="mt-1 text-sm text-[#949494]">{result.start_time}</div>
                        </div>
                        <div className="rounded-lg border border-[#e8e8e8] bg-[#f5f5f5] p-5">
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#949494]">
                            Patient
                          </div>
                          <div className="text-lg font-bold text-[#0d1f14]">{result.patient}</div>
                          <div className="mt-1 text-sm font-medium text-[#e9982f]">
                            {formatBookingPrice(result.total_amount)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="rounded-lg border border-[#e8e8e8] bg-[#ecfdf5] p-5">
                    <div className="flex items-start gap-3">
                      <IconMail className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#16a349]" aria-hidden />
                      <div>
                        <div className="text-sm font-medium text-[#0d1f14]">
                          Confirmation sent by text and email
                        </div>
                        <div className="mt-1 text-sm text-[#949494]">
                          Check in at the kiosk when you arrive.
                        </div>
                        {bookingResults.some((r) => /new office visit/i.test(r.service)) && (
                          <p className="mt-2 text-xs leading-relaxed text-[#5a7a62]">
                            First visit? Arrive 25 minutes early or{" "}
                            <a
                              href="https://www.reliefchiropractic.net/s/New-Patient-Paperwork-2025.doc"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-[#16a349] underline decoration-[#16a349]/40 underline-offset-2 hover:text-[#13823d]"
                            >
                              download paperwork
                            </a>{" "}
                            beforehand.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-[#e8e8e8] bg-[#f5f5f5] px-5 py-5 sm:flex-row sm:px-8 sm:py-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={downloadCalendar}
                    className="h-auto flex-1 rounded-lg border border-[#e8e8e8] bg-white py-3.5 text-sm font-semibold text-[#0d1f14] hover:bg-[#f8f8f7]"
                  >
                    Add to calendar
                  </Button>
                  <Button
                    type="button"
                    onClick={() => router.push("/")}
                    className="h-auto flex-1 rounded-lg bg-[#16a349] py-3.5 text-sm font-semibold text-white hover:bg-[#13823d]"
                  >
                    Done
                  </Button>
                </div>
              </div>

              <p className="mx-auto max-w-2xl text-center text-xs leading-relaxed text-[#949494]">
                Add to calendar downloads a small calendar file. Open it to add this visit to Apple Calendar, Google
                Calendar, Outlook, or another calendar app on your phone or computer.
              </p>
            </div>
          )}

          {!(
            ((bookingFlow === "new" && step === 5) ||
              (bookingFlow === "reschedule" && step === 4)) &&
            bookingResults.length > 0 &&
            cart.length === 0
          ) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 pt-4">
            <Button
              type="button" variant="outline" onClick={goToPreviousStep}
              disabled={
                (step === 1 && !selectedCategory && cart.length === 0 && !addingAnother && bookingFlow !== "reschedule")
              }
              className="h-auto min-h-11 rounded-lg border border-[#e8e8e8] bg-white px-6 py-3 text-sm text-[#949494] hover:bg-[#f5f5f5] sm:min-h-0"
            >
              Back
            </Button>
            {!(bookingFlow === "new" && step === 5) && (
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
                  if (cart.length === 1 && repeatEnabled) {
                    if (recurringPreviewLoading) {
                      toast.error("Still checking recurring visit dates — wait a moment.");
                      return;
                    }
                    if (!recurringPreview?.ok || !recurringPreview.all_available) {
                      toast.error(
                        recurringPreview?.detail ||
                          "One or more recurring visits are not available. Adjust dates or turn off repeat visits.",
                      );
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
                if (step === 4 && bookingFlow === "new") {
                  if (!canProceedToConfirmStep()) return;
                  setStep(5);
                  return;
                }
                if (step < 4) {
                  setStep((step + 1) as Step);
                }
              }}
              disabled={
                (step === 1 && bookingFlow === "new" && cart.length === 0) ||
                (step === 1 && bookingFlow === "reschedule") ||
                (step === 2 && bookingFlow === "new" && needsProviderSelection)
              }
              className="h-auto min-h-11 rounded-lg bg-[#16a349] px-8 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] sm:min-h-0"
            >
              {step === 1
                ? "Continue: Choose Provider"
                : step === 2
                  ? "Continue: Date & Time"
                  : step === 3
                    ? "Continue: Your Info"
                    : step === 4 && bookingFlow === "new"
                      ? "Continue: Review & Confirm"
                      : "Next"}
              <IconArrowRight className="ml-2 h-4 w-4" />
            </Button>
            )}
          </div>
          )}
            </>
          )}
        </section>

        {/* Booking summary — sticky on desktop so it stays in view while you scroll steps */}
        {!hideBookingSidebar && bookingFlow !== "update_info" && (
        <aside className="order-2 min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-xl border-2 border-[#d1e8d8] bg-white shadow-sm shadow-[#16a349]/5">
            <div className="border-b border-[#d1e8d8] bg-[#ecfdf5] px-5 py-4">
              <h3 className="text-base font-bold tracking-tight text-[#0d5c2e]">
                {bookingFlow === "reschedule" ? "Reschedule summary" : "Booking summary"}
              </h3>
              <p className="mt-0.5 text-xs text-[#5a7a62]">Your visit details at a glance</p>
            </div>

            <div className="space-y-4 p-5">
            <div className="rounded-xl border border-[#e8e8e8] bg-[#f8fdf9] p-3.5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#949494]">Appointment date & time</p>
              {bookingFlow === "reschedule" ? (
                step >= 3 ? (
                  <p className="font-semibold text-[#0d1f14]">
                    {formatWeekdayMonthDayYear(selectedDate)} at {selectedTime}
                  </p>
                ) : (
                  <p className="text-sm text-[#949494]">No date selected yet</p>
                )
              ) : cart.length === 1 ? (
                step >= 3 && cartSlotPicksByLineId[cart[0].lineId]?.date ? (
                  <p className="font-semibold text-[#0d1f14]">
                    {formatWeekdayMonthDayYear(cartSlotPicksByLineId[cart[0].lineId].date)} at{" "}
                    {cartSlotPicksByLineId[cart[0].lineId].time}
                  </p>
                ) : (
                  <p className="text-sm text-[#949494]">No date selected yet</p>
                )
              ) : cart.length > 1 ? (
                step >= 3 ? (
                  <p className="text-sm leading-relaxed text-[#5a7a62]">
                    Each service below has its own date and time — they do not have to be the same day.
                  </p>
                ) : (
                  <p className="text-sm text-[#949494]">No date selected yet</p>
                )
              ) : (
                <p className="text-sm text-[#949494]">No date selected yet</p>
              )}
            </div>

            {cart.length === 0 && !(bookingFlow === "reschedule" && reschedulePick) && (
              <div className="rounded-xl border border-dashed border-[#d1e8d8] bg-[#f8fdf9] p-4">
                <p className="text-sm text-[#949494]">No services selected yet</p>
              </div>
            )}

            {cartSchedule.map((item) => (
              <div key={item.lineId} className="rounded-xl border border-[#d1e8d8] bg-[#f8fdf9] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#949494]">Selected visit</p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[#5a7a62]">Service</span>
                    <span className="text-right font-medium text-[#0d1f14]">{item.service.name}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[#5a7a62]">Duration</span>
                    <span className="font-medium text-[#0d1f14]">{item.service.duration_minutes} min</span>
                  </div>
                  {item.provider && !item.providerSkipped && (
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-[#5a7a62]">Provider</span>
                      <span className="text-right font-medium text-[#0d1f14]">{item.provider.provider_name}</span>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[#5a7a62]">Date & time</span>
                    <span className="text-right font-medium text-[#0d1f14]">
                      {step >= 3 && item.visitDate ? (
                        `${formatWeekdayMonthDayYear(item.visitDate)} at ${item.visitTime}`
                      ) : (
                        <span className="font-normal text-[#949494]">No date selected yet</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[#5a7a62]">Price</span>
                    <span className="font-medium text-[#0d1f14]">{formatBookingPrice(item.service.price)}</span>
                  </div>
                </div>
              </div>
            ))}

            <div className="rounded-xl border border-[#e9982f]/35 bg-[#fff8ef] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#9a6700]">Total due at visit</p>
              <p className="mt-1 text-3xl font-extrabold tracking-tight text-[#9a6700]">
                {formatBookingPrice(String(totalPrice))}
              </p>
              <p className="mt-2 text-xs leading-snug text-[#9a6700]/90">
                Payment is due at the time of your visit.
              </p>
              {cart.length > 1 && (
                <p className="mt-1 text-xs text-[#9a6700]">{cart.length} separate visits in your cart</p>
              )}
            </div>
            </div>
          </div>
        </aside>
        )}
      </div>
      </div>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#e8e8e8] bg-white px-4 py-5 sm:px-8 md:px-10">
        <p className="text-xs text-[#949494]">
          &copy; 2026 Relief Chiropractic and Wellness Center
        </p>
        <div className="flex flex-wrap gap-4 sm:gap-6">
          <a href="https://www.reliefchiropractic.net/" className="text-xs text-[#949494] hover:text-[#0d5c2e]">
            Contact Us
          </a>
        </div>
      </footer>
    </main>
  );
}
