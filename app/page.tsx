"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAppFeedback } from "@/components/app-feedback";
import { IconCheck } from "@/components/icons";
import { Loader } from "@/components/loader";
import { BookingCardSetup } from "@/components/booking-card-setup";
import { Button } from "@/components/ui/button";
import { ApiError, apiGet, apiPostPublic } from "@/lib/api";
import { cn } from "@/lib/utils";
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
  service_type?: string;
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
  provider_id: number;
  provider_name: string;
  duration_minutes: number;
  price: string;
};

type BookingFlowMode = "new" | "reschedule";

type CartItem = {
  service: ServiceOption;
  provider: ProviderOption | null;
  providerSkipped: boolean;
};

const ALL_TIME_SLOTS = ["9:00 AM", "10:15 AM", "2:30 PM", "3:45 PM", "5:15 PM"];
const BETWEEN_SERVICE_BUFFER_MINUTES = 15;

function formatBookingPrice(p: string): string {
  const n = parseFloat(p);
  if (Number.isNaN(n)) return `$${p}`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function addMinutesToTimeSlot(slot: string, minutes: number): string {
  const match = slot.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return slot;
  let h = parseInt(match[1], 10);
  let m = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  const totalMin = h * 60 + m + minutes;
  const newH = Math.floor(totalMin / 60) % 24;
  const newM = totalMin % 60;
  const newAmpm = newH >= 12 ? "PM" : "AM";
  const displayH = newH === 0 ? 12 : newH > 12 ? newH - 12 : newH;
  return `${displayH}:${String(newM).padStart(2, "0")} ${newAmpm}`;
}

export default function BookingPage() {
  const { toast } = useAppFeedback();
  const today = new Date().toISOString().slice(0, 10);
  const [options, setOptions] = useState<BookingOptions | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [step, setStep] = useState<Step>(1);
  const [selectedCategory, setSelectedCategory] = useState<"chiropractic" | "massage" | null>(null);

  // Multi-service cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [addingAnother, setAddingAnother] = useState(false);

  const [selectedTime, setSelectedTime] = useState(ALL_TIME_SLOTS[2]);
  const [selectedDate, setSelectedDate] = useState(today);
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
  const [patientLookup, setPatientLookup] = useState<"idle" | "loading" | "returning" | "new">("idle");
  const [bookingFlow, setBookingFlow] = useState<BookingFlowMode>("new");
  const [rescheduleList, setRescheduleList] = useState<RescheduleAppointmentRow[]>([]);
  const [rescheduleListLoading, setRescheduleListLoading] = useState(false);
  const [rescheduleListError, setRescheduleListError] = useState("");
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

  const fetchOptions = () => {
    setOptionsError("");
    setOptionsLoading(true);
    withMinimumDelay(apiGet<BookingOptions>("/booking-options/"), 520)
      .then((data) => setOptions(data))
      .catch(() => setOptionsError("Could not load booking options. Make sure the API is running, then try again."))
      .finally(() => setOptionsLoading(false));
  };

  useEffect(() => { fetchOptions(); }, []);

  const firstCartItem = cart[0] ?? null;
  const firstProvider = firstCartItem?.provider ?? null;
  const firstService = firstCartItem?.service ?? null;

  /** For availability: same as cart head, or the visit being rescheduled. */
  const effectiveSlotService = useMemo((): ServiceOption | null => {
    if (bookingFlow === "reschedule" && reschedulePick && options) {
      return options.services.find((s) => s.id === reschedulePick.service_id) ?? null;
    }
    return firstService;
  }, [bookingFlow, reschedulePick, options, firstService]);

  const effectiveSlotProvider = useMemo((): ProviderOption | null => {
    if (bookingFlow === "reschedule" && reschedulePick) {
      return { id: reschedulePick.provider_id, provider_name: reschedulePick.provider_name };
    }
    return firstProvider;
  }, [bookingFlow, reschedulePick, firstProvider]);

  const totalCartMinutes = useMemo(() => {
    if (cart.length <= 1) return cart[0]?.service.duration_minutes ?? 0;
    return cart.reduce((sum, item) => sum + item.service.duration_minutes, 0)
      + BETWEEN_SERVICE_BUFFER_MINUTES * (cart.length - 1);
  }, [cart]);

  /** Multi-service chain on one provider: API must reserve the full block (each visit + breaks). */
  const cartSameProviderChain = useMemo(() => {
    if (cart.length <= 1 || !firstProvider) return false;
    return cart.every((c) => c.provider && c.provider.id === firstProvider.id);
  }, [cart, firstProvider]);

  useEffect(() => {
    if (!effectiveSlotService || !effectiveSlotProvider || !selectedDate) {
      setAvailableSlots(null);
      return;
    }
    setSlotsLoading(true);
    const params = new URLSearchParams({
      date: selectedDate,
      provider_id: String(effectiveSlotProvider.id),
      service_id: String(effectiveSlotService.id),
    });
    if (bookingFlow === "new" && cart.length > 1 && cartSameProviderChain) {
      params.set("block_minutes", String(totalCartMinutes));
    }
    if (bookingFlow === "reschedule" && reschedulePick && phone && isValidPhoneNumber(phone)) {
      params.set("exclude_appointment_id", String(reschedulePick.id));
      params.set("phone", phone);
    }
    apiGet<{ available_slots: string[] }>(`/booking-options/availability/?${params.toString()}`)
      .then((res) => {
        let slots = res.available_slots;
        // Different provider per service: only the first visit is constrained server-side; rough end-of-day check for the chain.
        if (bookingFlow === "new" && cart.length > 1 && !cartSameProviderChain) {
          const DAY_END = 18 * 60; // 6:00 PM in minutes
          slots = slots.filter((slot) => {
            const m = slot.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
            if (!m) return true;
            let h = parseInt(m[1], 10);
            const min = parseInt(m[2], 10);
            const ap = m[3].toUpperCase();
            if (ap === "PM" && h !== 12) h += 12;
            if (ap === "AM" && h === 12) h = 0;
            return h * 60 + min + totalCartMinutes <= DAY_END;
          });
        }
        setAvailableSlots(slots);
        setSlotWarning("");
      })
      .catch(() => setAvailableSlots(ALL_TIME_SLOTS))
      .finally(() => setSlotsLoading(false));
  }, [
    selectedDate,
    effectiveSlotProvider?.id,
    effectiveSlotService?.id,
    totalCartMinutes,
    cart.length,
    cartSameProviderChain,
    bookingFlow,
    reschedulePick?.id,
    phone,
  ]);

  useEffect(() => {
    if (availableSlots && availableSlots.length > 0 && !availableSlots.includes(selectedTime)) {
      setSelectedTime(availableSlots[0]);
    }
  }, [availableSlots]);

  useEffect(() => {
    if (step !== 4 || !phone || !isValidPhoneNumber(phone)) {
      if (step !== 4) {
        setPatientLookup("idle");
        setLookupSavedCard(null);
      }
      return;
    }
    const t = setTimeout(() => {
      setPatientLookup("loading");
      apiGet<{
        found: boolean;
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
          const nextRule = needsIntake
            ? {
                requiresIntake: true as const,
                intakeServices,
                gapDays,
                lastVisit,
                reason: (reason ?? "new_patient") as "gap" | "first_chiro" | "new_patient",
              }
            : null;

          if (res.found && res.first_name != null && res.last_name != null) {
            setFirstName(res.first_name);
            setLastName(res.last_name);
            setEmail(res.email ?? "");
            setPatientLookup("returning");
            setLookupSavedCard(
              res.has_saved_card && res.card_last4
                ? { card_brand: res.card_brand ?? "", card_last4: res.card_last4 }
                : null,
            );
            setChiroIntakeRule(nextRule);
          } else {
            setPatientLookup("new");
            setLookupSavedCard(null);
            setChiroIntakeRule(nextRule);
          }
        })
        .catch(() => {
          setPatientLookup("new");
          setLookupSavedCard(null);
          setChiroIntakeRule(null);
        });
    }, 500);
    return () => clearTimeout(t);
  }, [step, phone]);

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

  const totalDuration = useMemo(
    () => cart.reduce((sum, item) => sum + item.service.duration_minutes, 0),
    [cart],
  );

  const anyProviderSkipped = cart.every((c) => c.providerSkipped);

  const addServiceToCart = (service: ServiceOption) => {
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
    const providers = options?.providers_by_service?.[service.id] ?? [];
    const item: CartItem = {
      service,
      provider: providers.length === 1 ? providers[0] : null,
      providerSkipped: providers.length <= 1,
    };
    setCart((prev) => [...prev, item]);
    setSelectedCategory(null);
    setAddingAnother(false);
  };

  const removeFromCart = (serviceId: number) => {
    setCart((prev) => prev.filter((c) => c.service.id !== serviceId));
  };

  const needsProviderSelection = cart.some((c) => !c.provider && !c.providerSkipped);

  const proceedFromStep1 = () => {
    if (chiroGapBlocksCart) {
      toast.error(
        "Update your chiropractic visit to a new patient or reactivation type (see the notice above), then continue.",
      );
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
    setStep(1);
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
    setStep(1);
  };

  const loadMyAppointments = () => {
    if (!phone || !isValidPhoneNumber(phone)) {
      toast.error("Enter a valid cell number first.");
      return;
    }
    setRescheduleListLoading(true);
    setRescheduleListError("");
    apiGet<{
      first_name: string;
      last_name: string;
      email: string;
      appointments: RescheduleAppointmentRow[];
    }>(`/booking-options/my-appointments/?phone=${encodeURIComponent(phone)}`)
      .then((res) => {
        setRescheduleList(res.appointments ?? []);
        setFirstName(res.first_name ?? "");
        setLastName(res.last_name ?? "");
        setEmail(res.email ?? "");
        if ((res.appointments ?? []).length === 0) {
          setRescheduleListError(
            "No upcoming visits found for this number that can be changed online. Call the clinic if you need help.",
          );
        }
      })
      .catch((e) => {
        setRescheduleList([]);
        setRescheduleListError(e instanceof ApiError ? e.message : "Could not load your visits. Try again.");
      })
      .finally(() => setRescheduleListLoading(false));
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
    activateNewBookingFlow();
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitBooking = async () => {
    if (cart.length === 0) return;
    setBookingMessage("");
    setSlotWarning("");
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
    if (chiroGapBlocksCart) {
      setBookingMessageKind("error");
      setBookingMessage(
        "Please update your chiropractic visit to a new patient or reactivation appointment, then try again.",
      );
      toast.error("This booking requires a new client chiropractic visit. Go back and change your selected visit type.");
      return;
    }
    setIsSubmitting(true);
    const results: BookingResult[] = [];
    let currentTime = selectedTime;

    try {
      for (const item of cart) {
        const result = await apiPostPublic<BookingResult>("/appointments/book/", {
          first_name: firstName,
          last_name: lastName,
          phone,
          email,
          service_id: item.service.id,
          provider_id: item.provider?.id,
          provider_name: item.provider?.provider_name ?? "",
          service_name: item.service.name,
          service_duration_minutes: item.service.duration_minutes,
          service_price: item.service.price,
          appointment_date: selectedDate,
          start_time: currentTime,
        });
        results.push(result);
        currentTime = addMinutesToTimeSlot(
          currentTime,
          item.service.duration_minutes + BETWEEN_SERVICE_BUFFER_MINUTES,
        );
      }
      setBookingResults(results);
      setBookingMessageKind("success");
      const ids = results.map((r) => `#${r.appointment_id}`).join(", ");
      setBookingMessage(`Appointments booked successfully. IDs: ${ids}`);
      toast.success(
        results.length > 1
          ? "Both appointments confirmed! Your confirmations are on screen."
          : "Appointment confirmed! Your confirmation is on screen.",
      );
    } catch (error) {
      setBookingMessageKind("error");
      if (error instanceof ApiError && error.status === 409) {
        setStep(3);
        setSlotWarning(error.message);
        setBookingMessage("Please select another available time slot.");
        toast.info("That time is no longer available — please choose another slot.");
      } else {
        setBookingMessage("Could not complete booking. Please check API/server setup and try again.");
        toast.error(error instanceof ApiError ? error.message : "Could not complete booking. Please try again.");
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
    setBookingMessage("");
    setSlotWarning("");
    setIsSubmitting(true);
    try {
      const result = await apiPostPublic<BookingResult>("/booking-options/reschedule/", {
        phone,
        appointment_id: reschedulePick.id,
        appointment_date: selectedDate,
        start_time: selectedTime,
      });
      setBookingResults([result]);
      setBookingMessageKind("success");
      setBookingMessage(`Appointment rescheduled. Confirmation #${result.appointment_id}`);
      toast.success("Your visit has been moved to the new time.");
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
    const generated = esc(new Date().toLocaleString());

    const rowsHtml = bookingResults
      .map(
        (r, i) => `
        ${bookingResults.length > 1 ? `<tr><td colspan="2" style="padding:10px 14px;font-weight:700;font-size:13px;color:#166534;background:#f0fdf4;border-bottom:1px solid #e2e8f0;">Appointment ${i + 1}</td></tr>` : ""}
        <tr><th scope="row">Confirmation #</th><td>${esc(r.appointment_id)}</td></tr>
        <tr><th scope="row">Patient</th><td>${esc(r.patient)}</td></tr>
        <tr><th scope="row">Service</th><td>${esc(r.service)}</td></tr>
        ${r.provider ? `<tr><th scope="row">Doctor</th><td>${esc(r.provider)}</td></tr>` : ""}
        <tr><th scope="row">Date</th><td>${esc(r.appointment_date)}</td></tr>
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

  // Schedule preview for cart items (includes 15-min break between services), or the single visit being rescheduled
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
          service: svc,
          provider: prov,
          providerSkipped: false,
          startTime: selectedTime,
          endTime: addMinutesToTimeSlot(selectedTime, svc.duration_minutes),
        },
      ];
    }
    let time = selectedTime;
    return cart.map((item, idx) => {
      const startTime = time;
      const endTime = addMinutesToTimeSlot(time, item.service.duration_minutes);
      time = idx < cart.length - 1
        ? addMinutesToTimeSlot(endTime, BETWEEN_SERVICE_BUFFER_MINUTES)
        : endTime;
      return { ...item, startTime, endTime };
    });
  }, [bookingFlow, reschedulePick, options, cart, selectedTime]);

  return (
    <main className="content-fade-in min-h-[100dvh] min-h-screen bg-gradient-to-b from-background via-[#ecfdf5]/25 to-background">
      <div className="mx-auto max-w-7xl px-[max(1rem,env(safe-area-inset-left))] py-4 pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] md:p-8">
      <section className="mb-8 overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-card via-white to-primary/[0.06] shadow-sm shadow-slate-200/40 ring-1 ring-primary/10">
        <div className="grid gap-0 md:grid-cols-2">
          <div className="p-6 md:p-10">
            <p className="mb-3 inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-slate-800">
              Relief Chiropractic · Online booking
            </p>
            <h1 className="leading-tight">
              <span className="block text-4xl font-extrabold tracking-tight text-[#e9982f] md:text-5xl">Relief Chiropractic</span>
              <span className="mt-2 block text-2xl font-bold text-foreground md:text-3xl">
                Book your appointment with confidence
              </span>
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground md:text-base">
              {bookingFlow === "reschedule"
                ? "Move a visit you already booked to another open time. We’ll verify your cell number and only show times that work for your doctor."
                : "Pick a service category, choose your visit, then select your time. You can book multiple services at once."}
            </p>
            <div className="mt-4 flex max-w-lg flex-wrap gap-2">
              <button
                type="button"
                onClick={() => activateNewBookingFlow()}
                className={cn(
                  "rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
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
                  "rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
                  bookingFlow === "reschedule"
                    ? "bg-[#16a349] text-white shadow-sm shadow-[#16a349]/20"
                    : "border border-border/80 bg-card text-foreground hover:border-primary/30",
                )}
              >
                Reschedule a visit
              </button>
            </div>
            {/* First thing visitors see: path to check-in without starting the booking steps */}
            <div className="mt-5 flex max-w-lg flex-col gap-3 rounded-xl border border-primary/20 bg-primary/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-3.5">
              <p className="text-sm leading-snug text-foreground">
                <span className="font-semibold text-[#0d5c2e]">Already have a visit today?</span>{" "}
                <span className="text-muted-foreground">Check in with the cell number on your appointment — no need to book again.</span>
              </p>
              <Link
                href="/kiosk"
                className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#16a349] px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm shadow-[#16a349]/20 transition hover:bg-[#13823d] active:scale-[0.99]"
              >
                Open check-in
              </Link>
            </div>
          </div>
          <div className="relative min-h-[14rem] md:min-h-full">
            <Image src="/images/clinic-reception.png" alt="Clinic reception" fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" priority />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/20 to-transparent md:bg-gradient-to-l" aria-hidden />
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-2xl border border-border/90 bg-card p-5 shadow-sm ring-1 ring-slate-100/80 md:p-6 space-y-5">
          <div className="grid gap-2 sm:grid-cols-4">
            {([1, 2, 3, 4] as Step[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStep(item)}
                className={cn(
                  "rounded-xl px-3 py-2.5 text-sm font-semibold transition-all",
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
                  {rescheduleList.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Tap a visit to reschedule</p>
                      {rescheduleList.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => {
                            setReschedulePick(row);
                            setSlotWarning("");
                            setStep(2);
                          }}
                          className="w-full rounded-xl border border-border/90 bg-card p-4 text-left transition-all hover:border-[#16a349]/40 hover:bg-[#f0fdf4]/50"
                        >
                          <p className="font-semibold text-slate-900">{row.service_name}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {row.provider_name} ·{" "}
                            {new Date(row.appointment_date + "T12:00:00").toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}{" "}
                            at {row.start_time}
                          </p>
                        </button>
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
                      Chiropractic: new here or first chiro with us? Pick a <span className="font-medium text-slate-800">new office visit</span>.
                      <span className="font-medium text-slate-800">Over 2 years</span> since last chiro? You&apos;ll need a{" "}
                      <span className="font-medium text-slate-800">first-time-style</span> visit (new office / reactivation). We confirm
                      when you enter your cell number.
                    </p>
                  ) : null}
                  <div className="space-y-2">
                    {cart.map((item) => (
                      <div key={item.service.id} className="flex items-center justify-between rounded-xl border-2 border-primary/30 bg-primary/[0.06] p-4">
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
                          onClick={() => removeFromCart(item.service.id)}
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
                  <div className="grid gap-3 sm:grid-cols-2">
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
                    <p className="rounded-lg border border-[#166534]/20 bg-[#ecfdf5]/80 px-3 py-2.5 text-xs leading-relaxed text-slate-700">
                      <span className="font-semibold text-[#0d5c2e]">Chiropractic visits: </span>
                      <strong className="text-slate-900">New to Relief</strong> or{" "}
                      <strong className="text-slate-900">first chiropractic visit</strong> here? Choose a{" "}
                      <strong className="text-slate-900">new patient</strong> or <strong className="text-slate-900">new office visit</strong>.
                      Inactive <strong className="text-slate-900">over 2 years (24 months)</strong> for chiropractic? You&apos;ll be asked to
                      book a <strong className="text-slate-900">first-time-style visit</strong> (new office / reactivation) before regular
                      visits. Online booking checks your cell number and will guide you.
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
                        {new Date(reschedulePick.appointment_date + "T12:00:00").toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}{" "}
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
              <h2 className="text-lg font-semibold">Choose your doctor</h2>
              {cart.filter((c) => !c.provider && !c.providerSkipped).map((item) => {
                const providers = options?.providers_by_service?.[item.service.id] ?? [];
                return (
                  <div key={item.service.id} className="space-y-2">
                    <p className="text-sm text-slate-600">
                      For <span className="font-medium text-slate-900">{item.service.name}</span>:
                    </p>
                    {providers.length === 0 ? (
                      <p className="text-slate-500">No doctors available. Please choose another service.</p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-3">
                        {providers.map((provider) => (
                          <button
                            key={provider.id}
                            type="button"
                            onClick={() => {
                              setCart((prev) =>
                                prev.map((c) =>
                                  c.service.id === item.service.id ? { ...c, provider, providerSkipped: false } : c,
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

              {/* Help visitors who already booked and only need check-in (kiosk) */}
              <div className="flex flex-col gap-3 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.07] to-card px-4 py-4 ring-1 ring-primary/10 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">Already have an appointment today?</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    You don&apos;t need to pick a new time here. Use our check-in screen with the cell number on your
                    booking.
                  </p>
                </div>
                <Link
                  href="/kiosk"
                  className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#16a349] px-5 py-3 text-center text-sm font-semibold text-white shadow-md shadow-[#16a349]/20 transition hover:bg-[#13823d] active:scale-[0.99]"
                >
                  Open check-in
                </Link>
              </div>

              {/* Visual calendar grid */}
              <div className="rounded-xl border-2 border-primary/25 bg-primary/[0.06] p-4 ring-1 ring-primary/10">
                <label className="mb-3 block text-sm font-semibold text-foreground">Pick a date</label>
                <div className="grid grid-cols-7 gap-1 text-center sm:gap-1.5">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d} className="pb-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 sm:text-[11px] sm:tracking-wider">
                      {d}
                    </div>
                  ))}
                  {(() => {
                    const todayObj = new Date(today + "T12:00:00");
                    const days: React.ReactNode[] = [];
                    // Start from today's week start (Sunday)
                    const startOfWeek = new Date(todayObj);
                    startOfWeek.setDate(todayObj.getDate() - todayObj.getDay());
                    // Show 14 days from the start of this week
                    for (let i = 0; i < 14; i++) {
                      const d = new Date(startOfWeek);
                      d.setDate(startOfWeek.getDate() + i);
                      const iso = d.toISOString().slice(0, 10);
                      const isPast = iso < today;
                      const isSunday = d.getDay() === 0;
                      const isSelected = iso === selectedDate;
                      const isToday = iso === today;
                      days.push(
                        <button
                          key={iso}
                          type="button"
                          disabled={isPast || isSunday}
                          onClick={() => setSelectedDate(iso)}
                          className={cn(
                            "relative flex h-9 w-full items-center justify-center rounded-lg text-xs font-medium transition-all sm:h-11 sm:text-sm",
                            isPast || isSunday
                              ? "cursor-not-allowed text-slate-300"
                              : isSelected
                                ? "bg-[#16a349] font-bold text-white shadow-md shadow-[#16a349]/25"
                                : "hover:bg-primary/10 text-slate-700",
                            isToday && !isSelected && "ring-2 ring-[#16a349]/40",
                          )}
                        >
                          {d.getDate()}
                          {isToday && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#16a349]" />}
                        </button>,
                      );
                    }
                    return days;
                  })()}
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  Selected:{" "}
                  <strong className="text-[#166534]">
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                  </strong>
                </p>
              </div>

              {/* Time slots grouped by period */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Available time{" "}
                  {bookingFlow === "new" && cart.length > 1
                    ? cartSameProviderChain
                      ? "(full block — all services, breaks, and visit length on this schedule)"
                      : "(for your first service; other visits may use a different provider)"
                    : ""}
                </label>
                <p className="mb-2 text-xs leading-snug text-slate-500">
                  Start times are offered on a <strong className="font-medium text-slate-600">15-minute grid</strong>. Each
                  time must have enough open room for{" "}
                  {bookingFlow === "new" && cart.length > 1 && cartSameProviderChain ? (
                    <>all services and breaks between them (<strong className="text-slate-600">{totalCartMinutes} min</strong> total).</>
                  ) : (
                    <>your visit length (<strong className="text-slate-600">{effectiveSlotService?.duration_minutes ?? "—"} min</strong>).</>
                  )}{" "}
                  If options look far apart (e.g. 9:00 vs 10:15), the starts in between usually conflict with other
                  bookings — not a hidden 30-minute buffer added to your 45-minute visit.
                </p>
                {slotsLoading && <Loader variant="dots" label="Checking availability…" className="mb-2" />}
                {(() => {
                  const slotsToShow = availableSlots === null ? ALL_TIME_SLOTS : availableSlots;
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

              {/* Multi-service break info */}
              {bookingFlow === "new" && cart.length > 1 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-sm text-blue-900">
                  <p className="font-medium">Scheduling with break</p>
                  <p className="mt-1 text-blue-700">
                    Your {cart[0].service.name} starts at the selected time, then there&apos;s a {BETWEEN_SERVICE_BUFFER_MINUTES}-minute break before {cart[1].service.name} begins. Total block: {totalDuration + BETWEEN_SERVICE_BUFFER_MINUTES * (cart.length - 1)} min.
                  </p>
                </div>
              )}
              {slotWarning && <p className="text-sm font-medium text-rose-700">{slotWarning}</p>}
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
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}{" "}
                    at {selectedTime}
                  </span>
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  Was:{" "}
                  {new Date(reschedulePick.appointment_date + "T12:00:00").toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  at {reschedulePick.start_time}
                </p>
              </div>
              <Button
                type="button"
                onClick={() => void submitReschedule()}
                disabled={isSubmitting || !phone || !isValidPhoneNumber(phone)}
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

          {step === 4 && bookingResults.length === 0 && bookingFlow === "new" && (
            <div className="animate-fade-in-up space-y-3">
              <h2 className="text-lg font-semibold">Your details</h2>
              <p className="text-sm text-slate-600">
                Cell number is required. Email is optional (used for confirmation if you have one). Enter your cell
                number first—we&apos;ll look up your info if you&apos;ve visited before.
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
              <Button
                type="button"
                onClick={() => void submitBooking()}
                disabled={isSubmitting}
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
          )}

          {/* ─── STEP 4: Confirmation ─── */}
          {step === 4 && bookingResults.length > 0 && (
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
                          {new Date(result.appointment_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })} at {result.start_time}
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
                        <Link href="/kiosk" className="font-medium underline">Check in at the kiosk</Link> with your cell number
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
                (step === 4 && bookingResults.length > 0)
              }
              className="h-auto rounded-xl px-4 py-2.5 text-sm font-semibold"
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (step === 1 && bookingFlow === "new" && cart.length > 0 && !selectedCategory && !addingAnother) {
                  proceedFromStep1();
                } else if (step < 4) {
                  setStep((step + 1) as Step);
                }
              }}
              disabled={
                step === 4 ||
                bookingResults.length > 0 ||
                (step === 1 && bookingFlow === "new" && cart.length === 0) ||
                (step === 1 && bookingFlow === "reschedule")
              }
              className="h-auto rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:bg-foreground/90"
            >
              Next
            </Button>
          </div>
        </section>

        {/* ─── Sidebar: Booking summary ─── */}
        <aside className="space-y-4 lg:pt-1">
          <div className="rounded-2xl border border-border/90 bg-card p-5 shadow-sm ring-1 ring-slate-100/80">
            <h3 className="text-lg font-bold tracking-tight text-foreground">
              {bookingFlow === "reschedule" ? "Reschedule summary" : "Booking summary"}
            </h3>

            <div className="mt-4 rounded-xl border border-border/80 bg-muted/40 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Appointment date & time</p>
              <p className="font-semibold text-foreground">
                {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} at {selectedTime}
              </p>
            </div>

            {cart.length === 0 && !(bookingFlow === "reschedule" && reschedulePick) && (
              <div className="mt-4 rounded-xl border border-border/80 bg-background p-4">
                <p className="text-sm text-muted-foreground">No services selected yet. Choose a service in Step 1.</p>
              </div>
            )}

            {/* Visual timeline for multi-service, or simple card for single */}
            {cart.length > 1 ? (
              <div className="mt-4 rounded-xl border border-border/80 bg-background p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your visit timeline</p>
                <div className="relative ml-3 border-l-2 border-[#16a349]/30 pl-5">
                  {cartSchedule.map((item, idx) => (
                    <div key={item.service.id}>
                      <div className="relative pb-4">
                        <div className="absolute -left-[27px] top-0.5 h-3 w-3 rounded-full border-2 border-[#16a349] bg-white" />
                        <p className="text-xs font-bold text-[#16a349]">{item.startTime}</p>
                        <p className="mt-0.5 text-sm font-semibold text-slate-900">{item.service.name}</p>
                        <p className="text-xs text-slate-500">{item.service.duration_minutes} min · {formatBookingPrice(item.service.price)}</p>
                        {item.provider && !item.providerSkipped && (
                          <p className="text-xs text-slate-400">with {item.provider.provider_name}</p>
                        )}
                      </div>
                      {idx < cartSchedule.length - 1 && (
                        <div className="relative pb-4">
                          <div className="absolute -left-[25px] top-0.5 h-2 w-2 rounded-full bg-amber-400" />
                          <p className="text-xs font-medium text-amber-600">{item.endTime}</p>
                          <p className="text-[11px] text-amber-500">{BETWEEN_SERVICE_BUFFER_MINUTES}-min break</p>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="relative">
                    <div className="absolute -left-[27px] top-0.5 h-3 w-3 rounded-full border-2 border-slate-400 bg-white" />
                    <p className="text-xs font-bold text-slate-400">{cartSchedule[cartSchedule.length - 1]?.endTime}</p>
                    <p className="text-[11px] text-slate-400">Done</p>
                  </div>
                </div>
              </div>
            ) : (
              cartSchedule.map((item) => (
                <div key={item.service.id} className="mt-4 rounded-xl border border-border/80 bg-background p-4">
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
                        <span className="text-slate-500">Doctor</span>
                        <span className="text-right font-medium text-slate-900">{item.provider.provider_name}</span>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-500">Time</span>
                      <span className="font-medium text-slate-900">{item.startTime}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-500">Price</span>
                      <span className="font-medium text-slate-900">{formatBookingPrice(item.service.price)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}

            <div className="mt-4 rounded-xl border border-[#e9982f]/30 bg-[#e9982f]/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#9a6700]">Total due at visit</p>
              <p className="mt-1 text-3xl font-extrabold text-[#9a6700]">{formatBookingPrice(String(totalPrice))}</p>
              <p className="mt-2 text-xs leading-snug text-[#9a6700]/90">
                Please note payment is due at time of service.
              </p>
              {cart.length > 1 && (
                <p className="mt-1 text-xs text-[#9a6700]">
                  {cart.length} services · {totalDuration} min + {BETWEEN_SERVICE_BUFFER_MINUTES}-min break
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
      </div>
    </main>
  );
}
