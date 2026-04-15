"use client";

import { useAppFeedback } from "@/components/app-feedback";
import { DoctorEmptyWell, DoctorPageIntro, DoctorSectionLabel, DoctorStatsRow, doctorGreeting } from "@/components/doctor-shell";
import { HelpTip } from "@/components/help-tip";
import { IconStethoscope } from "@/components/icons";
import { Loader } from "@/components/loader";
import { PatientDetailModal } from "@/components/patient-detail-modal";
import { appointmentStatusPillClass } from "@/components/status-chip";
import { SquareTerminalCheckoutPoller } from "@/components/square-terminal-checkout";
import { ApiError, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import type { PatientBillPayload } from "@/lib/patient-bill-print";
import { openPatientBillPrint } from "@/lib/patient-bill-print";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

type SquarePosConfig = {
  pos_callback_configured: boolean;
  has_location: boolean;
  has_application_id: boolean;
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
};

type BillLine = { service_id: number; quantity: string; unit_price: string };

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

type PaymentFollowUp = {
  invoice_id: number;
  invoice_number?: string;
  total_amount?: string;
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
  const [billLines, setBillLines] = useState<BillLine[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [patientDetailId, setPatientDetailId] = useState<number | null>(null);
  const [chargeSavedCard, setChargeSavedCard] = useState(true);
  const [paymentFollowUp, setPaymentFollowUp] = useState<PaymentFollowUp | null>(null);
  const [terminalBusy, setTerminalBusy] = useState(false);
  /** Square Terminal API checkout id — we poll until the physical device completes payment. */
  const [squareCheckoutId, setSquareCheckoutId] = useState<string | null>(null);
  /** Square Point of Sale app (Stand + reader) — separate from Square Terminal API. */
  const [squarePosConfig, setSquarePosConfig] = useState<SquarePosConfig | null>(null);
  const [posLaunchBusy, setPosLaunchBusy] = useState(false);
  const [displayName, setDisplayName] = useState("");
  /** Saved on the appointment row for handoff / next doctor (separate from visit-only notes). */
  const [handoffNotes, setHandoffNotes] = useState("");
  const [savingHandoff, setSavingHandoff] = useState(false);
  /** Simple modal to move a visit to another date/time (only before the visit is in progress). */
  const [rescheduleAppt, setRescheduleAppt] = useState<Appointment | null>(null);
  const [resDate, setResDate] = useState("");
  const [resTime, setResTime] = useState("09:00");
  const [savingDesk, setSavingDesk] = useState(false);
  const [chargeConfirmAppt, setChargeConfirmAppt] = useState<Appointment | null>(null);
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

  useEffect(() => {
    setDisplayName(localStorage.getItem("chiroflow_user_name") || "");
  }, []);

  useEffect(() => {
    if (!paymentFollowUp?.invoice_id) {
      setSquarePosConfig(null);
      return;
    }
    let cancelled = false;
    void apiGetAuth<SquarePosConfig>("/doctor/square_pos_config/")
      .then((c) => {
        if (!cancelled) setSquarePosConfig(c);
      })
      .catch(() => {
        if (!cancelled) setSquarePosConfig({ pos_callback_configured: false, has_location: false, has_application_id: false });
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
        help: "All visits assigned to you for the day you picked—not only people who have checked in yet.",
      },
      {
        label: "Checked in",
        value: list.filter((a) => a.status === "checked_in").length,
        tone: "amber" as const,
        help: "Checked in at the kiosk, front desk, or by you. Tap Start visit on their row when you are ready to see them.",
      },
      {
        label: "In consultation",
        value: list.filter((a) => a.status === "in_consultation").length,
        tone: "accent" as const,
        help: "You started the visit; their chart and billing panel are open on the right until you complete.",
      },
      {
        label: "Finished today",
        value: list.filter((a) => ["completed", "awaiting_payment"].includes(a.status)).length,
        help: "Visit is wrapped up or waiting on payment. Awaiting payment still counts as needing checkout at the desk.",
      },
    ];
  }, [appointments]);

  const load = async (opts?: { focusAppointmentId?: number }) => {
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
        return appts.find((a) => a.status === "in_consultation") ?? null;
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
    setDoctorNotes("");
  }, [activeAppt?.id]);

  useEffect(() => {
    if (!activeAppt) {
      setBillLines([]);
      setDiagnosis("");
      setHandoffNotes("");
      return;
    }
    setHandoffNotes(activeAppt.clinical_handoff_notes ?? "");
    if (!activeAppt.booked_service_id) {
      setBillLines([]);
      setDiagnosis("");
      return;
    }
    setBillLines([{ service_id: activeAppt.booked_service_id, quantity: "1", unit_price: "" }]);
    setDiagnosis("");
  }, [activeAppt?.id, activeAppt?.booked_service_id, activeAppt?.clinical_handoff_notes]);

  useEffect(() => {
    if (!rescheduleAppt) return;
    setResDate(rescheduleAppt.appointment_date || selectedDate);
    const iso = rescheduleAppt.start_time_iso || "";
    setResTime(iso.length >= 5 ? iso.slice(0, 5) : "09:00");
  }, [rescheduleAppt?.id, rescheduleAppt?.appointment_date, rescheduleAppt?.start_time_iso, selectedDate]);

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

  const doCompleteVisit = async (shouldChargeCard: boolean) => {
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
    setIsCompleting(true);
    setError("");
    await runWithFeedback(
      async () => {
        const result = await apiPost<{
          invoice_id: number;
          invoice_number: string;
          total_amount: string;
          payment: CompleteVisitPayment;
        }>(`/doctor/${apptId}/complete_visit/`, {
          doctor_notes: doctorNotes,
          diagnosis,
          rendered_services: rendered,
          charge_saved_card_if_present: shouldChargeCard,
        });
        if (result.payment.charged) {
          await tryOpenPatientBill(result.invoice_id, { maxAttempts: 3 });
        }
        setPaymentFollowUp({
          invoice_id: result.invoice_id,
          invoice_number: result.invoice_number,
          total_amount: result.total_amount,
          payment: result.payment,
        });
        setSquareCheckoutId(null);
        setActiveAppt(null);
        setDoctorNotes("");
        setDiagnosis("");
        setBillLines([]);
        await load();
        return result;
      },
      {
        loadingMessage: "Completing visit and creating invoice…",
        successMessage: (r) =>
          r?.payment?.charged
            ? "Visit completed — payment received; patient bill opened for printing."
            : "Visit completed — collect payment, then tap Print patient bill.",
        errorFallback: "Could not complete this visit.",
      },
    );
    setIsCompleting(false);
  };

  const completeVisit = async () => {
    if (!activeAppt) return;
    if (billLines.filter((l) => l.service_id).length === 0) {
      toast.error("Add at least one service line for this visit (adjust or add rows below).");
      return;
    }
    if (chargeSavedCard && activeAppt.card_last4) {
      setChargeConfirmAppt(activeAppt);
      return;
    }
    await doCompleteVisit(false);
  };

  const checkInPatient = async (appt: Appointment) => {
    setIsCheckingIn(true);
    await runWithFeedback(
      async () => {
        await apiPost("/kiosk/checkin/", { appointment_id: appt.id });
        await load();
      },
      {
        loadingMessage: "Checking in…",
        successMessage: `${appt.patient} is checked in — you can start the visit now.`,
        errorFallback: "Could not check in this patient.",
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

  const prepareTerminalPayment = async () => {
    if (!paymentFollowUp) return;
    setTerminalBusy(true);
    setError("");
    await runWithFeedback(
      async () => {
        const out = await apiPost<{ checkout_id: string; status: string }>("/doctor/terminal_checkout/", {
          invoice_id: paymentFollowUp.invoice_id,
        });
        setSquareCheckoutId(out.checkout_id);
      },
      {
        loadingMessage: "Preparing card reader…",
        successMessage: "Reader ready — follow the prompts on the terminal.",
        errorFallback: "Could not start terminal payment.",
      },
    );
    setTerminalBusy(false);
  };

  /** Opens Square Point of Sale on iPad/Android — patient taps card on Stand + reader. */
  const prepareSquarePosPayment = async () => {
    if (!paymentFollowUp) return;
    setPosLaunchBusy(true);
    setError("");
    await runWithFeedback(
      async () => {
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

  /** Estimated total for checked bill lines (same math as complete visit uses on the server). */
  const consultationEstimatedTotal = useMemo(() => {
    let total = 0;
    let hasLine = false;
    for (const line of billLines) {
      const svc = services.find((s) => s.id === line.service_id);
      if (!svc) continue;
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

  const [printingBill, setPrintingBill] = useState(false);

  /** Fetches print-ready bill only when the invoice is PAID (server enforces this). */
  const tryOpenPatientBill = async (invoiceId: number, opts?: { maxAttempts?: number; quiet?: boolean }) => {
    const max = opts?.maxAttempts ?? 1;
    setPrintingBill(true);
    try {
      for (let i = 0; i < max; i++) {
        try {
          const st = await apiGetAuth<{ paid: boolean }>(`/doctor/invoice_payment_status/?invoice_id=${invoiceId}`);
          if (st.paid) {
            const bill = await apiGetAuth<PatientBillPayload>(`/doctor/invoice_bill/?invoice_id=${invoiceId}`);
            openPatientBillPrint(bill);
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
          await apiPatch(`/appointments/${rescheduleAppt.id}/`, {
            appointment_date: resDate,
            start_time: resTime.length === 5 ? `${resTime}:00` : resTime,
          });
          setRescheduleAppt(null);
          await load();
        },
        {
          loadingMessage: "Rescheduling…",
          successMessage: "Appointment moved to the new time.",
          errorFallback: "Could not reschedule (slot may be taken).",
        },
      );
    } finally {
      setSavingDesk(false);
    }
  };

  return (
    <div className="space-y-8">
      <DoctorPageIntro
        eyebrow="Clinical workspace"
        title={`${doctorGreeting()}, ${firstName}`}
        description="While you add services for an active visit, you will see an estimated total. The printable patient bill opens only after payment is complete."
        pageHelp={
          <>
            This page is your <strong>daily command center</strong>: pick a date, work down the list, and use the right column when
            someone is in consultation. Checked procedures show a running <strong>estimated total</strong>. When you complete the visit,
            collect payment first; the <strong>patient bill</strong> prints only after the invoice is marked paid (saved card, reader, or
            desk checkout). If someone does not show up, use <strong>No-show</strong> or <strong>Cancel</strong>; use{" "}
            <strong>Reschedule</strong> to move a visit.
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
                <div className="mt-3 flex flex-wrap gap-2">
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
                    disabled={terminalBusy}
                    className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {terminalBusy ? "Creating…" : "Square Terminal device (if you have one)"}
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
              <button
                type="button"
                disabled={printingBill}
                onClick={() => void tryOpenPatientBill(paymentFollowUp.invoice_id, { maxAttempts: 3 })}
                className="rounded-lg bg-[#16a349] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13823d] disabled:opacity-50"
              >
                {printingBill ? "Checking…" : "Print patient bill"}
              </button>
              <HelpTip label="Print patient bill" tone="emerald">
                Opens the official patient bill only after the invoice is paid. If the patient just finished checkout or the reader, wait
                a moment and tap again if the first try is early.
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
            <label className="mb-1 block text-xs font-semibold text-slate-500">Patient name, invoice #, or date</label>
            <input
              type="text"
              value={billSearchQuery}
              onChange={(e) => setBillSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void searchBills()}
              placeholder="e.g. John Smith, INV-0042, or 2026-04-05"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
            />
          </div>
          <button
            type="button"
            onClick={() => void searchBills()}
            disabled={billSearchLoading || !billSearchQuery.trim()}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
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
                        {inv.invoice_number} · {inv.date_of_service} · ${inv.total_amount}
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
          help="Only visits where you are the provider. Click a row to open their chart. Awaiting payment means the visit is done but money is still due — use Collect payment on that row to reopen checkout or the card reader. Before the visit starts you can mark no-show, cancel, or reschedule."
        >
          {selectedDate === todayStr ? "Today's schedule" : "Appointments for this day"}
        </DoctorSectionLabel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Only your patients · {selectedDate === todayStr ? "Today" : selectedDate}
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
                : `Nothing scheduled for ${selectedDate}. Pick another date or enjoy the lighter day.`
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
                  className="flex cursor-pointer items-center justify-between px-4 py-3.5"
                >
                  <div className="flex items-center gap-4">
                    <span
                      className={`w-12 shrink-0 text-sm font-medium ${
                        appt.status === "in_consultation"
                          ? "cursor-pointer text-[#166534] underline decoration-[#16a349]/40 decoration-dotted underline-offset-2 hover:text-[#0d5c2e]"
                          : "text-slate-600"
                      }`}
                      role={appt.status === "in_consultation" ? "button" : undefined}
                      tabIndex={appt.status === "in_consultation" ? 0 : undefined}
                      title={
                        appt.status === "in_consultation"
                          ? "Open this visit in the Active visit panel (right column)"
                          : undefined
                      }
                      onClick={
                        appt.status === "in_consultation"
                          ? (e) => {
                              e.stopPropagation();
                              setActiveAppt(appt);
                            }
                          : undefined
                      }
                      onKeyDown={
                        appt.status === "in_consultation"
                          ? (e) => {
                              if (e.key === "Enter") {
                                e.stopPropagation();
                                setActiveAppt(appt);
                              }
                            }
                          : undefined
                      }
                    >
                      {appt.start_time}
                    </span>
                    <div>
                      <p className="font-semibold text-slate-900">{appt.patient}</p>
                      <p className="text-sm text-slate-500">{appt.service || "Follow-up"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${appointmentStatusPillClass(appt.status)}`}
                    >
                      {badgeLabel(statusDisplay(appt.status))}
                    </span>
                    {appt.status === "booked" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void checkInPatient(appt);
                        }}
                        disabled={isCheckingIn}
                        className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 shadow-sm hover:bg-amber-100 disabled:opacity-50"
                      >
                        {isCheckingIn ? "Checking in…" : "Check in"}
                      </button>
                    )}
                    {appt.status === "checked_in" && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startVisit(appt);
                          }}
                          disabled={isStarting}
                          className="rounded-xl bg-[#16a349] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-900/15 hover:bg-[#13823d] disabled:opacity-50"
                        >
                          Start visit
                        </button>
                        <HelpTip label="Start visit" align="center" tone="emerald">
                          Opens this patient in the Active visit panel so you can document, set services, and complete the visit.
                        </HelpTip>
                      </div>
                    )}
                    {appt.status === "awaiting_payment" && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void resumePaymentForAppointment(appt);
                          }}
                          className="rounded-xl bg-[#16a349] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-900/15 hover:bg-[#13823d]"
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
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:border-[#16a349]/35 hover:bg-emerald-50/80 hover:text-[#0d5c2e]"
                        >
                          Retry saved card
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {appt.status === "awaiting_payment" && appt.invoice_total != null && (
                  <p className="border-t border-emerald-100/80 bg-[#f0fdf4]/90 px-4 py-1.5 text-center text-xs font-medium text-[#0d5c2e]">
                    Amount due (invoice): ${appt.invoice_total}
                    {appt.invoice_number ? ` · ${appt.invoice_number}` : ""}
                  </p>
                )}
                {canDoctorPreVisitDesk(appt.status) && (
                  <div className="flex flex-wrap gap-2 border-t border-slate-200/80 bg-slate-50/60 px-4 py-2.5">
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
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
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
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={savingDesk}
                      onClick={() => setRescheduleAppt(appt)}
                      className="rounded-lg border border-[#16a349]/30 bg-white px-3 py-1.5 text-xs font-semibold text-[#0d5c2e] hover:bg-emerald-50 disabled:opacity-50"
                    >
                      Reschedule
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      <aside className="doctor-panel space-y-4 ring-1 ring-emerald-100/70">
        <DoctorSectionLabel help="Shows the patient currently in consultation with you. When empty, start someone from the list after they check in.">
          Active visit
        </DoctorSectionLabel>
        {activeAppt ? (
          <>
            <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-gradient-to-r from-slate-50 to-white p-3">
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
                  Stays on this appointment in the patient chart. Use it for follow-up reminders, preferences, or anything the next
                  doctor should know—even if they see the patient on a different day.
                </HelpTip>
              </div>
              <textarea
                className="mb-2 h-20 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm"
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
                className="h-20 w-full rounded-lg border border-slate-200 p-2 text-sm"
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
                  clinic price; leave fee override blank unless you need a custom amount.
                </HelpTip>
              </div>
              <p className="mb-2 text-xs text-slate-500">
                The booked visit type is checked first. Add or remove lines for anything else you performed. If something is missing, ask
                admin to mark the service visible to your role in Services &amp; codes.
              </p>
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2">
                {sortedBillServices.map((s) => {
                  const on = isBillServiceChecked(s.id);
                  const line = billLineFor(s.id);
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "rounded-lg border px-2 py-2 transition-colors",
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
                            <span className="text-sm font-medium text-slate-900">{s.name}</span>
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
                              className="w-16 rounded border border-slate-200 bg-white p-1.5 text-sm"
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
                              className="w-full rounded border border-slate-200 bg-white p-1.5 text-sm"
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
              {consultationEstimatedTotal != null && (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-[#16a349]/30 bg-[#f0fdf4] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#0d5c2e]">Estimated total (this visit)</span>
                    <HelpTip label="Estimated total" tone="emerald">
                      Based on checked procedures, units, and fee overrides. Tax may be added on the final invoice after you complete the
                      visit. Use this as a quick check before you send them to pay.
                    </HelpTip>
                  </div>
                  <span className="text-lg font-bold tabular-nums text-slate-900">
                    {consultationEstimatedTotal.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                  </span>
                </div>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Visit notes</p>
              <textarea
                className="h-24 w-full rounded-lg border border-slate-200 p-2 text-sm"
                placeholder="Clinical notes (not printed on patient bill)…"
                value={doctorNotes}
                onChange={(e) => setDoctorNotes(e.target.value)}
              />
            </div>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm">
              <input
                type="checkbox"
                checked={chargeSavedCard}
                onChange={(e) => setChargeSavedCard(e.target.checked)}
                className="mt-0.5"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-slate-800">Try saved card first (fast checkout)</span>
                  <HelpTip label="Saved card" tone="emerald">
                    When checked, the server attempts to charge the card they saved while booking. If that fails or they have no card,
                    you will see other payment options after completing.
                  </HelpTip>
                </span>
                <span className="block text-slate-600">
                  If they added a card when booking, we charge it now so they can leave right away. Uncheck if you want
                  to collect payment at the desk only (card reader or pay screen).
                </span>
              </span>
            </label>
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={completeVisit}
                disabled={isCompleting}
                className="min-w-0 flex-1 rounded-lg bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#13823d] disabled:opacity-50"
              >
                {isCompleting ? "Completing…" : "Complete visit & create invoice"}
              </button>
              <HelpTip label="Complete visit" align="center" tone="emerald">
                Builds the invoice from your checked services. If their saved card pays successfully, the patient bill opens right away.
                Otherwise use the green banner to collect payment — the printable bill unlocks only after payment is complete.
              </HelpTip>
            </div>
            <p className="text-xs text-slate-500">
              The patient bill is not printed until the invoice is paid (card on file, reader, or desk checkout). Use{" "}
              <strong>Print patient bill</strong> on the banner after payment.
            </p>
          </>
        ) : (
          <DoctorEmptyWell
            title="No active visit"
            description="Check in a patient from their row (or they can check in at the kiosk), then tap Start visit. Their chart, services, and notes will open here."
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
              <IconStethoscope className="h-6 w-6" />
            </span>
          </DoctorEmptyWell>
        )}
      </aside>
      {chargeConfirmAppt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="charge-confirm-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 id="charge-confirm-title" className="text-lg font-bold text-slate-900">
              Confirm charge
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Please confirm with <span className="font-semibold text-slate-900">{chargeConfirmAppt.patient}</span> before proceeding.
            </p>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Card on file</span>
                <span className="font-semibold text-slate-900">
                  {chargeConfirmAppt.card_brand || "Card"} ending in {chargeConfirmAppt.card_last4}
                </span>
              </div>
              {consultationEstimatedTotal != null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Estimated charge</span>
                  <span className="text-lg font-bold text-slate-900">
                    {consultationEstimatedTotal.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                  </span>
                </div>
              )}
            </div>
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
              We will charge this card now. Please let the patient know before confirming. The exact amount
              will be based on the final invoice.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setChargeConfirmAppt(null)}
                disabled={isCompleting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setChargeConfirmAppt(null);
                  void doCompleteVisit(false);
                }}
                disabled={isCompleting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Skip card — collect later
              </button>
              <button
                type="button"
                disabled={isCompleting}
                onClick={() => {
                  setChargeConfirmAppt(null);
                  void doCompleteVisit(true);
                }}
                className="rounded-xl bg-[#16a349] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
              >
                {isCompleting ? "Charging…" : "Confirm & charge"}
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
              {rescheduleAppt.patient} — new date and start time. Length stays the same as the booked service.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-semibold text-slate-600">
                Date
                <input
                  type="date"
                  value={resDate}
                  onChange={(e) => setResDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Start time
                <input
                  type="time"
                  value={resTime}
                  onChange={(e) => setResTime(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
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
                disabled={savingDesk || !resDate}
                onClick={() => void submitReschedule()}
                className="rounded-xl bg-[#16a349] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
              >
                {savingDesk ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
      {patientDetailId && (
        <PatientDetailModal patientId={patientDetailId} onClose={() => setPatientDetailId(null)} />
      )}
      </div>
    </div>
  );
}
