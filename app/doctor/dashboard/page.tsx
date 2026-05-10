"use client";

import { useAppFeedback } from "@/components/app-feedback";
import { DoctorEmptyWell, DoctorPageIntro, DoctorSectionLabel, DoctorStatsRow, doctorGreeting } from "@/components/doctor-shell";
import { HelpTip } from "@/components/help-tip";
import { IconStethoscope } from "@/components/icons";
import { Loader } from "@/components/loader";
import { PatientDetailModal } from "@/components/patient-detail-modal";
import { appointmentStatusPillClass } from "@/components/status-chip";
import { SquareTerminalCheckoutPoller } from "@/components/square-terminal-checkout";
import { ApiError, apiGet, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import { PatientBillPortalModal } from "@/components/patient-bill-portal-modal";
import type { PatientBillPayload } from "@/lib/patient-bill-print";
import { formatMonthDayYear } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type SquarePosConfig = {
  pos_callback_configured: boolean;
  has_location: boolean;
  has_application_id: boolean;
};

/** Square Terminal API (hardware) — needs SQUARE_DEVICE_ID on the server. */
type SquareTerminalConfig = {
  location_id: string | null;
  has_location: boolean;
  device_id_configured: boolean;
};

type Appointment = {
  id: number;
  patient: string;
  patient_id: number;
  service: string;
  booked_service_id: number | null;
  service_type?: string;
  /** YYYY-MM-DD — used when rescheduling from this screen. */
  appointment_date: string;
  /** e.g. "09:30:00" — send to the API when changing start time. */
  start_time_iso: string;
  start_time: string;
  end_time: string;
  status: string;
  reason_for_visit: string;
  visit_id?: number | null;
  /** Persistent note on this appointment; visible to other providers on the patient chart. */
  clinical_handoff_notes?: string;
  /** Set when status is awaiting_payment — use Collect payment to reopen the green banner. */
  invoice_id?: number;
  invoice_number?: string;
  invoice_total?: string;
  card_last4?: string;
  card_brand?: string;
};

type ServiceOpt = {
  id: number;
  name: string;
  price: string;
  billing_code?: string;
  is_active: boolean;
  /** When false, line is documentation / insurance only — excluded from invoice total. */
  charges_patient?: boolean;
};

type BillLine = { service_id: number; quantity: string; unit_price: string };

/** Detects edits after a successful billing save so we can show "Update invoice" again. */
function billingFormFingerprint(
  lines: BillLine[],
  notes: string,
  diagnosis: string,
  professionalDiscount: string,
  professionalDiscountReason: string,
): string {
  const rows = lines
    .filter((l) => l.service_id)
    .map((l) => `${l.service_id}:${l.quantity}:${l.unit_price.trim()}`)
    .sort()
    .join("|");
  return `${rows}#${notes}#${diagnosis}#${professionalDiscount.trim()}#${professionalDiscountReason.trim()}`;
}

function doctorApptWithin24Hours(appt: Appointment): boolean {
  const start = new Date(`${appt.appointment_date}T${appt.start_time_iso}`);
  const ms = start.getTime() - Date.now();
  return ms > 0 && ms < 24 * 60 * 60 * 1000;
}

type CompleteVisitPayment = {
  status: string;
  charged: boolean;
  checkout_url: string | null;
  charge_error: string | null;
  payment_intent_id: string | null;
};

/** Same payload as public booking — active services and which providers offer each. */
type BookingOptionsResponse = {
  services: Array<{
    id: number;
    name: string;
    duration_minutes: number;
    price: string;
    service_type: string;
  }>;
  providers_by_service: Record<string, Array<{ id: number; provider_name: string }>>;
};

type PaymentFollowUp = {
  invoice_id: number;
  invoice_number?: string;
  total_amount?: string;
  patient_credit_balance?: string;
  payment: CompleteVisitPayment;
};

export default function DoctorDashboardPage() {
  const { runWithFeedback, toast } = useAppFeedback();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<ServiceOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [activeAppt, setActiveAppt] = useState<Appointment | null>(null);
  const [doctorNotes, setDoctorNotes] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [professionalDiscount, setProfessionalDiscount] = useState("");
  const [professionalDiscountReason, setProfessionalDiscountReason] = useState("");
  const [billLines, setBillLines] = useState<BillLine[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [patientDetailId, setPatientDetailId] = useState<number | null>(null);
  /** After "Complete visit", doctor confirms amount with patient and picks payment path. */
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [paymentFollowUp, setPaymentFollowUp] = useState<PaymentFollowUp | null>(null);
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [applyingCredit, setApplyingCredit] = useState(false);
  /** Square Terminal API checkout id — we poll until the physical device completes payment. */
  const [squareCheckoutId, setSquareCheckoutId] = useState<string | null>(null);
  /** Square Point of Sale app (Stand + reader) — separate from Square Terminal API. */
  const [squarePosConfig, setSquarePosConfig] = useState<SquarePosConfig | null>(null);
  const [squareTerminalConfig, setSquareTerminalConfig] = useState<SquareTerminalConfig | null>(null);
  const [posLaunchBusy, setPosLaunchBusy] = useState(false);
  const [displayName, setDisplayName] = useState("");
  /** Saved on the appointment row for handoff / next doctor (separate from visit-only notes). */
  const [handoffNotes, setHandoffNotes] = useState("");
  const [savingHandoff, setSavingHandoff] = useState(false);
  /** Simple modal to move a visit to another date/time (only before the visit is in progress). */
  const [rescheduleAppt, setRescheduleAppt] = useState<Appointment | null>(null);
  const [resDate, setResDate] = useState("");
  /** Slot values from the API (HH:MM:SS), aligned with `resSlotLabels`. */
  const [resSlotTimes, setResSlotTimes] = useState<string[]>([]);
  const [resSlotLabels, setResSlotLabels] = useState<string[]>([]);
  const [resSelectedSlot, setResSelectedSlot] = useState("");
  const [resSlotsLoading, setResSlotsLoading] = useState(false);
  /** Book a new future visit after a completed appointment (same availability rules as online booking). */
  const [bookNextAppt, setBookNextAppt] = useState<Appointment | null>(null);
  const [bookingOptions, setBookingOptions] = useState<BookingOptionsResponse | null>(null);
  const [bookNextOptionsLoading, setBookNextOptionsLoading] = useState(false);
  const [bnServiceId, setBnServiceId] = useState(0);
  const [bnProviderId, setBnProviderId] = useState(0);
  const [bnDate, setBnDate] = useState("");
  const [bnSlotTimes, setBnSlotTimes] = useState<string[]>([]);
  const [bnSlotLabels, setBnSlotLabels] = useState<string[]>([]);
  const [bnSelectedSlot, setBnSelectedSlot] = useState("");
  const [bnSlotsLoading, setBnSlotsLoading] = useState(false);
  const [savingBookNext, setSavingBookNext] = useState(false);
  const [myProviderId, setMyProviderId] = useState<number | null>(null);
  const [savingDesk, setSavingDesk] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [billSearchQuery, setBillSearchQuery] = useState("");
  const [billSearchResults, setBillSearchResults] = useState<Array<{
    invoice_id: number;
    invoice_number: string;
    patient_name: string;
    date_of_service: string;
    total_amount: string;
    status: string;
  }> | null>(null);
  const [billSearchLoading, setBillSearchLoading] = useState(false);
  /** When true, consultation form opens as a large centered panel over the schedule. */
  const [consultWorkspaceExpanded, setConsultWorkspaceExpanded] = useState(true);
  /** Remembers the last in-consultation visit the doctor closed, so Resume can prioritize it. */
  const [lastClosedConsultAppointmentId, setLastClosedConsultAppointmentId] = useState<number | null>(null);
  /** Awaiting-payment visits: doctor is editing billing lines (Edit billing). */
  const [revisingBillingForAppointmentId, setRevisingBillingForAppointmentId] = useState<number | null>(null);
  /** After "Update invoice" succeeds — stay open until doctor taps Close (or edits again for another save). */
  const [billingEditJustSaved, setBillingEditJustSaved] = useState(false);
  const billingEditSavedFingerprintRef = useRef<string | null>(null);
  const [consultPortalReady, setConsultPortalReady] = useState(false);

  useEffect(() => {
    setConsultPortalReady(true);
  }, []);

  useEffect(() => {
    setRevisingBillingForAppointmentId(null);
    setBillingEditJustSaved(false);
    billingEditSavedFingerprintRef.current = null;
  }, [selectedDate]);

  useEffect(() => {
    if (!billingEditJustSaved) return;
    const saved = billingEditSavedFingerprintRef.current;
    if (saved === null) return;
    const cur = billingFormFingerprint(
      billLines,
      doctorNotes,
      diagnosis,
      professionalDiscount,
      professionalDiscountReason,
    );
    if (cur !== saved) {
      setBillingEditJustSaved(false);
      billingEditSavedFingerprintRef.current = null;
    }
  }, [billingEditJustSaved, billLines, doctorNotes, diagnosis, professionalDiscount, professionalDiscountReason]);

  useEffect(() => {
    if (!activeAppt) setPaymentConfirmOpen(false);
  }, [activeAppt]);

  /** Full-screen consult is portaled to document.body — lock page scroll while it is open. */
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!activeAppt || !consultWorkspaceExpanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [activeAppt, consultWorkspaceExpanded]);

  /** Allow quick keyboard escape from full-screen consult workspace. */
  useEffect(() => {
    if (!activeAppt || !consultWorkspaceExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPaymentConfirmOpen(false);
        setConsultWorkspaceExpanded(false);
        setLastClosedConsultAppointmentId(activeAppt.id);
        setActiveAppt(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeAppt, consultWorkspaceExpanded]);

  useEffect(() => {
    setConsultWorkspaceExpanded(true);
  }, [activeAppt?.id]);

  useEffect(() => {
    setDisplayName(localStorage.getItem("chiroflow_user_name") || "");
  }, []);

  useEffect(() => {
    void apiGetAuth<{ provider_id: number }>("/doctor/me/")
      .then((r) => setMyProviderId(r.provider_id))
      .catch(() => setMyProviderId(null));
  }, []);

  useEffect(() => {
    if (!paymentFollowUp?.invoice_id) {
      setSquarePosConfig(null);
      setSquareTerminalConfig(null);
      return;
    }
    let cancelled = false;
    void Promise.all([
      apiGetAuth<SquarePosConfig>("/doctor/square_pos_config/").catch(() => ({
        pos_callback_configured: false,
        has_location: false,
        has_application_id: false,
      })),
      apiGetAuth<SquareTerminalConfig>("/doctor/square_terminal_config/").catch(() => ({
        location_id: null,
        has_location: false,
        device_id_configured: false,
      })),
    ]).then(([pos, term]) => {
      if (!cancelled) {
        setSquarePosConfig(pos);
        setSquareTerminalConfig(term);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [paymentFollowUp?.invoice_id]);

  const firstName = displayName.trim().split(/\s+/)[0] || "there";

  const dayStats = useMemo(() => {
    const list = appointments;
    return [
      {
        label: "On your schedule",
        value: list.length,
        help: "All visits assigned to you for the day you picked—not only people who have finished check-in yet.",
      },
      {
        label: "Checked-in",
        value: list.filter((a) => a.status === "checked_in").length,
        tone: "amber" as const,
        help: "Check-in completed at the kiosk, front desk, or by you. Tap Start visit on their row when you are ready to see them.",
      },
      {
        label: "In consultation",
        value: list.filter((a) => a.status === "in_consultation").length,
        tone: "accent" as const,
        help: "You started the visit; a large chart-and-bill workspace opens automatically (you can dock it to the narrow side panel if you prefer).",
      },
      {
        label: "Finished today",
        value: list.filter((a) => ["completed", "awaiting_payment"].includes(a.status)).length,
        help: "Visit is wrapped up or waiting on payment. Awaiting payment still counts as needing checkout at the desk.",
      },
    ];
  }, [appointments]);

  const resumableConsultationAppt = useMemo(() => {
    const inConsult = appointments.filter((a) => a.status === "in_consultation");
    if (inConsult.length === 0) return null;
    if (lastClosedConsultAppointmentId != null) {
      const last = inConsult.find((a) => a.id === lastClosedConsultAppointmentId);
      if (last) return last;
    }
    return inConsult[0];
  }, [appointments, lastClosedConsultAppointmentId]);

  const load = async (opts?: { focusAppointmentId?: number; skipReconnectBillingEdit?: boolean }) => {
    setLoading(true);
    setError("");
    try {
      const appts = await apiGetAuth<Appointment[]>(`/doctor/appointments/?date=${selectedDate}`);
      setAppointments(appts);
      const pickActive = () => {
        const fid = opts?.focusAppointmentId;
        if (fid != null) {
          const focused = appts.find((a) => a.id === fid && a.status === "in_consultation");
          if (focused) return focused;
        }
        const revisingId = opts?.skipReconnectBillingEdit ? null : revisingBillingForAppointmentId;
        if (revisingId != null) {
          const rev = appts.find((a) => a.id === revisingId && a.status === "awaiting_payment");
          if (rev) return rev;
        }
        // Do not auto-pop consultation on dashboard return; doctor chooses when to resume.
        return null;
      };
      setActiveAppt(pickActive());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load.");
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  };

  /** Return from Square POS app after tap-to-pay on reader (query square_pos=…). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sp = params.get("square_pos");
    if (!sp) return;
    if (sp === "ok") {
      toast.success("Payment completed in Square POS.");
      window.history.replaceState({}, "", "/doctor/dashboard");
      window.location.reload();
      return;
    } else if (sp === "err") {
      const reason = params.get("reason") || "unknown";
      toast.error(
        reason === "payment_canceled" || reason === "TRANSACTION_CANCELED"
          ? "Payment was canceled in Square POS."
          : "Square POS payment did not finish. Try again or use another payment option.",
      );
    }
    window.history.replaceState({}, "", "/doctor/dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount for URL cleanup; success path reloads
  }, []);

  useEffect(() => {
    load();
  }, [selectedDate]);

  useEffect(() => {
    apiGetAuth<ServiceOpt[]>(`/services/?for_date=${encodeURIComponent(selectedDate)}`)
      .then((list) => setServices(list.filter((s) => s.is_active)))
      .catch(() => setServices([]));
  }, [selectedDate]);

  useEffect(() => {
    if (!activeAppt?.id) return;
    if (revisingBillingForAppointmentId === activeAppt.id) {
      return;
    }
    setDoctorNotes("");
    setProfessionalDiscount("");
    setProfessionalDiscountReason("");
  }, [activeAppt?.id, activeAppt?.status, revisingBillingForAppointmentId]);

  useEffect(() => {
    if (!activeAppt) {
      setBillLines([]);
      setDiagnosis("");
      setProfessionalDiscount("");
      setProfessionalDiscountReason("");
      setHandoffNotes("");
      return;
    }
    if (revisingBillingForAppointmentId === activeAppt.id) {
      setHandoffNotes(activeAppt.clinical_handoff_notes ?? "");
      return;
    }
    setHandoffNotes(activeAppt.clinical_handoff_notes ?? "");
    if (!activeAppt.booked_service_id) {
      setBillLines([]);
      setDiagnosis("");
      setProfessionalDiscount("");
      setProfessionalDiscountReason("");
      return;
    }
    setBillLines([{ service_id: activeAppt.booked_service_id, quantity: "1", unit_price: "" }]);
    setDiagnosis("");
    setProfessionalDiscount("");
    setProfessionalDiscountReason("");
  }, [
    activeAppt?.id,
    activeAppt?.booked_service_id,
    activeAppt?.clinical_handoff_notes,
    activeAppt?.status,
    revisingBillingForAppointmentId,
  ]);

  useEffect(() => {
    if (!rescheduleAppt) return;
    setResDate(rescheduleAppt.appointment_date || selectedDate);
  }, [rescheduleAppt?.id, rescheduleAppt?.appointment_date, selectedDate]);

  /** Load real openings for the reschedule flow (same rules as public booking; excludes the current row). */
  useEffect(() => {
    if (!rescheduleAppt || !resDate || !myProviderId || !rescheduleAppt.booked_service_id) {
      setResSlotLabels([]);
      setResSlotTimes([]);
      setResSelectedSlot("");
      return;
    }
    let cancelled = false;
    void (async () => {
      setResSlotsLoading(true);
      try {
        const q = new URLSearchParams({
          date: resDate,
          provider_id: String(myProviderId),
          service_id: String(rescheduleAppt.booked_service_id),
          exclude_appointment_id: String(rescheduleAppt.id),
        });
        const data = await apiGetAuth<{ available_slots: string[]; slot_start_times?: string[] }>(
          `/booking-options/availability/?${q.toString()}`,
        );
        if (cancelled) return;
        const labels = data.available_slots || [];
        const times = data.slot_start_times || [];
        setResSlotLabels(labels);
        setResSlotTimes(times.length ? times : labels.map(() => ""));
        const iso = rescheduleAppt.start_time_iso || "";
        let pick = times[0] || "";
        const idx = times.findIndex((t) => t === iso || t.startsWith(iso.slice(0, 5)));
        if (idx >= 0) pick = times[idx];
        setResSelectedSlot(pick);
      } catch {
        if (!cancelled) {
          setResSlotLabels([]);
          setResSlotTimes([]);
          setResSelectedSlot("");
        }
      } finally {
        if (!cancelled) setResSlotsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rescheduleAppt?.id, rescheduleAppt?.booked_service_id, rescheduleAppt?.start_time_iso, resDate, myProviderId]);

  /** Load openings for book-next when service, provider, or date changes. */
  useEffect(() => {
    if (!bookNextAppt || !bnDate || !bnServiceId || !bnProviderId) {
      setBnSlotLabels([]);
      setBnSlotTimes([]);
      setBnSelectedSlot("");
      return;
    }
    let cancelled = false;
    void (async () => {
      setBnSlotsLoading(true);
      try {
        const q = new URLSearchParams({
          date: bnDate,
          provider_id: String(bnProviderId),
          service_id: String(bnServiceId),
        });
        const data = await apiGetAuth<{ available_slots: string[]; slot_start_times?: string[] }>(
          `/booking-options/availability/?${q.toString()}`,
        );
        if (cancelled) return;
        const labels = data.available_slots || [];
        const times = data.slot_start_times || [];
        setBnSlotLabels(labels);
        setBnSlotTimes(times.length ? times : labels.map(() => ""));
        setBnSelectedSlot(times[0] || "");
      } catch {
        if (!cancelled) {
          setBnSlotLabels([]);
          setBnSlotTimes([]);
          setBnSelectedSlot("");
        }
      } finally {
        if (!cancelled) setBnSlotsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookNextAppt?.id, bnDate, bnServiceId, bnProviderId]);

  const saveHandoffNote = async () => {
    if (!activeAppt) return;
    setSavingHandoff(true);
    try {
      await runWithFeedback(
        async () => {
          await apiPatch("/doctor/appointment_handoff/", {
            appointment_id: activeAppt.id,
            clinical_handoff_notes: handoffNotes,
          });
          await load({ focusAppointmentId: activeAppt.id });
        },
        {
          loadingMessage: "Saving chart note…",
          successMessage: "Chart note saved — other providers can see it on this patient’s history.",
          errorFallback: "Could not save chart note.",
        },
      );
    } finally {
      setSavingHandoff(false);
    }
  };

  const startVisit = async (appt: Appointment) => {
    setRevisingBillingForAppointmentId(null);
    setBillingEditJustSaved(false);
    billingEditSavedFingerprintRef.current = null;
    setIsStarting(true);
    setError("");
    await runWithFeedback(
      async () => {
        await apiPost(`/doctor/${appt.id}/start_visit/`, {});
        await load({ focusAppointmentId: appt.id });
      },
      {
        loadingMessage: "Starting visit…",
        successMessage: "Visit started — chart and billing are open.",
        errorFallback: "Could not start this visit.",
      },
    );
    setIsStarting(false);
  };

  const openBillingForEdit = async (appt: Appointment) => {
    await runWithFeedback(
      async () => {
        const data = await apiGetAuth<{
          doctor_notes: string;
          diagnosis: string;
          rendered_services: Array<{ service_id: number; quantity: number; unit_price: string }>;
          invoice_id: number;
          invoice_number: string;
          discount?: string;
          professional_discount_reason?: string;
          total_amount: string;
        }>(`/doctor/${appt.id}/billing_for_edit/`);
        if (!data.rendered_services?.length) {
          throw new Error("No billing lines on file — contact support if this looks wrong.");
        }
        setBillingEditJustSaved(false);
        billingEditSavedFingerprintRef.current = null;
        setRevisingBillingForAppointmentId(appt.id);
        setConsultWorkspaceExpanded(true);
        setActiveAppt(appt);
        setDoctorNotes(data.doctor_notes ?? "");
        setDiagnosis(data.diagnosis ?? "");
        setProfessionalDiscount(data.discount ?? "");
        setProfessionalDiscountReason(data.professional_discount_reason ?? "");
        setBillLines(
          data.rendered_services.map((r) => ({
            service_id: r.service_id,
            quantity: String(r.quantity),
            unit_price: r.unit_price?.trim() ? r.unit_price : "",
          })),
        );
      },
      {
        loadingMessage: "Loading current billing…",
        successMessage: "Adjust procedures below, then save to update the invoice.",
        errorFallback: "Could not open billing for editing.",
      },
    );
  };

  const cancelBillingEdit = () => {
    setRevisingBillingForAppointmentId(null);
    setBillingEditJustSaved(false);
    billingEditSavedFingerprintRef.current = null;
    setActiveAppt(null);
    setConsultWorkspaceExpanded(false);
    setDoctorNotes("");
    setDiagnosis("");
    setProfessionalDiscount("");
    setProfessionalDiscountReason("");
    setBillLines([]);
    void load({ skipReconnectBillingEdit: true });
  };

  const doCompleteVisit = async (
    shouldChargeSavedCard: boolean,
    options?: { autoTerminal?: boolean },
  ) => {
    if (!activeAppt) return;
    const rendered = billLines
      .filter((l) => l.service_id)
      .map((l) => {
        const q = Math.max(1, parseInt(l.quantity, 10) || 1);
        const row: { service_id: number; quantity: number; unit_price?: string } = {
          service_id: l.service_id,
          quantity: q,
        };
        if (l.unit_price.trim()) row.unit_price = l.unit_price.trim();
        return row;
      });
    if (rendered.length === 0) {
      toast.error("Add at least one service line for this visit (adjust or add rows below).");
      return;
    }
    const apptId = activeAppt.id;
    /** Explicit "Edit billing" session — always call revise endpoint so we never hit complete_visit by mistake. */
    const isRevisingAwaitingPayment =
      revisingBillingForAppointmentId != null && revisingBillingForAppointmentId === apptId;
    setPaymentConfirmOpen(false);
    setIsCompleting(true);
    setError("");
    const feedbackResult = await runWithFeedback(
      async () => {
        const endpoint = isRevisingAwaitingPayment
          ? `/doctor/${apptId}/revise_visit_billing/`
          : `/doctor/${apptId}/complete_visit/`;
        const result = await apiPost<{
          invoice_id: number;
          invoice_number: string;
          total_amount: string;
          patient_credit_balance?: string;
          payment: CompleteVisitPayment;
        }>(endpoint, {
          doctor_notes: doctorNotes,
          diagnosis,
          rendered_services: rendered,
          professional_discount: professionalDiscount.trim() || "0",
          professional_discount_reason: professionalDiscountReason.trim(),
          charge_saved_card_if_present: shouldChargeSavedCard,
        });
        if (result.payment.charged) {
          await tryOpenPatientBill(result.invoice_id, { maxAttempts: 3 });
        }
        setPaymentFollowUp({
          invoice_id: result.invoice_id,
          invoice_number: result.invoice_number,
          total_amount: result.total_amount,
          patient_credit_balance: result.patient_credit_balance,
          payment: result.payment,
        });
        setSquareCheckoutId(null);

        if (isRevisingAwaitingPayment) {
          billingEditSavedFingerprintRef.current = billingFormFingerprint(
            billLines,
            doctorNotes,
            diagnosis,
            professionalDiscount,
            professionalDiscountReason,
          );
          await load();
          if (options?.autoTerminal && !result.payment.charged && result.invoice_id) {
            try {
              await createTerminalCheckout(result.invoice_id);
            } catch (err) {
              toast.error(
                err instanceof ApiError
                  ? err.message
                  : "Invoice saved — use Square Terminal from the green payment banner.",
              );
            }
          }
          return result;
        }

        setRevisingBillingForAppointmentId(null);
        setBillingEditJustSaved(false);
        billingEditSavedFingerprintRef.current = null;
        setActiveAppt(null);
        setConsultWorkspaceExpanded(false);
        setDoctorNotes("");
        setDiagnosis("");
        setProfessionalDiscount("");
        setProfessionalDiscountReason("");
        setBillLines([]);
        await load({ skipReconnectBillingEdit: true });
        if (options?.autoTerminal && !result.payment.charged && result.invoice_id) {
          try {
            await createTerminalCheckout(result.invoice_id);
          } catch (err) {
            toast.error(
              err instanceof ApiError
                ? err.message
                : "Invoice saved — use Square Terminal from the green payment banner.",
            );
          }
        }
        return result;
      },
      {
        loadingMessage: isRevisingAwaitingPayment
          ? "Updating invoice…"
          : "Completing visit and creating invoice…",
        successMessage: (r) =>
          isRevisingAwaitingPayment
            ? ""
            : r?.payment?.charged
              ? "Visit completed — payment received; patient bill opened for printing."
              : "Visit completed — collect payment, then tap Print patient bill.",
        errorFallback: isRevisingAwaitingPayment
          ? "Could not update billing."
          : "Could not complete this visit.",
      },
    );
    setIsCompleting(false);
    if (feedbackResult !== undefined && isRevisingAwaitingPayment) {
      toast.success("Bill saved");
      window.setTimeout(() => {
        cancelBillingEdit();
      }, 1500);
    }
  };

  const completeVisit = async () => {
    if (!activeAppt) return;
    if (billingEditJustSaved) {
      toast.info("This invoice is already saved. Tap Close below to return to the schedule, or change a line to update again.");
      return;
    }
    if (billLines.filter((l) => l.service_id).length === 0) {
      toast.error("Add at least one service line for this visit (adjust or add rows below).");
      return;
    }
    const isRevisingAwaitingPayment =
      revisingBillingForAppointmentId != null && revisingBillingForAppointmentId === activeAppt.id;
    if (isRevisingAwaitingPayment) {
      // In explicit edit mode, doctors already chose to update this invoice; submit immediately.
      await doCompleteVisit(false);
      return;
    }
    // One-click finish: complete now, then collect payment from the green banner.
    await doCompleteVisit(false);
  };

  const closeConsultWorkspace = () => {
    setPaymentConfirmOpen(false);
    setConsultWorkspaceExpanded(false);
    if (activeAppt?.status === "in_consultation") {
      setLastClosedConsultAppointmentId(activeAppt.id);
    }
    setActiveAppt(null);
  };

  const checkInPatient = async (appt: Appointment) => {
    setIsCheckingIn(true);
    await runWithFeedback(
      async () => {
        await apiPost("/kiosk/checkin/", { appointment_id: appt.id });
        await load();
      },
      {
        loadingMessage: "Completing check-in…",
        successMessage: `${appt.patient} — check-in complete. You can start the visit now.`,
        errorFallback: "Could not complete check-in for this patient.",
      },
    );
    setIsCheckingIn(false);
  };

  const searchBills = async () => {
    if (!billSearchQuery.trim()) return;
    setBillSearchLoading(true);
    try {
      const results = await apiGetAuth<Array<{
        invoice_id: number;
        invoice_number: string;
        patient_name: string;
        date_of_service: string;
        total_amount: string;
        status: string;
      }>>(`/doctor/invoice_search/?q=${encodeURIComponent(billSearchQuery.trim())}`);
      setBillSearchResults(results);
    } catch {
      toast.error("Could not search invoices.");
      setBillSearchResults([]);
    } finally {
      setBillSearchLoading(false);
    }
  };

  const createTerminalCheckout = async (invoiceId: number) => {
    const out = await apiPost<{ checkout_id: string; status: string }>("/doctor/terminal_checkout/", {
      invoice_id: invoiceId,
    });
    setSquareCheckoutId(out.checkout_id);
    return out.checkout_id;
  };

  const prepareTerminalPayment = async () => {
    if (!paymentFollowUp) return;
    setTerminalBusy(true);
    setError("");
    await runWithFeedback(
      async () => {
        await createTerminalCheckout(paymentFollowUp.invoice_id);
      },
      {
        loadingMessage: "Preparing card reader…",
        successMessage: "Reader ready — follow the prompts on the terminal.",
        errorFallback: "Could not start terminal payment.",
      },
    );
    setTerminalBusy(false);
  };

  const applyPatientCredit = async () => {
    if (!paymentFollowUp) return;
    setApplyingCredit(true);
    await runWithFeedback(
      async () => {
        const out = await apiPost<{
          invoice_id: number;
          invoice_number: string;
          applied_credit: string;
          remaining_due: string;
          patient_credit_balance: string;
          invoice_status: string;
          already_paid: boolean;
        }>(`/invoices/${paymentFollowUp.invoice_id}/apply_credit/`, {});

        setPaymentFollowUp((prev) =>
          prev
            ? {
                ...prev,
                invoice_number: out.invoice_number,
                total_amount: out.remaining_due,
                patient_credit_balance: out.patient_credit_balance,
                payment: {
                  ...prev.payment,
                  charged: out.already_paid,
                  status: out.already_paid ? "paid_by_credit" : prev.payment.status,
                },
              }
            : prev,
        );
        if (out.already_paid) {
          await tryOpenPatientBill(out.invoice_id, { maxAttempts: 3, quiet: true });
          await load();
        }
        return out;
      },
      {
        loadingMessage: "Applying patient credit…",
        successMessage: (o) =>
          o?.already_paid
            ? `Credit covered the full balance ($${o.applied_credit}).`
            : `Applied $${o?.applied_credit || "0"} credit. Remaining due: $${o?.remaining_due || "0"}.`,
        errorFallback: "Could not apply patient credit.",
      },
    );
    setApplyingCredit(false);
  };

  /** Opens Square Point of Sale on iPad/Android — patient taps card on Stand + reader. */
  const prepareSquarePosPayment = async () => {
    if (!paymentFollowUp) return;
    setPosLaunchBusy(true);
    setError("");
    await runWithFeedback(
      async () => {
        const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
        const isLikelyTabletPos =
          /iPad|iPhone|iPod|Android/i.test(ua) ||
          (typeof navigator !== "undefined" &&
            navigator.platform === "MacIntel" &&
            (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints > 1);
        if (!isLikelyTabletPos) {
          toast.info(
            "Square POS is meant for iPad/Android with the Square Point of Sale app. On a desktop browser it often does nothing. For the desk card reader, use “Square Terminal device” instead.",
          );
        }
        const out = await apiGetAuth<{ ios_url: string; android_intent_url: string }>(
          `/doctor/square_pos_launch/?invoice_id=${paymentFollowUp.invoice_id}`,
        );
        const isAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
        window.location.href = isAndroid ? out.android_intent_url : out.ios_url;
      },
      {
        loadingMessage: "Opening Square POS…",
        successMessage: "Complete payment on the reader, then return here.",
        errorFallback: "Could not start Square POS checkout. Check SQUARE_POS_CALLBACK_URL on the server.",
      },
    );
    setPosLaunchBusy(false);
  };

  const sortedBillServices = useMemo(() => {
    const bookedId = activeAppt?.booked_service_id ?? null;
    return [...services].sort((a, b) => {
      if (bookedId != null) {
        if (a.id === bookedId && b.id !== bookedId) return -1;
        if (b.id === bookedId && a.id !== bookedId) return 1;
      }
      const ca = (a.billing_code || "").toLowerCase();
      const cb = (b.billing_code || "").toLowerCase();
      if (ca !== cb) return ca.localeCompare(cb);
      return a.name.localeCompare(b.name);
    });
  }, [services, activeAppt?.booked_service_id]);

  /** Estimated subtotal for checked bill lines (same base math as server). */
  const consultationEstimatedSubtotal = useMemo(() => {
    let total = 0;
    let hasLine = false;
    for (const line of billLines) {
      const svc = services.find((s) => s.id === line.service_id);
      if (!svc) continue;
      if (svc.charges_patient === false) continue;
      hasLine = true;
      const q = Math.max(1, parseInt(line.quantity, 10) || 1);
      const raw = line.unit_price.trim();
      const unit = raw ? parseFloat(raw) : parseFloat(svc.price);
      if (Number.isNaN(unit)) continue;
      total += unit * q;
    }
    if (!hasLine) return null;
    return total;
  }, [billLines, services]);

  const consultationDiscountAmount = useMemo(() => {
    const raw = professionalDiscount.trim();
    if (!raw) return 0;
    const n = parseFloat(raw);
    if (Number.isNaN(n) || n < 0) return 0;
    if (consultationEstimatedSubtotal == null) return 0;
    return Math.min(n, consultationEstimatedSubtotal);
  }, [professionalDiscount, consultationEstimatedSubtotal]);

  const consultationEstimatedTotal = useMemo(() => {
    if (consultationEstimatedSubtotal == null) return null;
    return Math.max(0, consultationEstimatedSubtotal - consultationDiscountAmount);
  }, [consultationEstimatedSubtotal, consultationDiscountAmount]);

  const [printingBill, setPrintingBill] = useState(false);
  const [previewingBill, setPreviewingBill] = useState(false);
  const [patientBillModal, setPatientBillModal] = useState<PatientBillPayload | null>(null);

  /** Preview bill layout while invoice is still unpaid (?preview=1 on the API). */
  const openPatientBillPreview = async (invoiceId: number) => {
    setPreviewingBill(true);
    try {
      const bill = await apiGetAuth<PatientBillPayload>(
        `/doctor/invoice_bill/?invoice_id=${invoiceId}&preview=1`,
        { cache: "no-store" },
      );
      setPatientBillModal(bill);
      toast.success("Preview opened — use Print above or Esc to close.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not load bill preview.");
    } finally {
      setPreviewingBill(false);
    }
  };

  /** Fetches print-ready bill only when the invoice is PAID (server enforces this). */
  const tryOpenPatientBill = async (invoiceId: number, opts?: { maxAttempts?: number; quiet?: boolean }) => {
    const max = opts?.maxAttempts ?? 1;
    setPrintingBill(true);
    try {
      for (let i = 0; i < max; i++) {
        try {
          const st = await apiGetAuth<{ paid: boolean }>(`/doctor/invoice_payment_status/?invoice_id=${invoiceId}`);
          if (st.paid) {
            const bill = await apiGetAuth<PatientBillPayload>(`/doctor/invoice_bill/?invoice_id=${invoiceId}`, {
              cache: "no-store",
            });
            setPatientBillModal(bill);
            if (!opts?.quiet) toast.success("Patient bill opened for printing.");
            return true;
          }
        } catch {
          /* retry — webhook may still be marking paid */
        }
        if (i < max - 1) await new Promise((r) => setTimeout(r, 900));
      }
      toast.error(
        "Patient bill is only available after payment is complete. If you just charged a card, wait a few seconds and tap Print patient bill again.",
      );
      return false;
    } finally {
      setPrintingBill(false);
    }
  };

  /** Bring back payment links / terminal after you dismissed the banner or left the page. */
  const resumePaymentForAppointment = async (appt: Appointment, opts?: { trySavedCard?: boolean }) => {
    await runWithFeedback(
      async () => {
        const out = await apiPost<{
          invoice_id: number;
          invoice_number: string;
          total_amount: string;
          patient_credit_balance?: string;
          already_paid?: boolean;
          payment: CompleteVisitPayment;
        }>("/doctor/prepare_invoice_payment/", {
          appointment_id: appt.id,
          try_saved_card: opts?.trySavedCard ?? false,
        });
        if (out.already_paid && out.payment.charged) {
          await tryOpenPatientBill(out.invoice_id, { maxAttempts: 4, quiet: true });
          await load();
          return out;
        }
        setPaymentFollowUp({
          invoice_id: out.invoice_id,
          invoice_number: out.invoice_number,
          total_amount: out.total_amount,
          patient_credit_balance: out.patient_credit_balance,
          payment: out.payment,
        });
        setSquareCheckoutId(null);
        return out;
      },
      {
        loadingMessage: "Loading payment options…",
        successMessage: (o) =>
          o?.already_paid
            ? "Already paid — refreshed schedule and opened patient bill if ready."
            : "Payment banner is open above — desk checkout, reader, or retry saved card.",
        errorFallback: "Could not load payment options.",
      },
    );
  };

  const toggleBillService = (serviceId: number) => {
    setBillLines((rows) => {
      const has = rows.some((r) => r.service_id === serviceId);
      if (has) return rows.filter((r) => r.service_id !== serviceId);
      return [...rows, { service_id: serviceId, quantity: "1", unit_price: "" }];
    });
  };

  const isBillServiceChecked = (serviceId: number) => billLines.some((r) => r.service_id === serviceId);

  const billLineFor = (serviceId: number) => billLines.find((r) => r.service_id === serviceId);

  const statusDisplay = (s: string) => {
    const map: Record<string, string> = {
      booked: "scheduled",
      checked_in: "checked_in",
      in_consultation: "in_consultation",
      awaiting_payment: "awaiting_payment",
      completed: "completed",
      no_show: "no_show",
      cancelled: "cancelled",
    };
    return (map[s] || s) as
      | "scheduled"
      | "checked_in"
      | "in_consultation"
      | "completed"
      | "awaiting_payment"
      | "no_show"
      | "cancelled";
  };

  const badgeLabel = (s: string) => {
    const map: Record<string, string> = {
      scheduled: "SCHEDULED",
      booked: "SCHEDULED",
      checked_in: "CHECKED IN",
      in_consultation: "IN CONSULTATION",
      completed: "COMPLETED",
      awaiting_payment: "AWAITING PAYMENT",
      no_show: "NO-SHOW",
      cancelled: "CANCELLED",
    };
    return map[s] ?? s.toUpperCase().replaceAll("_", " ");
  };

  /** Before the visit starts, doctors can mark no-show/cancel or reschedule (front desk rules apply for trickier cases). */
  const canDoctorPreVisitDesk = (s: string) => s === "booked" || s === "checked_in";

  const submitReschedule = async () => {
    if (!rescheduleAppt) return;
    setSavingDesk(true);
    try {
      await runWithFeedback(
        async () => {
          await apiPost(`/appointments/${rescheduleAppt.id}/reschedule-by-provider/`, {
            appointment_date: resDate,
            start_time: resSelectedSlot,
          });
          setRescheduleAppt(null);
          await load();
        },
        {
          loadingMessage: "Rescheduling…",
          successMessage: "Appointment rescheduled",
          errorFallback: "Could not reschedule (slot may be taken).",
        },
      );
    } finally {
      setSavingDesk(false);
    }
  };

  /** Load bookable services then open the book-next modal for a completed visit. */
  const openBookNext = (appt: Appointment) => {
    void (async () => {
      setBookNextAppt(appt);
      const initialDate = selectedDate >= todayStr ? selectedDate : todayStr;
      setBnDate(initialDate);
      setBookNextOptionsLoading(true);
      try {
        const opts = await apiGet<BookingOptionsResponse>("/booking-options/");
        setBookingOptions(opts);
        const sid =
          appt.booked_service_id && opts.services.some((s) => s.id === appt.booked_service_id)
            ? appt.booked_service_id
            : opts.services[0]?.id ?? 0;
        setBnServiceId(sid);
        const provs = opts.providers_by_service[String(sid)] ?? [];
        const pid =
          myProviderId != null && provs.some((p) => p.id === myProviderId)
            ? myProviderId
            : provs[0]?.id ?? myProviderId ?? 0;
        setBnProviderId(pid);
      } catch {
        setBookingOptions(null);
        setBnServiceId(0);
        setBnProviderId(0);
      } finally {
        setBookNextOptionsLoading(false);
      }
    })();
  };

  const submitBookNext = async () => {
    if (!bookNextAppt || !bnServiceId || !bnProviderId || !bnDate || !bnSelectedSlot) return;
    setSavingBookNext(true);
    try {
      await runWithFeedback(
        async () => {
          await apiPost(`/appointments/book-by-provider/`, {
            source_appointment_id: bookNextAppt.id,
            service_id: bnServiceId,
            provider_id: bnProviderId,
            appointment_date: bnDate,
            start_time: bnSelectedSlot,
          });
          setBookNextAppt(null);
          setBookingOptions(null);
          await load();
        },
        {
          loadingMessage: "Booking…",
          successMessage: "Next visit booked",
          errorFallback: "Could not book that slot (it may have been taken).",
        },
      );
    } finally {
      setSavingBookNext(false);
    }
  };

  /** Shared consultation UI — `spacious` uses larger fields and scroll area (full workspace overlay). */
  const renderConsultationForm = (spacious: boolean) => {
    if (!activeAppt) return null;
    const isRevisingBilling =
      revisingBillingForAppointmentId != null && revisingBillingForAppointmentId === activeAppt.id;
    const billingEditShowCloseOnly = isRevisingBilling && billingEditJustSaved;
    const handoffClass = spacious
      ? "mb-2 min-h-[5.5rem] w-full rounded-lg border border-slate-200 bg-white p-3 text-base leading-relaxed"
      : "mb-2 h-20 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm";
    const diagnosisClass = spacious
      ? "min-h-[7rem] w-full rounded-lg border border-slate-200 p-3 text-base leading-relaxed"
      : "h-20 w-full rounded-lg border border-slate-200 p-2 text-sm";
    const notesClass = spacious
      ? "min-h-[10rem] w-full rounded-lg border border-slate-200 p-3 text-base leading-relaxed"
      : "h-24 w-full rounded-lg border border-slate-200 p-2 text-sm";
    const procScroller = spacious
      ? "max-h-[min(520px,52vh)] space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:max-h-[min(600px,56vh)]"
      : "max-h-72 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2";

    return (
      <>
        {spacious ? (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#166534]">
                {isRevisingBilling
                  ? billingEditShowCloseOnly
                    ? "Invoice updated — awaiting payment"
                    : "Editing billing — awaiting payment"
                  : "Active visit · full workspace"}
              </p>
              <p className="truncate text-lg font-bold text-slate-900">{activeAppt.patient}</p>
              <p className="text-sm text-slate-600">
                {activeAppt.start_time} – {activeAppt.end_time}
                {activeAppt.service ? ` · ${activeAppt.service}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConsultWorkspaceExpanded(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                Use narrow side panel
              </button>
              <button
                type="button"
                onClick={closeConsultWorkspace}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Close workspace
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConsultWorkspaceExpanded(true)}
            className="mb-3 w-full rounded-xl border-2 border-[#16a349]/35 bg-[#ecfdf5] px-4 py-3 text-sm font-bold text-[#0d5c2e] shadow-sm shadow-emerald-900/5 hover:bg-[#d1fae5]"
          >
            Expand full workspace
          </button>
        )}
        {billingEditShowCloseOnly && (
          <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm leading-snug text-emerald-950">
            <strong>Invoice updated.</strong> Check the green <strong>Collect payment</strong> banner for the new amount.
            <strong> Preview bill</strong> and <strong>Print patient bill</strong> both use this saved version (lines, fees, totals). Tap{" "}
            <strong>Close</strong> at the bottom when you&apos;re done — or change a line above to save again.
          </div>
        )}
        {isRevisingBilling && !billingEditShowCloseOnly && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-sm leading-snug text-amber-950">
            <strong>Editing the invoice</strong> — the visit is done; we&apos;re only waiting on payment.{" "}
            <strong>Add or remove</strong> procedures below (check / uncheck), change units or prices — the estimated total updates live.
            When you tap <strong>Update invoice</strong>, the server recalculates tax and the amount due on the same invoice.
          </div>
        )}
        <div className={cn("flex items-center gap-3 rounded-xl border border-slate-100 bg-gradient-to-r from-slate-50 to-white", spacious ? "p-4" : "p-3")}>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#16a349]/20 text-lg font-bold text-[#16a349]">
            {activeAppt.patient.charAt(0)}
          </div>
          <div>
            <p className="font-semibold text-slate-900">{activeAppt.patient}</p>
            <p className="text-xs text-slate-500">Patient #{activeAppt.patient_id}</p>
          </div>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#166534]">Booked for this visit</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">{activeAppt.service || "—"}</p>
          <p className="mt-1 text-xs text-slate-600">
            {activeAppt.start_time} – {activeAppt.end_time} · The procedure list below includes this visit type first, then your
            role&apos;s billable codes for this calendar day.
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Reason for visit (chart)</p>
          <p className="text-sm text-slate-700">
            {activeAppt.reason_for_visit?.trim()
              ? activeAppt.reason_for_visit
              : "Not recorded yet — add details in Visit notes below or in the patient chart."}
          </p>
        </div>
        <div className="rounded-xl border border-sky-200/70 bg-sky-50/50 p-3">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Chart note for the team</p>
            <HelpTip label="Handoff note" tone="emerald">
              Stays on this appointment in the patient chart. Use it for follow-up reminders, preferences, or anything the next doctor
              should know—even if they see the patient on a different day.
            </HelpTip>
          </div>
          <textarea
            className={handoffClass}
            placeholder="e.g. Plan: recheck ROM next visit; prefers afternoons…"
            value={handoffNotes}
            onChange={(e) => setHandoffNotes(e.target.value)}
          />
          <button
            type="button"
            disabled={savingHandoff}
            onClick={() => void saveHandoffNote()}
            className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-950 shadow-sm hover:bg-sky-100 disabled:opacity-50"
          >
            {savingHandoff ? "Saving…" : "Save chart note"}
          </button>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Diagnosis (for bill)</p>
          <textarea
            className={diagnosisClass}
            placeholder="Clinical / billing diagnosis summary…"
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
          />
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billable procedures (tap to add)</p>
            <HelpTip label="Patient bill lines" tone="emerald">
              You see active services allowed for your role (chiropractic vs massage), plus any visit types booked for you on this
              calendar day so the patient&apos;s scheduled service is never missing. Check each line that applies. Units multiply the
              clinic price; leave fee override blank unless you need a custom amount. Lines flagged as insurance-only (no patient charge)
              still print on the bill for CPT but do not add to the amount due.
            </HelpTip>
          </div>
          <p className="mb-2 text-xs text-slate-500">
            {isRevisingBilling ? (
              <>
                <strong>Extra services or corrections:</strong> uncheck anything you&apos;re removing from the bill; check anything new.
                The green <strong>estimated total</strong> matches what will be saved (same rules as a new visit — insurance-only lines
                don&apos;t add to the patient portion).
              </>
            ) : (
              <>
                The booked visit type is checked first. Add or remove lines for anything else you performed. If something is missing, ask
                admin to mark the service visible to your role in Services &amp; codes.
              </>
            )}
          </p>
          <div className={procScroller}>
            {sortedBillServices.map((s) => {
              const on = isBillServiceChecked(s.id);
              const line = billLineFor(s.id);
              return (
                <div
                  key={s.id}
                  className={cn(
                    "rounded-lg border px-2 py-2 transition-colors",
                    spacious ? "px-3 py-2.5" : "",
                    on ? "border-[#16a349]/40 bg-white shadow-sm" : "border-transparent hover:bg-white/60",
                  )}
                >
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleBillService(s.id)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[#16a349] focus:ring-[#16a349]/40"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="font-mono text-[11px] font-semibold text-slate-500">
                          {s.billing_code?.trim() || "—"}
                        </span>
                        <span className={cn("font-medium text-slate-900", spacious ? "text-base" : "text-sm")}>{s.name}</span>
                        {s.charges_patient === false ? (
                          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-900">
                            Insurance / no charge
                          </span>
                        ) : null}
                        <span className="text-xs tabular-nums text-slate-500">${s.price}</span>
                      </div>
                    </div>
                  </label>
                  {on && line ? (
                    <div className="mt-2 flex flex-wrap items-end gap-3 pl-7">
                      <label className="text-xs text-slate-600">
                        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Units</span>
                        <input
                          type="number"
                          min={1}
                          className={cn(
                            "w-16 rounded border border-slate-200 bg-white p-1.5",
                            spacious ? "text-base" : "text-sm",
                          )}
                          value={line.quantity}
                          onChange={(e) => {
                            const v = e.target.value;
                            setBillLines((rows) =>
                              rows.map((r) => (r.service_id === s.id ? { ...r, quantity: v } : r)),
                            );
                          }}
                        />
                      </label>
                      <label className="min-w-[6rem] flex-1 text-xs text-slate-600">
                        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Fee override
                        </span>
                        <input
                          className={cn(
                            "w-full rounded border border-slate-200 bg-white p-1.5",
                            spacious ? "text-base" : "text-sm",
                          )}
                          placeholder="Auto"
                          value={line.unit_price}
                          onChange={(e) => {
                            const v = e.target.value;
                            setBillLines((rows) =>
                              rows.map((r) => (r.service_id === s.id ? { ...r, unit_price: v } : r)),
                            );
                          }}
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {consultationEstimatedSubtotal != null && (
            <div className="mt-3 space-y-3 rounded-xl border border-[#16a349]/30 bg-[#f0fdf4] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#0d5c2e]">Estimated patient amount</span>
                  <HelpTip label="Estimated total" tone="emerald">
                    Based on checked procedures, units, fee overrides, and professional discount. Insurance-only lines are excluded.
                    {isRevisingBilling
                      ? " After you save, the same discount and amount are applied to the invoice."
                      : " Tax stays zero in this workflow; this should match the saved invoice amount."} The discount is
                    tracked internally for clinic records and payment collection, and is not printed as a separate line on
                    the patient bill.
                  </HelpTip>
                </div>
                <span className="text-lg font-bold tabular-nums text-slate-900">
                  {(consultationEstimatedTotal ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" })}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr),11rem] sm:items-end">
                <div className="text-xs text-slate-600">
                  <p>
                    Subtotal before discount:{" "}
                    <strong className="font-semibold text-slate-900">
                      {consultationEstimatedSubtotal.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                    </strong>
                  </p>
                  <p>
                    Professional discount:{" "}
                    <strong className="font-semibold text-slate-900">
                      {consultationDiscountAmount.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                    </strong>
                  </p>
                </div>
                <label className="text-xs text-slate-700">
                  <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Professional discount ($)
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={cn("w-full rounded border border-slate-200 bg-white p-2", spacious ? "text-base" : "text-sm")}
                    placeholder="0.00"
                    value={professionalDiscount}
                    onChange={(e) => setProfessionalDiscount(e.target.value)}
                  />
                </label>
              </div>
              <label className="block text-xs text-slate-700">
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Discount reason (optional, internal only)
                </span>
                <input
                  className={cn("w-full rounded border border-slate-200 bg-white p-2", spacious ? "text-base" : "text-sm")}
                  placeholder="e.g. Professional courtesy"
                  value={professionalDiscountReason}
                  onChange={(e) => setProfessionalDiscountReason(e.target.value)}
                />
              </label>
            </div>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Visit notes</p>
          <textarea
            className={notesClass}
            placeholder="Clinical notes (not printed on patient bill)…"
            value={doctorNotes}
            onChange={(e) => setDoctorNotes(e.target.value)}
          />
        </div>
        <p className="rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
          {billingEditShowCloseOnly ? (
            <>
              Your changes are saved. Use <strong>Collect payment</strong> or the banner when you&apos;re ready. Leave this screen with{" "}
              <strong>Close</strong> whenever you want — nothing else is required here.
            </>
          ) : isRevisingBilling ? (
            <>
              Next step: <strong>confirm the new amount</strong> with the patient (it may have changed), then save. Use{" "}
              <strong>Collect payment</strong> or the green banner afterwards — if a desk link or reader session was started with the
              old total, start a fresh checkout so it matches the updated invoice.
            </>
          ) : (
            <>
              Next step: click <strong>Complete visit &amp; create invoice</strong>. The visit leaves consultation immediately, then use the
              green banner for card on file, <strong>Square Terminal</strong>, or desk / POS options.
            </>
          )}
        </p>
        <div
          className={cn(
            "flex flex-col gap-2",
            isRevisingBilling ? "sm:flex-row sm:flex-wrap sm:items-start" : "sm:flex-row sm:items-start",
          )}
        >
          {billingEditShowCloseOnly ? (
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start">
              <button
                type="button"
                onClick={() => cancelBillingEdit()}
                className={cn(
                  "w-full rounded-lg bg-[#16a349] px-4 py-2.5 font-semibold text-white hover:bg-[#13823d] sm:w-auto",
                  spacious ? "py-3 text-base" : "text-sm",
                )}
              >
                Close
              </button>
              <HelpTip label="Close billing editor" align="center" tone="emerald">
                Returns to your schedule. The invoice is already updated — use the payment banner or schedule row to collect.
              </HelpTip>
            </div>
          ) : (
            <>
              <div className={cn("flex min-w-0 items-start gap-2", !isRevisingBilling && "flex-1")}>
                <button
                  type="button"
                  onClick={completeVisit}
                  disabled={isCompleting}
                  className={cn(
                    "min-w-0 rounded-lg bg-[#16a349] px-4 py-2.5 font-semibold text-white hover:bg-[#13823d] disabled:opacity-50",
                    isRevisingBilling ? "flex-1 sm:flex-initial sm:min-w-[12rem]" : "flex-1",
                    spacious ? "py-3 text-base" : "text-sm",
                  )}
                >
                  {isRevisingBilling
                    ? isCompleting
                      ? "Saving…"
                      : "Update invoice"
                    : isCompleting
                      ? "Completing…"
                      : "Complete visit & create invoice"}
                </button>
                <HelpTip label={isRevisingBilling ? "Update invoice" : "Complete visit"} align="center" tone="emerald">
                  {isRevisingBilling ? (
                    <>
                      Rewrites the open invoice with the lines and notes below — visit status stays awaiting payment. Then collect using the
                      banner or schedule row.
                    </>
                  ) : (
                    <>
                      Saves the visit and invoice, then you confirm payment with the patient. You can charge a saved card, use the Terminal, or
                      collect another way from the green banner.
                    </>
                  )}
                </HelpTip>
              </div>
              {isRevisingBilling && (
                <button
                  type="button"
                  onClick={cancelBillingEdit}
                  disabled={isCompleting}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel editing
                </button>
              )}
            </>
          )}
        </div>
        <p className="text-xs text-slate-500">
          The patient bill is not printed until the invoice is paid (card on file, reader, or desk checkout). Use{" "}
          <strong>Print patient bill</strong> on the banner after payment.
        </p>
      </>
    );
  };

  const paymentConfirmIsRevise =
    !!activeAppt &&
    paymentConfirmOpen &&
    revisingBillingForAppointmentId != null &&
    revisingBillingForAppointmentId === activeAppt.id;

  return (
    <div className="space-y-8">
      <DoctorPageIntro
        eyebrow="Clinical workspace"
        title={`${doctorGreeting()}, ${firstName}`}
        description="While you add services for an active visit, you will see an estimated total. The printable patient bill opens only after payment is complete. If payment is still pending, you can edit billing from the schedule row."
        pageHelp={
          <>
            This page is your <strong>daily command center</strong>: pick a date, work down the list. When you start a visit, a{" "}
            <strong>large centered workspace</strong> opens for chart notes, diagnosis, procedures, and billing. You can switch to a narrow
            side panel from there if you prefer. Checked procedures show a running <strong>estimated total</strong>. When you complete the
            visit, you can <strong>Preview bill</strong> before payment to show the patient what will print; the official{" "}
            <strong>Print patient bill</strong> runs only after the invoice is marked paid (saved card, reader, or desk checkout). For an
            appointment <strong>awaiting payment</strong>, use <strong>Edit billing</strong> on that row if you need to add a service or fix
            the invoice before collecting. If someone does not show up, use <strong>No-show</strong> or <strong>Cancel</strong>; use{" "}
            <strong>Reschedule</strong> to move a booked visit. After a visit shows <strong>completed</strong>, use{" "}
            <strong>Book next visit</strong> to add a new appointment with the same openings as online booking.
          </>
        }
      >
        {loading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[4.5rem] animate-pulse rounded-2xl bg-slate-100/80" />
            ))}
          </div>
        ) : (
          <DoctorStatsRow stats={dayStats} />
        )}
      </DoctorPageIntro>

      {!activeAppt && resumableConsultationAppt && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-emerald-900">
              You still have an active consultation for <strong>{resumableConsultationAppt.patient}</strong> at{" "}
              <strong>{resumableConsultationAppt.start_time}</strong>.
            </p>
            <button
              type="button"
              onClick={() => {
                setConsultWorkspaceExpanded(true);
                setActiveAppt(resumableConsultationAppt);
              }}
              className="rounded-xl bg-[#16a349] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d]"
            >
              Resume current visit
            </button>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      {paymentFollowUp && (
        <section className="doctor-panel border-[#16a349]/25 bg-gradient-to-br from-[#f0fdf4] via-white to-white shadow-md shadow-emerald-900/5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900">Collect payment before they leave</h3>
                <HelpTip label="Payment banner" tone="emerald">
                  Appears after you complete a visit. It reminds you to collect payment using saved card, card reader, or the desk
                  checkout link—clinic policy is to settle before the patient walks out.
                </HelpTip>
              </div>
              <p className="text-sm text-slate-600">
                Invoice {paymentFollowUp.invoice_number ?? paymentFollowUp.invoice_id}
                {paymentFollowUp.total_amount != null && ` · $${paymentFollowUp.total_amount}`}
              </p>
              {paymentFollowUp.patient_credit_balance != null && (
                <p className="mt-1 text-sm text-slate-600">
                  Patient credit available: <span className="font-semibold">${paymentFollowUp.patient_credit_balance}</span>
                </p>
              )}
              {paymentFollowUp.payment.charged && (
                <p className="mt-2 font-semibold text-[#166534]">
                  Paid — you can print the patient bill for their records.
                </p>
              )}
              {!paymentFollowUp.payment.charged && (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-sm text-amber-950">
                  <span className="font-semibold">Clinic rule:</span> payment is due before the patient leaves. Fastest
                  path: charge a card on file (above), then card reader at the desk, or pay on a clinic tablet using the
                  button below.
                </p>
              )}
              {!paymentFollowUp.payment.charged && (
                <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2 text-xs leading-relaxed text-slate-700">
                  <strong className="text-slate-900">Desk Square Terminal (black reader):</strong> only starts after you tap{" "}
                  <strong>Square Terminal device</strong> below — finishing the visit with “desk link” or “show options” does{" "}
                  <em>not</em> send anything to that reader. <strong>iPad “POS” button:</strong> opens the Square POS app on the tablet,
                  not the standalone Terminal.
                </p>
              )}
              {squareTerminalConfig && !squareTerminalConfig.device_id_configured && (
                <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                  <strong>Terminal API not configured:</strong> set <code className="rounded bg-white px-1">SQUARE_DEVICE_ID</code> in the
                  server environment (Square Dashboard → Devices) so the dark button can wake the physical reader.
                </p>
              )}
              {!paymentFollowUp.payment.charged && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void applyPatientCredit()}
                    disabled={applyingCredit}
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {applyingCredit ? "Applying…" : "Apply patient credit"}
                  </button>
                  {squarePosConfig?.pos_callback_configured && (
                    <button
                      type="button"
                      onClick={() => void prepareSquarePosPayment()}
                      disabled={posLaunchBusy}
                      className="rounded-lg border border-[#16a349] bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#13823d] disabled:opacity-50"
                    >
                      {posLaunchBusy ? "Opening…" : "Tap card on Square reader (iPad / POS)"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={prepareTerminalPayment}
                    disabled={
                      terminalBusy || (squareTerminalConfig != null && !squareTerminalConfig.device_id_configured)
                    }
                    title={
                      squareTerminalConfig && !squareTerminalConfig.device_id_configured
                        ? "Configure SQUARE_DEVICE_ID on the API server"
                        : undefined
                    }
                    className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {terminalBusy ? "Creating…" : "Square Terminal device (desk reader)"}
                  </button>
                </div>
              )}
              {!paymentFollowUp.payment.charged && paymentFollowUp.payment.status === "checkout_link" && paymentFollowUp.payment.checkout_url && (
                <div className="mt-4 space-y-2 border-t border-slate-200/80 pt-4">
                  <p className="text-sm font-medium text-slate-800">Pay at the desk (no reader)</p>
                  <p className="text-sm text-slate-600">
                    Open this on a tablet or front-desk computer and let the patient complete checkout right there before
                    they walk out. You can still copy the link if you need to text it in a pinch.
                    {paymentFollowUp.payment.charge_error && paymentFollowUp.payment.charge_error !== "no_saved_card" && (
                      <span className="mt-1 block text-amber-800">
                        Auto-charge did not go through ({paymentFollowUp.payment.charge_error}). Collect payment here or
                        with the reader.
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={paymentFollowUp.payment.checkout_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-[#16a349] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13823d]"
                    >
                      Open pay screen (desk tablet)
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(paymentFollowUp.payment.checkout_url!);
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      Copy pay link
                    </button>
                  </div>
                </div>
              )}
              {!paymentFollowUp.payment.charged &&
                paymentFollowUp.payment.status !== "checkout_link" &&
                paymentFollowUp.payment.status === "square_not_configured" && (
                  <p className="mt-2 text-sm text-slate-600">
                    Square is not configured on the server — take payment at the desk (cash, Square Terminal outside this
                    app, etc.) and record it in your usual workflow.
                  </p>
                )}
              {!paymentFollowUp.payment.charged && paymentFollowUp.payment.status === "awaiting_manual" && (
                <p className="mt-2 text-sm text-slate-600">
                  No pay link was created. Use the card reader button above or collect payment manually before they leave.
                </p>
              )}
              {!paymentFollowUp.payment.charged && paymentFollowUp.payment.charge_error === "no_saved_card" && paymentFollowUp.payment.status !== "checkout_link" && (
                <p className="mt-2 text-sm text-slate-600">No card on file — use reader or desk pay screen.</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              {!paymentFollowUp.payment.charged && (
                <button
                  type="button"
                  disabled={previewingBill}
                  onClick={() => void openPatientBillPreview(paymentFollowUp.invoice_id)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  {previewingBill ? "Loading…" : "Preview bill (before payment)"}
                </button>
              )}
              <button
                type="button"
                disabled={printingBill}
                onClick={() => void tryOpenPatientBill(paymentFollowUp.invoice_id, { maxAttempts: 3 })}
                className="rounded-lg bg-[#16a349] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13823d] disabled:opacity-50"
              >
                {printingBill ? "Checking…" : "Print patient bill"}
              </button>
              <HelpTip label="Print patient bill" tone="emerald">
                Preview and print always load the <strong>current saved</strong> bill from the server — same line items, diagnosis, and totals
                as after you tap <strong>Update invoice</strong>. Official print opens only after payment and may trigger the print dialog. If
                checkout just finished, wait a moment and tap again if the first try is early.
              </HelpTip>
              <button
                type="button"
                onClick={() => setPaymentFollowUp(null)}
                className="text-sm font-medium text-slate-500 hover:text-slate-800"
              >
                Dismiss banner
              </button>
            </div>
          </div>
          {squareCheckoutId && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-semibold text-amber-950">Square Terminal</p>
              <p className="mt-1 text-amber-900">
                Complete the payment on the paired Square Terminal at the desk. This page updates when the device
                finishes.
              </p>
              <SquareTerminalCheckoutPoller
                checkoutId={squareCheckoutId}
                onComplete={() => {
                  const invId = paymentFollowUp?.invoice_id;
                  toast.success("Payment completed on the Square Terminal.");
                  setPaymentFollowUp((prev) =>
                    prev
                      ? {
                          ...prev,
                          payment: {
                            ...prev.payment,
                            charged: true,
                            status: "charged_saved_card",
                            checkout_url: null,
                            charge_error: null,
                          },
                        }
                      : null,
                  );
                  setSquareCheckoutId(null);
                  if (invId) void tryOpenPatientBill(invId, { maxAttempts: 12 });
                  void load();
                }}
                onTerminalError={(msg) => {
                  toast.error(msg);
                  setSquareCheckoutId(null);
                }}
              />
            </div>
          )}
        </section>
      )}
      <section className="doctor-panel lg:col-span-2">
        <DoctorSectionLabel help="Search for any past invoice by patient name, invoice number, or date and reprint the bill.">
          Search & reprint bills
        </DoctorSectionLabel>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <label className="mb-1.5 block text-[13px] font-semibold leading-normal text-slate-600">Patient name, invoice #, or date</label>
            <input
              type="text"
              value={billSearchQuery}
              onChange={(e) => setBillSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void searchBills()}
              placeholder="e.g. John Smith, INV-0042, or 2026-04-05"
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] leading-normal shadow-sm focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
            />
          </div>
          <button
            type="button"
            onClick={() => void searchBills()}
            disabled={billSearchLoading || !billSearchQuery.trim()}
            className="min-h-11 rounded-xl bg-slate-900 px-5 py-2.5 text-[14px] font-semibold leading-normal text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {billSearchLoading ? "Searching…" : "Search"}
          </button>
        </div>
        {billSearchResults !== null && (
          <div className="mt-3">
            {billSearchResults.length === 0 ? (
              <p className="text-sm text-slate-500">No invoices found. Try a different search.</p>
            ) : (
              <div className="space-y-2">
                {billSearchResults.map((inv) => (
                  <div
                    key={inv.invoice_id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{inv.patient_name}</p>
                      <p className="text-xs text-slate-500">
                        {inv.invoice_number} · {formatMonthDayYear(inv.date_of_service)} · ${inv.total_amount}
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          inv.status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          {inv.status.toUpperCase()}
                        </span>
                      </p>
                    </div>
                    {inv.status === "paid" && (
                      <button
                        type="button"
                        disabled={printingBill}
                        onClick={() => void tryOpenPatientBill(inv.invoice_id, { maxAttempts: 2 })}
                        className="rounded-lg bg-[#16a349] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#13823d] disabled:opacity-50"
                      >
                        {printingBill ? "Loading…" : "Print bill"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
      <section className="doctor-panel">
        <DoctorSectionLabel
          help="Only visits where you are the provider. Click a row to open their chart. Awaiting payment means the visit is done but money is still due — use Collect payment on that row to reopen checkout or the card reader. Before the visit starts you can mark no-show, cancel, or reschedule. After a visit is completed you can book their next visit from the row."
        >
          {selectedDate === todayStr ? "Today's schedule" : "Appointments for this day"}
        </DoctorSectionLabel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Only your patients · {selectedDate === todayStr ? "Today" : formatMonthDayYear(selectedDate)}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
              aria-label="Pick schedule date"
            />
            <HelpTip label="Date picker" align="center" tone="emerald">
              Switch days to plan ahead or review a past session. Stats and the list reload for the date you choose.
            </HelpTip>
          </div>
        </div>
        {error && <p className="mb-3 rounded-xl bg-rose-100 p-3 text-sm font-medium text-rose-800">{error}</p>}
        {loading ? (
          <Loader variant="page" label="Loading appointments" sublabel="Almost there…" />
        ) : appointments.length === 0 ? (
          <DoctorEmptyWell
            title={selectedDate === todayStr ? "Clear calendar today" : "No appointments this day"}
            description={
              selectedDate === todayStr
                ? "When patients book with you, they will show up here. You can change the date above to plan ahead."
                : `Nothing scheduled for ${formatMonthDayYear(selectedDate)}. Pick another date or enjoy the lighter day.`
            }
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100/80 text-[#16a349] shadow-inner">
              <IconStethoscope className="h-7 w-7" />
            </span>
          </DoctorEmptyWell>
        ) : (
          <div className="stagger-children space-y-2.5">
            {appointments.map((appt) => (
              <div
                key={appt.id}
                className={`overflow-hidden rounded-xl border transition hover:shadow-sm ${
                  activeAppt?.id === appt.id
                    ? "border-[#16a349]/45 bg-gradient-to-r from-[#16a349]/12 to-emerald-50/50 shadow-sm"
                    : "border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                }`}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setPatientDetailId(appt.patient_id)}
                  onKeyDown={(e) => e.key === "Enter" && setPatientDetailId(appt.patient_id)}
                  className="cursor-pointer px-4 py-4 sm:px-5 sm:py-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
                    <div className="min-w-0 flex-1">
                      <p className="text-xl font-bold leading-snug tracking-tight text-slate-900">{appt.patient}</p>
                      <p className="mt-1.5 text-[13px] leading-normal text-slate-500">
                        {appt.start_time} – {appt.end_time}
                        {appt.service ? ` · ${appt.service}` : " · Follow-up"}
                      </p>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
                      <span
                        className={`inline-flex w-fit shrink-0 rounded-full px-3 py-1 text-[13px] font-bold leading-normal ${appointmentStatusPillClass(appt.status)}`}
                      >
                        {badgeLabel(statusDisplay(appt.status))}
                      </span>
                      <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                    {appt.status === "booked" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void checkInPatient(appt);
                        }}
                        disabled={isCheckingIn}
                        className="min-h-11 w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-[14px] font-semibold leading-normal text-amber-900 shadow-sm hover:bg-amber-100 disabled:opacity-50 sm:w-auto sm:min-w-[10rem]"
                      >
                        {isCheckingIn ? "Completing check-in…" : "Check-in"}
                      </button>
                    )}
                    {appt.status === "checked_in" && (
                      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startVisit(appt);
                          }}
                          disabled={isStarting}
                          className="min-h-11 w-full rounded-xl bg-[#16a349] px-4 py-2.5 text-[14px] font-semibold leading-normal text-white shadow-sm shadow-emerald-900/15 hover:bg-[#13823d] disabled:opacity-50 sm:w-auto sm:min-w-[11rem]"
                        >
                          Start visit
                        </button>
                        <HelpTip label="Start visit" align="center" tone="emerald">
                          Opens a large chart-and-bill workspace (you can dock it to the narrow side panel). Document the visit, then
                          complete when finished.
                        </HelpTip>
                      </div>
                    )}
                    {appt.status === "in_consultation" && (
                      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConsultWorkspaceExpanded(true);
                            setActiveAppt(appt);
                          }}
                          className="min-h-11 w-full rounded-xl bg-[#16a349] px-4 py-2.5 text-[14px] font-semibold leading-normal text-white shadow-sm shadow-emerald-900/15 hover:bg-[#13823d] sm:w-auto sm:min-w-[11rem]"
                        >
                          Resume visit
                        </button>
                        <HelpTip label="Resume visit" align="center" tone="emerald">
                          Reopens the consultation workspace for this patient so you can continue charting and billing without
                          logging out.
                        </HelpTip>
                      </div>
                    )}
                    {appt.status === "awaiting_payment" && (
                      <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch sm:justify-end">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void openBillingForEdit(appt);
                          }}
                          className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[14px] font-semibold leading-normal text-slate-800 shadow-sm hover:border-[#16a349]/40 hover:bg-emerald-50/80 sm:flex-1 sm:min-w-[9rem]"
                        >
                          Edit billing
                        </button>
                        <HelpTip label="Edit billing" align="center" tone="emerald">
                          Opens the same chart and procedure workspace so you can add lines or adjust fees while we&apos;re still waiting
                          on payment. Saving updates the open invoice — confirm the new total with the patient, then collect payment.
                        </HelpTip>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void resumePaymentForAppointment(appt);
                          }}
                          className="min-h-11 w-full rounded-xl bg-[#16a349] px-4 py-2.5 text-[14px] font-semibold leading-normal text-white shadow-sm shadow-emerald-900/15 hover:bg-[#13823d] sm:flex-1 sm:min-w-[11rem]"
                        >
                          Collect payment
                        </button>
                        <HelpTip label="Collect payment" align="center" tone="emerald">
                          Reopens the green payment banner (desk pay link, card reader). Use if you closed it earlier or need another
                          attempt. Patient bill still prints only after payment succeeds.
                        </HelpTip>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void resumePaymentForAppointment(appt, { trySavedCard: true });
                          }}
                          className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[14px] font-semibold leading-normal text-slate-700 shadow-sm hover:border-[#16a349]/35 hover:bg-emerald-50/80 hover:text-[#0d5c2e] sm:flex-1 sm:min-w-[10rem]"
                        >
                          Retry saved card
                        </button>
                      </div>
                    )}
                      </div>
                    </div>
                  </div>
                </div>
                {appt.status === "awaiting_payment" && appt.invoice_total != null && (
                  <p className="border-t border-emerald-100/80 bg-[#f0fdf4]/90 px-4 py-2 text-center text-[13px] font-medium leading-normal text-[#0d5c2e]">
                    Amount due (invoice): ${appt.invoice_total}
                    {appt.invoice_number ? ` · ${appt.invoice_number}` : ""}
                  </p>
                )}
                {canDoctorPreVisitDesk(appt.status) && (
                  <div className="grid grid-cols-1 gap-2 border-t border-slate-200/80 bg-slate-50/60 px-4 py-3 sm:grid-cols-3">
                    <button
                      type="button"
                      disabled={savingDesk}
                      onClick={() => {
                        if (!confirm("Mark as no-show? This visit will no longer count as an active booking.")) return;
                        void runWithFeedback(
                          async () => {
                            await apiPatch(`/appointments/${appt.id}/`, { status: "no_show" });
                            await load();
                          },
                          {
                            loadingMessage: "Updating…",
                            successMessage: "Marked as no-show.",
                            errorFallback: "Could not update this visit.",
                          },
                        );
                      }}
                      className="min-h-11 w-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[14px] font-semibold leading-normal text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                    >
                      No-show
                    </button>
                    <button
                      type="button"
                      disabled={savingDesk}
                      onClick={() => {
                        const lateM =
                          appt.service_type === "massage" && doctorApptWithin24Hours(appt);
                        const msg = lateM
                          ? "This massage is inside the 24-hour window: the patient will be charged the full massage price. To waive the fee when you rescheduled them same-day by phone, cancel from Admin → Schedule with “Waive late-cancellation fee” checked. Continue to cancel from here?"
                          : "Cancel this appointment? The time slot will be freed.";
                        if (!confirm(msg)) return;
                        void runWithFeedback(
                          async () => {
                            await apiPatch(`/appointments/${appt.id}/`, { status: "cancelled" });
                            await load();
                          },
                          {
                            loadingMessage: "Updating…",
                            successMessage: "Appointment cancelled.",
                            errorFallback: "Could not cancel.",
                          },
                        );
                      }}
                      className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[14px] font-semibold leading-normal text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={savingDesk}
                      onClick={() => setRescheduleAppt(appt)}
                      className="min-h-11 w-full rounded-lg border border-[#16a349]/30 bg-white px-4 py-2.5 text-[14px] font-semibold leading-normal text-[#0d5c2e] hover:bg-emerald-50 disabled:opacity-50"
                    >
                      Reschedule
                    </button>
                  </div>
                )}
                {appt.status === "completed" && (
                  <div className="border-t border-slate-200/80 bg-slate-50/60 px-4 py-3">
                    <button
                      type="button"
                      disabled={savingBookNext || bookNextOptionsLoading}
                      onClick={(e) => {
                        e.stopPropagation();
                        openBookNext(appt);
                      }}
                      className="min-h-11 w-full rounded-lg border border-[#16a349]/30 bg-white px-4 py-2.5 text-[14px] font-semibold leading-normal text-[#0d5c2e] hover:bg-emerald-50 disabled:opacity-50"
                    >
                      Book next visit
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      {activeAppt &&
        consultWorkspaceExpanded &&
        consultPortalReady &&
        createPortal(
          <div
            className="fixed inset-0 z-[150] overflow-y-auto overscroll-y-contain bg-slate-950/55 backdrop-blur-[1px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consult-workspace-title"
            onClick={closeConsultWorkspace}
          >
            {/* Portal → body so stacking is above sticky doctor header (z-30); z-[150] below patient chart (z-200) */}
            <div className="flex min-h-[100dvh] w-full items-center justify-center px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(0.5rem,env(safe-area-inset-top,0px))] sm:px-5 sm:py-6 sm:pb-6">
              <div
                className="relative w-full max-w-5xl shrink-0 rounded-2xl border border-slate-200/90 bg-white shadow-2xl shadow-slate-900/25"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={closeConsultWorkspace}
                  aria-label="Close workspace"
                  className="absolute right-3 top-3 z-20 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-lg font-semibold leading-none text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-800"
                >
                  ×
                </button>
                <div className="max-h-[min(100dvh-2.5rem,56rem)] overflow-y-auto overscroll-y-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-5 sm:max-h-[min(92dvh,56rem)] sm:px-8 sm:pb-10 sm:pt-7">
                  <h2 id="consult-workspace-title" className="sr-only">
                    Active visit workspace for {activeAppt.patient}
                  </h2>
                  <div className="space-y-5">{renderConsultationForm(true)}</div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
      <aside className="doctor-panel space-y-4 ring-1 ring-emerald-100/70">
        <DoctorSectionLabel help="When a visit is active, a large workspace opens so you can chart and bill comfortably. You can switch to the narrow side panel if you prefer.">
          Active visit
        </DoctorSectionLabel>
        {activeAppt ? (
          consultWorkspaceExpanded ? (
            <div className="rounded-xl border border-emerald-200/90 bg-gradient-to-b from-emerald-50/90 to-white p-4 text-sm shadow-sm">
              <p className="font-bold text-[#0d5c2e]">Full workspace is open</p>
              <p className="mt-1.5 leading-relaxed text-slate-600">
                Use the large centered window to enter diagnosis, procedures, and notes. Your schedule stays visible in the background.
              </p>
              <button
                type="button"
                onClick={() => setConsultWorkspaceExpanded(false)}
                className="mt-4 w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                Use narrow side panel instead
              </button>
            </div>
          ) : (
            <div className="space-y-4">{renderConsultationForm(false)}</div>
          )
        ) : (
          <DoctorEmptyWell
            title="No active visit"
            description="Tap Check-in on a patient’s row (or they can use the kiosk), then tap Start visit. A full workspace will open automatically for charting and billing."
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
              <IconStethoscope className="h-6 w-6" />
            </span>
          </DoctorEmptyWell>
        )}
      </aside>
      {paymentConfirmOpen && activeAppt && (
        <div
          className="fixed inset-0 z-[170] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-confirm-title"
        >
          <div className="max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 id="payment-confirm-title" className="text-lg font-bold text-slate-900">
              {paymentConfirmIsRevise ? "Confirm updated amount before saving" : "Confirm with patient before payment"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {paymentConfirmIsRevise ? (
                <>
                  You are about to <strong>update the existing invoice</strong> for{" "}
                  <span className="font-semibold text-slate-900">{activeAppt.patient}</span> with the lines you just reviewed.{" "}
                  <strong>Confirm the new total</strong> out loud before charging a card or starting checkout — especially if it changed.
                  If you already opened a pay link or Terminal session for the old amount, start a fresh one after saving so Square matches
                  the invoice.
                </>
              ) : (
                <>
                  You are about to finish documentation and create the invoice for{" "}
                  <span className="font-semibold text-slate-900">{activeAppt.patient}</span>.{" "}
                  <strong>Verbally confirm the amount</strong> they owe and that they agree before you charge a card or send them to the
                  reader.
                </>
              )}
            </p>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">
                  {paymentConfirmIsRevise ? "Estimated total after update" : "Estimated patient portion"}
                </span>
                <span className="text-lg font-bold tabular-nums text-slate-900">
                  {(consultationEstimatedTotal ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" })}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {paymentConfirmIsRevise
                  ? "Saving replaces line items and recalculates tax and balance due on the same invoice number."
                  : "Final invoice total comes from checked services; it should match unless prices differ."}
              </p>
              {activeAppt.card_last4 ? (
                <div className="mt-3 flex items-center justify-between border-t border-slate-200/80 pt-3 text-sm">
                  <span className="text-slate-500">Card on file</span>
                  <span className="font-semibold text-slate-900">
                    {activeAppt.card_brand || "Card"} · •••• {activeAppt.card_last4}
                  </span>
                </div>
              ) : (
                <p className="mt-3 border-t border-slate-200/80 pt-3 text-xs text-slate-600">No card on file — use Terminal or desk checkout.</p>
              )}
            </div>
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
              Clinic policy: the patient should know what they are paying before you run the charge or hand them the Terminal.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {activeAppt.card_last4 ? (
                <>
                  <button
                    type="button"
                    disabled={isCompleting}
                    onClick={() => void doCompleteVisit(true)}
                    className="w-full rounded-xl bg-[#16a349] px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
                  >
                    {isCompleting ? "Working…" : "Charge saved card now (card not present)"}
                  </button>
                  <p className="text-center text-[11px] leading-snug text-slate-600">
                    Runs <strong>after</strong> you confirm with the patient. The server charges the <strong>saved card on file</strong>{" "}
                    (shown above) for the invoice total — same flow as before, just gated on your confirmation.
                  </p>
                  <button
                    type="button"
                    disabled={isCompleting}
                    onClick={() => void doCompleteVisit(false, { autoTerminal: true })}
                    className="w-full rounded-xl border-2 border-slate-800 bg-white px-4 py-3 text-sm font-bold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Use Square Terminal — patient taps or inserts card
                  </button>
                  <button
                    type="button"
                    disabled={isCompleting}
                    onClick={() => void doCompleteVisit(false)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Desk pay link, Square POS app, or decide in a moment
                  </button>
                  <p className="text-center text-[11px] leading-snug text-slate-500">
                    Does not wake the physical Square Terminal — use the green banner after and tap{" "}
                    <strong className="font-semibold text-slate-700">Square Terminal device</strong>.
                  </p>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={isCompleting}
                    onClick={() => void doCompleteVisit(false, { autoTerminal: true })}
                    className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    Start Square Terminal checkout now
                  </button>
                  <button
                    type="button"
                    disabled={isCompleting}
                    onClick={() => void doCompleteVisit(false)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Show all payment options (desk link, POS, Terminal from banner)
                  </button>
                  <p className="text-center text-[11px] leading-snug text-slate-500">
                    Terminal reader starts only from that banner — not automatically here.
                  </p>
                </>
              )}
              <button
                type="button"
                onClick={() => setPaymentConfirmOpen(false)}
                disabled={isCompleting}
                className="mt-1 w-full rounded-xl px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel — back to visit
              </button>
            </div>
          </div>
        </div>
      )}
      {rescheduleAppt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reschedule-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 id="reschedule-title" className="text-lg font-bold text-slate-900">
              Reschedule visit
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Pick a new opening from the same rules as online booking. Visit length stays with the booked service.
            </p>
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-800">
              <p className="font-semibold text-slate-900">{rescheduleAppt.patient}</p>
              <p className="mt-1 text-slate-700">
                <span className="font-medium text-slate-600">Currently scheduled:</span>{" "}
                {formatMonthDayYear(rescheduleAppt.appointment_date)} · {rescheduleAppt.start_time} – {rescheduleAppt.end_time}
              </p>
              <p className="mt-1 text-slate-700">
                <span className="font-medium text-slate-600">Service:</span> {rescheduleAppt.service || "—"}
              </p>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-semibold text-slate-600">
                New date
                <input
                  type="date"
                  value={resDate}
                  min={todayStr}
                  onChange={(e) => setResDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                New time
                {resSlotsLoading ? (
                  <span className="mt-1 block text-sm font-normal text-slate-500">Loading openings…</span>
                ) : (
                  <select
                    value={resSelectedSlot}
                    onChange={(e) => setResSelectedSlot(e.target.value)}
                    disabled={!resSlotLabels.length}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    {resSlotLabels.length === 0 ? (
                      <option value="">No openings — pick another date</option>
                    ) : (
                      resSlotLabels.map((label, i) => (
                        <option key={`${label}-${i}`} value={resSlotTimes[i] || label}>
                          {label}
                        </option>
                      ))
                    )}
                  </select>
                )}
              </label>
              {!rescheduleAppt.booked_service_id && (
                <p className="text-sm text-amber-800">This visit has no booked service — contact the front desk to reschedule.</p>
              )}
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setRescheduleAppt(null)}
                disabled={savingDesk}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Close
              </button>
              <button
                type="button"
                disabled={
                  savingDesk ||
                  !resDate ||
                  !resSelectedSlot ||
                  !rescheduleAppt.booked_service_id ||
                  resSlotsLoading ||
                  !resSlotLabels.length
                }
                onClick={() => void submitReschedule()}
                className="rounded-xl bg-[#16a349] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
              >
                {savingDesk ? "Saving…" : "Confirm reschedule"}
              </button>
            </div>
          </div>
        </div>
      )}
      {bookNextAppt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="book-next-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 id="book-next-title" className="text-lg font-bold text-slate-900">
              Book next visit
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Schedule a new appointment for <span className="font-semibold text-slate-800">{bookNextAppt.patient}</span>. Only times that
              match online booking rules are shown.
            </p>
            {bookNextOptionsLoading ? (
              <p className="mt-4 text-sm text-slate-600">Loading visit types…</p>
            ) : (
              <div className="mt-4 space-y-3">
                <label className="block text-xs font-semibold text-slate-600">
                  Service
                  <select
                    value={bnServiceId || ""}
                    onChange={(e) => {
                      const sid = Number(e.target.value);
                      setBnServiceId(sid);
                      const provs = bookingOptions?.providers_by_service[String(sid)] ?? [];
                      const pid =
                        myProviderId != null && provs.some((p) => p.id === myProviderId)
                          ? myProviderId
                          : provs[0]?.id ?? myProviderId ?? 0;
                      setBnProviderId(pid);
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    {(bookingOptions?.services ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Provider
                  <select
                    value={bnProviderId || ""}
                    onChange={(e) => setBnProviderId(Number(e.target.value))}
                    disabled={!bnServiceId}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    {(bookingOptions?.providers_by_service[String(bnServiceId)] ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.provider_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Date
                  <input
                    type="date"
                    value={bnDate}
                    min={todayStr}
                    onChange={(e) => setBnDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Time
                  {bnSlotsLoading ? (
                    <span className="mt-1 block text-sm font-normal text-slate-500">Loading openings…</span>
                  ) : (
                    <select
                      value={bnSelectedSlot}
                      onChange={(e) => setBnSelectedSlot(e.target.value)}
                      disabled={!bnSlotLabels.length}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      {bnSlotLabels.length === 0 ? (
                        <option value="">No openings — adjust date, service, or provider</option>
                      ) : (
                        bnSlotLabels.map((label, i) => (
                          <option key={`${label}-bn-${i}`} value={bnSlotTimes[i] || label}>
                            {label}
                          </option>
                        ))
                      )}
                    </select>
                  )}
                </label>
              </div>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setBookNextAppt(null);
                  setBookingOptions(null);
                }}
                disabled={savingBookNext}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Close
              </button>
              <button
                type="button"
                disabled={
                  savingBookNext ||
                  bookNextOptionsLoading ||
                  !bnServiceId ||
                  !bnProviderId ||
                  !bnDate ||
                  !bnSelectedSlot ||
                  bnSlotsLoading ||
                  !bnSlotLabels.length
                }
                onClick={() => void submitBookNext()}
                className="rounded-xl bg-[#16a349] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
              >
                {savingBookNext ? "Booking…" : "Confirm booking"}
              </button>
            </div>
          </div>
        </div>
      )}
      <PatientBillPortalModal bill={patientBillModal} onClose={() => setPatientBillModal(null)} />
      {patientDetailId && (
        <PatientDetailModal patientId={patientDetailId} onClose={() => setPatientDetailId(null)} />
      )}
      </div>
    </div>
  );
}
