"use client";

import { useAppFeedback } from "@/components/app-feedback";
import { DoctorEmptyWell, DoctorPageIntro, DoctorSectionLabel, DoctorStatsRow, doctorGreeting } from "@/components/doctor-shell";
import type { DiagnosisPriorVisitHint } from "@/components/visit-panel/visit-diagnosis-picker";
import dynamic from "next/dynamic";

// --- Dynamic imports ---
// These are large components that are not needed on initial page load:
//  • consultation editor + wide modal — only mounts when a patient is active
//  • modals — only mount when the doctor opens them
//  • Square poller — background process, not part of initial render

const ChartNoteRichEditor = dynamic(
  () =>
    import("@/components/chart-note-rich-editor").then((m) => ({ default: m.ChartNoteRichEditor })),
  { ssr: false },
);

const ChartNoteOpenWideButton = dynamic(
  () =>
    import("@/components/chart-note-wide-modal").then((m) => ({
      default: m.ChartNoteOpenWideButton,
    })),
  { ssr: false },
);

const ChartNoteWideViewModal = dynamic(
  () =>
    import("@/components/chart-note-wide-modal").then((m) => ({
      default: m.ChartNoteWideViewModal,
    })),
  { ssr: false },
);

const BookNextVisitModal = dynamic(
  () =>
    import("@/components/visit-panel/book-next-visit-modal").then((m) => ({
      default: m.BookNextVisitModal,
    })),
  { ssr: false },
);

const RescheduleVisitSlotsModal = dynamic(
  () =>
    import("@/components/visit-panel/reschedule-visit-slots-modal").then((m) => ({
      default: m.RescheduleVisitSlotsModal,
    })),
  { ssr: false },
);

const AdminScheduleCalendar = dynamic(
  () =>
    import("@/components/admin-schedule-calendar").then((m) => ({
      default: m.AdminScheduleCalendar,
    })),
  { ssr: false },
);

const AdminDeskBookFromSlotModal = dynamic(
  () =>
    import("@/components/admin-desk-book-from-slot-modal").then((m) => ({
      default: m.AdminDeskBookFromSlotModal,
    })),
  { ssr: false },
);

const VisitBillingForm = dynamic(
  () =>
    import("@/components/visit-panel/visit-billing-form").then((m) => ({
      default: m.VisitBillingForm,
    })),
  { ssr: false },
);
import { useAppointmentActionConfirm } from "@/hooks/use-appointment-action-confirm";
import { useBookNextVisit } from "@/hooks/use-book-next-visit";
import { useRescheduleVisitSlots } from "@/hooks/use-reschedule-visit-slots";
import {
  confirmBookNextVisit,
  confirmCancelVisit,
  confirmCheckIn,
  confirmDeskBook,
  confirmNoShow,
  confirmOpenBookNextPicker,
  confirmDismissPaymentBanner,
  confirmOpenReschedulePicker,
  confirmRescheduleBySlots,
  confirmStartVisit,
} from "@/lib/appointment-action-confirm-messages";
import type { DeskBookSlotSeed } from "@/components/admin-desk-book-from-slot-modal";
import type { ProviderBlock, ScheduleAppointment } from "@/components/admin-schedule-calendar";
import {
  addDays,
  endOfMonth,
  filterAppointmentsForScheduleGrid,
  mondayOfWeekContaining,
  startOfMonth,
  toIsoDate,
} from "@/lib/admin-schedule-utils";
import {
  computeBillingEstimates,
  sortBillableServices,
  toggleBillLine,
  type VisitBillLine,
} from "@/lib/visit-billing-form-utils";
import {
  diagnosisFingerprint,
  toggleDiagnosisId,
  type DiagnosisCatalogEntry,
} from "@/lib/diagnosis-catalog";
import { HelpTip } from "@/components/help-tip";
import { IconStethoscope } from "@/components/icons";
import { Loader } from "@/components/loader";
const PatientDetailModal = dynamic(
  () =>
    import("@/components/patient-detail-modal").then((m) => ({ default: m.PatientDetailModal })),
  { ssr: false },
);
import { AppointmentStatusBadge, appointmentStatusStripeClass } from "@/components/status-chip";
import { resolveAppointmentUiStatus } from "@/lib/appointment-ui-status";
import { useRecordCashPayment } from "@/components/record-cash-payment-modal";
import { useScheduleAutoRefresh } from "@/hooks/use-schedule-auto-refresh";
import {
  PatientNameWithProfile,
  PatientPaymentProfileSelector,
  type PatientPaymentProfile,
} from "@/components/patient-payment-profile";
import { AppointmentClientReason } from "@/components/visit-panel/appointment-client-reason";
import { VisitPriorChartNotes } from "@/components/visit-panel/visit-prior-chart-notes";
const SquareTerminalCheckoutPoller = dynamic(
  () =>
    import("@/components/square-terminal-checkout").then((m) => ({
      default: m.SquareTerminalCheckoutPoller,
    })),
  { ssr: false },
);
import { ApiError, apiGet, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import { deskCheckInSuccessMessage, postDeskCheckIn } from "@/lib/kiosk-checkin";
const PatientBillPortalModal = dynamic(
  () =>
    import("@/components/patient-bill-portal-modal").then((m) => ({
      default: m.PatientBillPortalModal,
    })),
  { ssr: false },
);
import { EmailBillButton } from "@/components/email-bill-button";
import { emailPatientBillDoctor } from "@/lib/patient-bill-email";
import { usePatientBillEmail } from "@/hooks/use-patient-bill-email";
import type { PatientBillPayload } from "@/lib/patient-bill-print";
import {
  doctorDashboardScheduleListItems,
  sortDoctorDashboardAppointments,
  sortDoctorDashboardAppointmentsMultiDay,
} from "@/lib/doctor-dashboard-schedule-sort";
import {
  appointmentsQueryForDashboardView,
  scheduleRangeLabel,
  shiftScheduleFocus,
  type DoctorDashboardScheduleView,
} from "@/lib/doctor-dashboard-schedule-range";
import { clinicTodayIso, formatMonthDayYear, formatWeekdayMonthDayYear } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  end_time_iso?: string;
  start_time: string;
  end_time: string;
  status: string;
  display_status?: string;
  invoice_kind?: string | null;
  auto_no_show_processed_at?: string | null;
  reason_for_visit: string;
  visit_id?: number | null;
  /** Persistent note on this appointment; visible to other providers on the patient chart. */
  clinical_handoff_notes?: string;
  /** Set when status is awaiting_payment — use Collect payment to reopen the green banner. */
  invoice_id?: number;
  invoice_number?: string;
  invoice_total?: string;
  /** Cash/card recorded so far on this invoice (partial payments). */
  amount_paid?: string;
  /** Still owed on this invoice after prior payments. */
  amount_due?: string;
  card_last4?: string;
  card_brand?: string;
  has_saved_card?: boolean;
  has_chargeable_saved_card?: boolean;
  card_display_only?: boolean;
  patient_payment_profile?: string;
  /** Total unpaid across all open invoices (visit + penalties). */
  patient_balance_due?: string;
};

type PendingPaymentContext = {
  balance_total: string;
  balance_penalties: string;
  has_other_pending: boolean;
  other_invoices: Array<{
    id: number;
    invoice_number: string;
    kind: string;
    kind_label: string;
    total_amount: string;
    /** Remaining balance on this older invoice (after partial payments). */
    amount_due: string;
    appointment_date: string | null;
  }>;
  other_total: string;
  current_amount: string;
  combined_amount: string;
};

function parseMoneyAmount(amount: string | undefined): number {
  const n = parseFloat(amount ?? "0");
  return Number.isFinite(n) ? n : 0;
}

/** Doctor may revise normal visit invoices after completion or while awaiting payment. */
function doctorCanEditVisitBilling(appt: Appointment): boolean {
  if (!appt.visit_id) return false;
  if (appt.invoice_kind === "no_show_fee" || appt.invoice_kind === "late_cancel_fee") return false;
  return appt.status === "awaiting_payment" || appt.status === "completed";
}

function formatMoneyUsd(amount: string | number): string {
  const n = typeof amount === "number" ? amount : parseMoneyAmount(amount);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function DoctorPendingBalanceNotice({
  pending,
  compact = false,
}: {
  pending: PendingPaymentContext;
  compact?: boolean;
}) {
  if (!pending.has_other_pending && parseMoneyAmount(pending.balance_penalties) <= 0.009) {
    return null;
  }
  return (
    <div
      className={cn(
        "rounded-xl border border-amber-300 bg-amber-50/95 text-amber-950",
        compact ? "px-3 py-2 text-xs" : "px-3 py-2.5 text-sm",
      )}
    >
      <p className="font-semibold">
        Prior balance due: {formatMoneyUsd(pending.other_total || pending.balance_penalties)}
      </p>
      {!compact && pending.other_invoices.length > 0 ? (
        <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs">
          {pending.other_invoices.map((inv) => (
            <li key={inv.id}>
              {inv.kind_label} {inv.invoice_number}
              {inv.appointment_date ? ` (${formatMonthDayYear(inv.appointment_date)})` : ""} —{" "}
              {formatMoneyUsd(inv.amount_due ?? inv.total_amount)}
              {parseMoneyAmount(inv.total_amount) > parseMoneyAmount(inv.amount_due ?? inv.total_amount) + 0.009
                ? ` (of ${formatMoneyUsd(inv.total_amount)} total)`
                : ""}
            </li>
          ))}
        </ul>
      ) : null}
      <p className={cn("text-amber-900/90", compact ? "mt-1" : "mt-2 text-xs")}>
        You can collect these with today&apos;s visit when paying (choose &quot;Today + prior fees&quot;) or separately in Admin
        → Billing.
      </p>
    </div>
  );
}

type ServiceOpt = {
  id: number;
  name: string;
  price: string;
  billing_code?: string;
  is_active: boolean;
  /** When false, line is documentation / insurance only — excluded from invoice total. */
  charges_patient?: boolean;
};

type BillLine = VisitBillLine;

/** Detects edits after a successful billing save so we can show "Update invoice" again. */
function billingFormFingerprint(
  lines: BillLine[],
  notes: string,
  diagnosisIds: number[],
  professionalDiscount: string,
  professionalDiscountReason: string,
): string {
  const rows = lines
    .filter((l) => l.service_id)
    .map((l) => `${l.service_id}:${l.quantity}:${l.unit_price.trim()}`)
    .sort()
    .join("|");
  return `${rows}#${notes}#${diagnosisFingerprint(diagnosisIds)}#${professionalDiscount.trim()}#${professionalDiscountReason.trim()}`;
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
  charge_error_message?: string | null;
  payment_intent_id: string | null;
};

type PaymentFollowUp = {
  invoice_id: number;
  invoice_number?: string;
  total_amount?: string;
  amount_paid?: string;
  amount_due?: string;
  invoice_total?: string;
  patient_credit_balance?: string;
  /** Set when the server auto-sent the bill to the desk Terminal — UI polls until paid. */
  terminal_checkout_id?: string | null;
  payment: CompleteVisitPayment;
  pending_payment?: PendingPaymentContext;
  card_last4?: string;
  card_brand?: string;
  has_saved_card?: boolean;
  has_chargeable_saved_card?: boolean;
  card_display_only?: boolean;
};

type SavedCardOnFileHints = {
  card_last4?: string;
  card_brand?: string;
  has_saved_card?: boolean;
  has_chargeable_saved_card?: boolean;
  card_display_only?: boolean;
};

function mergeSavedCardHints(...sources: Array<SavedCardOnFileHints | null | undefined>): SavedCardOnFileHints {
  const last4 = sources.map((s) => (s?.card_last4 ?? "").trim()).find(Boolean) ?? "";
  const brand = sources.map((s) => (s?.card_brand ?? "").trim()).find(Boolean) ?? "";
  const hasChargeable = sources.some((s) => s?.has_chargeable_saved_card);
  const displayOnly = sources.some((s) => s?.card_display_only) || Boolean(last4 && !hasChargeable);
  const hasSaved = sources.some((s) => s?.has_saved_card) || Boolean(last4);
  return {
    card_last4: last4 || undefined,
    card_brand: brand || undefined,
    has_saved_card: hasSaved,
    has_chargeable_saved_card: hasChargeable,
    card_display_only: displayOnly,
  };
}

function appointmentHasChargeableSavedCard(appt: SavedCardOnFileHints): boolean {
  const merged = mergeSavedCardHints(appt);
  return Boolean(merged.has_chargeable_saved_card || (merged.card_last4 && !merged.card_display_only));
}

type PaymentCollectMode = "current" | "all";

export default function DoctorDashboardPage() {
  const { runWithFeedback, toast } = useAppFeedback();
  const { requestConfirm, ConfirmDialog } = useAppointmentActionConfirm();
  const { requestCashAmount, RecordCashPaymentModal } = useRecordCashPayment();
  const todayStr = clinicTodayIso();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<ServiceOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  /** Day view = today only; week/month use scheduleFocusIso for navigation. */
  const [scheduleView, setScheduleView] = useState<DoctorDashboardScheduleView>("day");
  const [scheduleFocusIso, setScheduleFocusIso] = useState(todayStr);
  const [activeAppt, setActiveAppt] = useState<Appointment | null>(null);
  const [doctorNotes, setDoctorNotes] = useState("");
  const [diagnosisCatalog, setDiagnosisCatalog] = useState<DiagnosisCatalogEntry[]>([]);
  const [selectedDiagnosisIds, setSelectedDiagnosisIds] = useState<number[]>([]);
  const [diagnosisPriorVisitHint, setDiagnosisPriorVisitHint] = useState<DiagnosisPriorVisitHint | null>(null);
  const [diagnosisSearch, setDiagnosisSearch] = useState("");
  /** Legacy display string — server builds bill text from diagnosis_ids on save. */
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
  /** Pay only today's visit invoice, or visit + open no-show / late-cancel fees. */
  const [paymentCollectMode, setPaymentCollectMode] = useState<PaymentCollectMode>("current");
  const [chargingSavedCardBanner, setChargingSavedCardBanner] = useState(false);
  const [consultPendingPayment, setConsultPendingPayment] = useState<PendingPaymentContext | null>(null);
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [applyingCredit, setApplyingCredit] = useState(false);
  const [recordingCashPayment, setRecordingCashPayment] = useState(false);
  /** Schedule row: recording cash for a no-show / penalty invoice without opening the payment banner. */
  const [recordingCashAppointmentId, setRecordingCashAppointmentId] = useState<number | null>(null);
  /** Square Terminal API checkout id — we poll until the physical device completes payment. */
  const [squareCheckoutId, setSquareCheckoutId] = useState<string | null>(null);
  /** Avoid duplicate refresh when Terminal poller and invoice poll both see PAID. */
  const paymentHandledForInvoiceRef = useRef<number | null>(null);
  const paymentBannerRef = useRef<HTMLElement | null>(null);
  const [squareTerminalConfig, setSquareTerminalConfig] = useState<SquareTerminalConfig | null>(null);
  const [displayName, setDisplayName] = useState("");
  /** Saved on the appointment row for handoff / next doctor (separate from visit-only notes). */
  const [handoffNotes, setHandoffNotes] = useState("");
  const [savingHandoff, setSavingHandoff] = useState(false);
  const [savingSoapNotes, setSavingSoapNotes] = useState(false);
  const [soapNotesLoaded, setSoapNotesLoaded] = useState(false);
  const [handoffWideOpen, setHandoffWideOpen] = useState(false);
  const [handoffWideEditOpen, setHandoffWideEditOpen] = useState(false);
  const [soapWideOpen, setSoapWideOpen] = useState(false);
  const [soapWideEditOpen, setSoapWideEditOpen] = useState(false);
  const [myProviderId, setMyProviderId] = useState<number | null>(null);
  const [myProviderName, setMyProviderName] = useState("");
  /** List of visits (default) or day/week/month grid to click open slots and book (including recurring). */
  const [scheduleLayout, setScheduleLayout] = useState<"list" | "calendar">("list");
  const [deskBookSeed, setDeskBookSeed] = useState<DeskBookSlotSeed | null>(null);
  const [scheduleBlocks, setScheduleBlocks] = useState<ProviderBlock[]>([]);
  const bookNext = useBookNextVisit({
    todayMinIso: todayStr,
    preferredProviderId: myProviderId,
    useDeskAvailability: true,
    onBooked: () => load(),
    confirmBeforeSubmit: async (ctx) =>
      requestConfirm(
        confirmBookNextVisit(
          ctx.patientLabel,
          ctx.serviceName,
          ctx.dateIso,
          ctx.timeLabel,
          ctx.providerName,
        ),
      ),
  });
  const rescheduleVisit = useRescheduleVisitSlots({
    todayMinIso: todayStr,
    providerId: myProviderId,
    defaultDateIso: scheduleView === "day" ? todayStr : scheduleFocusIso,
    onRescheduled: () => load(),
    confirmBeforeSubmit: async (ctx) =>
      requestConfirm(
        confirmRescheduleBySlots(ctx.patientLabel, ctx.dateIso, ctx.timeLabel),
      ),
  });
  const [savingDesk, setSavingDesk] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [billSearchQuery, setBillSearchQuery] = useState("");
  const [billSearchResults, setBillSearchResults] = useState<Array<{
    invoice_id: number;
    invoice_number: string;
    patient_name: string;
    patient_payment_profile?: string;
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
  /** Completed or awaiting-payment: edit SOAP only (after visit / payment). */
  const [editingSoapAppointmentId, setEditingSoapAppointmentId] = useState<number | null>(null);
  /** After "Update invoice" succeeds — stay open until doctor taps Close (or edits again for another save). */
  const [billingEditJustSaved, setBillingEditJustSaved] = useState(false);
  const billingEditSavedFingerprintRef = useRef<string | null>(null);
  const [consultPortalReady, setConsultPortalReady] = useState(false);

  useEffect(() => {
    setConsultPortalReady(true);
  }, []);

  useEffect(() => {
    setRevisingBillingForAppointmentId(null);
    setEditingSoapAppointmentId(null);
    setBillingEditJustSaved(false);
    billingEditSavedFingerprintRef.current = null;
    setDoctorNotes("");
    setSoapNotesLoaded(false);
    setConsultWorkspaceExpanded(false);
  }, [scheduleView, scheduleFocusIso, todayStr]);

  useEffect(() => {
    if (!billingEditJustSaved) return;
    const saved = billingEditSavedFingerprintRef.current;
    if (saved === null) return;
    const cur = billingFormFingerprint(
      billLines,
      doctorNotes,
      selectedDiagnosisIds,
      professionalDiscount,
      professionalDiscountReason,
    );
    if (cur !== saved) {
      setBillingEditJustSaved(false);
      billingEditSavedFingerprintRef.current = null;
    }
  }, [billingEditJustSaved, billLines, doctorNotes, selectedDiagnosisIds, professionalDiscount, professionalDiscountReason]);

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
    void apiGetAuth<{ provider_id: number; provider_name?: string }>("/doctor/me/")
      .then((r) => {
        setMyProviderId(r.provider_id);
        setMyProviderName((r.provider_name || "").trim());
      })
      .catch(() => {
        setMyProviderId(null);
        setMyProviderName("");
      });
  }, []);

  const scheduleFocusDate = useMemo(
    () => new Date(`${scheduleView === "day" ? todayStr : scheduleFocusIso}T12:00:00`),
    [scheduleView, scheduleFocusIso, todayStr],
  );

  const loadScheduleBlocks = useCallback(async () => {
    if (myProviderId == null) return;
    const focus = scheduleFocusDate;
    let from: string;
    let to: string;
    if (scheduleView === "day") {
      from = toIsoDate(focus);
      to = from;
    } else if (scheduleView === "week") {
      const mon = mondayOfWeekContaining(focus);
      const fri = addDays(mon, 4);
      from = toIsoDate(mon);
      to = toIsoDate(fri);
    } else {
      from = toIsoDate(startOfMonth(focus));
      to = toIsoDate(endOfMonth(focus));
    }
    const blockParams = new URLSearchParams({
      date_from: from,
      date_to: to,
      provider_id: String(myProviderId),
    });
    try {
      const blockList = await apiGetAuth<ProviderBlock[]>(`/provider-unavailability/?${blockParams}`);
      setScheduleBlocks(blockList);
    } catch {
      setScheduleBlocks([]);
    }
  }, [myProviderId, scheduleView, scheduleFocusDate]);

  useEffect(() => {
    if (scheduleLayout !== "calendar") return;
    void loadScheduleBlocks();
  }, [scheduleLayout, loadScheduleBlocks]);

  useEffect(() => {
    if (scheduleLayout !== "calendar") setDeskBookSeed(null);
  }, [scheduleLayout, scheduleView]);

  const providersForCalendar = useMemo(() => {
    if (myProviderId == null) return [];
    return [{ id: myProviderId, provider_name: myProviderName || `Provider ${myProviderId}` }];
  }, [myProviderId, myProviderName]);

  const scheduleGridAppointments = useMemo((): ScheduleAppointment[] => {
    if (myProviderId == null) return [];
    return filterAppointmentsForScheduleGrid(
      appointments.map((a) => ({
        id: a.id,
        patient_name: a.patient,
        provider: myProviderId,
        provider_name: myProviderName,
        service_name: a.service || "Visit",
        appointment_date: a.appointment_date,
        start_time: a.start_time_iso,
        end_time: a.end_time_iso || a.start_time_iso,
        start_time_display: a.start_time,
        end_time_display: a.end_time,
        status: a.status,
        display_status: a.display_status,
        invoice_kind: a.invoice_kind,
        reason_for_visit: a.reason_for_visit,
        patient_payment_profile: a.patient_payment_profile,
      })),
    );
  }, [appointments, myProviderId, myProviderName]);

  useEffect(() => {
    paymentHandledForInvoiceRef.current = null;
    setPaymentCollectMode("current");
  }, [paymentFollowUp?.invoice_id]);

  useEffect(() => {
    const pid = activeAppt?.patient_id;
    if (!pid) {
      setConsultPendingPayment(null);
      return;
    }
    let cancelled = false;
    const q = new URLSearchParams({ patient_id: String(pid) });
    if (paymentFollowUp?.invoice_id) {
      q.set("current_invoice_id", String(paymentFollowUp.invoice_id));
    }
    void apiGetAuth<PendingPaymentContext>(`/doctor/patient_pending_payment/?${q}`)
      .then((ctx) => {
        if (!cancelled) setConsultPendingPayment(ctx);
      })
      .catch(() => {
        if (!cancelled) setConsultPendingPayment(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeAppt?.patient_id, paymentFollowUp?.invoice_id]);

  useEffect(() => {
    if (!paymentFollowUp?.invoice_id) {
      setSquareTerminalConfig(null);
      return;
    }
    let cancelled = false;
    void apiGetAuth<SquareTerminalConfig>("/doctor/square_terminal_config/")
      .catch(() => ({
        location_id: null,
        has_location: false,
        device_id_configured: false,
      }))
      .then((term) => {
        if (!cancelled) setSquareTerminalConfig(term);
      });
    return () => {
      cancelled = true;
    };
  }, [paymentFollowUp?.invoice_id]);

  const activePendingPayment =
    paymentFollowUp?.pending_payment ?? consultPendingPayment ?? null;

  const paymentAmountDue = useMemo(() => {
    if (!paymentFollowUp) return null;
    const pending = paymentFollowUp.pending_payment;
    if (paymentCollectMode === "all" && pending?.has_other_pending) {
      return pending.combined_amount;
    }
    return (
      paymentFollowUp.amount_due ??
      paymentFollowUp.total_amount ??
      pending?.current_amount ??
      null
    );
  }, [paymentFollowUp, paymentCollectMode]);

  const paymentBannerAppointment = useMemo(() => {
    if (!paymentFollowUp?.invoice_id) return null;
    return appointments.find((a) => a.invoice_id === paymentFollowUp.invoice_id) ?? null;
  }, [appointments, paymentFollowUp?.invoice_id]);

  const paymentBannerSavedCard = useMemo(
    () => mergeSavedCardHints(paymentFollowUp, paymentBannerAppointment),
    [paymentFollowUp, paymentBannerAppointment],
  );

  const paymentBannerCanChargeSavedCard = appointmentHasChargeableSavedCard(paymentBannerSavedCard);

  const handlePaymentReceived = useCallback(
    async (invoiceId: number, message = "Payment received.") => {
      if (paymentHandledForInvoiceRef.current === invoiceId) return;
      paymentHandledForInvoiceRef.current = invoiceId;
      toast.success(
        message.includes("—") ? message : `${message} Use Print or Email bill on the green banner when ready.`,
      );
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
      await load();
    },
    // tryOpenPatientBill and load are stable enough for this screen session
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Poll invoice paid status while the green banner is open (Terminal, webhook, or saved card). */
  useEffect(() => {
    const invId = paymentFollowUp?.invoice_id;
    if (!invId || paymentFollowUp?.payment.charged) return;
    const includePending =
      paymentCollectMode === "all" && Boolean(paymentFollowUp.pending_payment?.has_other_pending);
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 180;

    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      if (attempts > maxAttempts) return;
      try {
        const statusQs = new URLSearchParams({ invoice_id: String(invId) });
        if (includePending) statusQs.set("include_pending_fees", "1");
        const st = await apiGetAuth<{ paid: boolean }>(
          `/doctor/invoice_payment_status/?${statusQs}`,
        );
        if (st.paid) {
          await handlePaymentReceived(
            invId,
            includePending
              ? "Payment received (today + prior fees) — schedule updated."
              : "Payment received — schedule updated.",
          );
          return;
        }
      } catch {
        /* retry */
      }
      setTimeout(tick, 2000);
    };

    void tick();
    return () => {
      cancelled = true;
    };
  }, [
    paymentFollowUp?.invoice_id,
    paymentFollowUp?.payment?.charged,
    paymentFollowUp?.pending_payment?.has_other_pending,
    paymentCollectMode,
    handlePaymentReceived,
  ]);

  const firstName = displayName.trim().split(/\s+/)[0] || "there";

  const sortedAppointments = useMemo(() => {
    if (scheduleView === "day") {
      return sortDoctorDashboardAppointments(appointments, todayStr, todayStr);
    }
    return sortDoctorDashboardAppointmentsMultiDay(appointments, todayStr);
  }, [appointments, scheduleView, todayStr]);

  const scheduleListItems = useMemo(
    () => doctorDashboardScheduleListItems(sortedAppointments, todayStr, scheduleView),
    [sortedAppointments, todayStr, scheduleView],
  );

  const dayStats = useMemo(() => {
    const list = appointments;
    return [
      {
        label: "On your schedule",
        value: list.length,
        help:
          scheduleView === "day"
            ? "All of your visits today—not only people who have finished check-in yet."
            : "All visits in the week or month you are viewing.",
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
      {
        label: "No-shows",
        value: list.filter((a) => resolveAppointmentUiStatus(a) === "no_show").length,
        tone: "accent" as const,
        help: "Patient did not attend (including automatic no-shows after the grace period). No-show fee may be on file.",
      },
    ];
  }, [appointments, scheduleView]);

  const resumableConsultationAppt = useMemo(() => {
    const inConsult = appointments.filter(
      (a) => a.status === "in_consultation" && a.appointment_date === todayStr,
    );
    if (inConsult.length === 0) return null;
    if (lastClosedConsultAppointmentId != null) {
      const last = inConsult.find((a) => a.id === lastClosedConsultAppointmentId);
      if (last) return last;
    }
    return inConsult[0];
  }, [appointments, lastClosedConsultAppointmentId]);

  const load = async (opts?: {
    focusAppointmentId?: number;
    skipReconnectBillingEdit?: boolean;
    silent?: boolean;
  }) => {
    if (!opts?.silent) {
      setLoading(true);
      setError("");
    }
    try {
      const query = appointmentsQueryForDashboardView(scheduleView, scheduleFocusIso, todayStr);
      const appts = await apiGetAuth<Appointment[]>(`/doctor/appointments/?${query}`);
      setAppointments(appts);
      const pickActive = (current: Appointment | null) => {
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
        const soapEditId = editingSoapAppointmentId;
        if (soapEditId != null) {
          const soapAppt = appts.find((a) => a.id === soapEditId);
          if (soapAppt) return soapAppt;
        }
        // During a silent background refresh, keep the workspace open if the doctor
        // is actively editing — closing it would discard unsaved SOAP or billing work.
        if (opts?.silent && current != null) {
          if (editingSoapAppointmentId === current.id) {
            const soap = appts.find((a) => a.id === current.id);
            if (soap) return soap;
          }
          if (revisingBillingForAppointmentId === current.id) {
            const rev = appts.find(
              (a) => a.id === current.id && a.status === "awaiting_payment",
            );
            if (rev) return rev;
          }
          const stillActive = appts.find(
            (a) => a.id === current.id && a.status === "in_consultation",
          );
          if (stillActive) return stillActive;
        }
        // Do not auto-pop consultation on dashboard return; doctor chooses when to resume.
        return null;
      };
      setActiveAppt((current) => pickActive(current));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load.");
      setAppointments([]);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  const dashboardShowsToday = useMemo(() => {
    if (scheduleView === "day") return scheduleFocusIso === todayStr;
    if (scheduleView === "week") {
      const d = new Date(`${scheduleFocusIso}T12:00:00`);
      const mon = new Date(d);
      mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const fri = new Date(mon);
      fri.setDate(mon.getDate() + 4);
      const t = new Date(`${todayStr}T12:00:00`);
      return t >= mon && t <= fri;
    }
    const t = new Date(`${todayStr}T12:00:00`);
    const f = new Date(`${scheduleFocusIso}T12:00:00`);
    return t.getFullYear() === f.getFullYear() && t.getMonth() === f.getMonth();
  }, [scheduleView, scheduleFocusIso, todayStr]);

  useScheduleAutoRefresh({
    enabled: dashboardShowsToday,
    refresh: () => load({ silent: true }),
  });

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
  }, [scheduleView, scheduleFocusIso, todayStr]);

  useEffect(() => {
    apiGetAuth<ServiceOpt[]>(`/services/?for_date=${encodeURIComponent(todayStr)}`)
      .then((list) => setServices(list.filter((s) => s.is_active)))
      .catch(() => setServices([]));
  }, [scheduleView, scheduleFocusIso, todayStr]);

  useEffect(() => {
    apiGetAuth<DiagnosisCatalogEntry[]>("/diagnoses/")
      .then((list) => setDiagnosisCatalog(list.filter((d) => d.is_active !== false)))
      .catch(() => setDiagnosisCatalog([]));
  }, []);

  useEffect(() => {
    if (!activeAppt?.id) return;
    if (revisingBillingForAppointmentId === activeAppt.id) {
      return;
    }
    // Post-visit SOAP edit loads notes via openSoapNotesEdit — do not wipe them here.
    if (editingSoapAppointmentId === activeAppt.id) {
      return;
    }
    if (activeAppt.status !== "in_consultation") {
      setDoctorNotes("");
      setSoapNotesLoaded(false);
    }
    setProfessionalDiscount("");
    setProfessionalDiscountReason("");
  }, [
    activeAppt?.id,
    activeAppt?.status,
    revisingBillingForAppointmentId,
    editingSoapAppointmentId,
  ]);

  useEffect(() => {
    if (!activeAppt) {
      setBillLines([]);
      setDiagnosis("");
      setSelectedDiagnosisIds([]);
      setDiagnosisPriorVisitHint(null);
      setDiagnosisSearch("");
      setProfessionalDiscount("");
      setProfessionalDiscountReason("");
      setHandoffNotes("");
      return;
    }
    if (revisingBillingForAppointmentId === activeAppt.id) {
      setHandoffNotes(activeAppt.clinical_handoff_notes ?? "");
      return;
    }
    if (editingSoapAppointmentId === activeAppt.id) {
      return;
    }
    setHandoffNotes(activeAppt.clinical_handoff_notes ?? "");
    if (!activeAppt.booked_service_id) {
      setBillLines([]);
      setDiagnosis("");
      setSelectedDiagnosisIds([]);
      setDiagnosisPriorVisitHint(null);
      setDiagnosisSearch("");
      setProfessionalDiscount("");
      setProfessionalDiscountReason("");
      return;
    }
    setBillLines([{ service_id: activeAppt.booked_service_id, quantity: "1", unit_price: "" }]);
    setDiagnosis("");
    setDiagnosisSearch("");
    setProfessionalDiscount("");
    setProfessionalDiscountReason("");

    if (activeAppt.status !== "in_consultation") {
      setSelectedDiagnosisIds([]);
      setDiagnosisPriorVisitHint(null);
      return;
    }

    let cancelled = false;
    setSoapNotesLoaded(false);
    void apiGetAuth<{
      diagnosis_ids: number[];
      prefilled_from_prior: boolean;
      prior_visit: DiagnosisPriorVisitHint | null;
      doctor_notes?: string;
    }>(`/doctor/${activeAppt.id}/consultation_diagnoses/`)
      .then((data) => {
        if (cancelled) return;
        setSelectedDiagnosisIds(data.diagnosis_ids ?? []);
        setDiagnosisPriorVisitHint(
          data.prefilled_from_prior && data.prior_visit ? data.prior_visit : null,
        );
        setDoctorNotes(data.doctor_notes ?? "");
        setSoapNotesLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedDiagnosisIds([]);
          setDiagnosisPriorVisitHint(null);
          setDoctorNotes("");
          setSoapNotesLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeAppt?.id,
    activeAppt?.booked_service_id,
    activeAppt?.clinical_handoff_notes,
    activeAppt?.status,
    revisingBillingForAppointmentId,
    editingSoapAppointmentId,
  ]);

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
          loadingMessage: "Saving reminders…",
          successMessage: "Reminders & handoff saved — visible on this patient’s next visits.",
          errorFallback: "Could not save reminders & handoff.",
        },
      );
    } finally {
      setSavingHandoff(false);
    }
  };

  const isEditingSoapOnly =
    editingSoapAppointmentId != null &&
    activeAppt != null &&
    editingSoapAppointmentId === activeAppt.id;

  const saveSoapNotes = async () => {
    if (!activeAppt) return;
    setSavingSoapNotes(true);
    try {
      await runWithFeedback(
        async () => {
          await apiPatch("/doctor/appointment_soap_notes/", {
            appointment_id: activeAppt.id,
            doctor_notes: doctorNotes,
          });
        },
        {
          loadingMessage: "Saving consultation notes…",
          successMessage: isEditingSoapOnly
            ? "SOAP notes saved."
            : "SOAP notes saved — you can keep editing until you complete the visit.",
          errorFallback: "Could not save consultation notes.",
        },
      );
    } finally {
      setSavingSoapNotes(false);
    }
  };

  const openSoapNotesEdit = async (appt: Appointment) => {
    await runWithFeedback(
      async () => {
        const data = await apiGetAuth<{ doctor_notes: string }>(`/doctor/${appt.id}/visit_soap_notes/`);
        setRevisingBillingForAppointmentId(null);
        setBillingEditJustSaved(false);
        billingEditSavedFingerprintRef.current = null;
        setEditingSoapAppointmentId(appt.id);
        setActiveAppt(appt);
        setDoctorNotes(data.doctor_notes ?? "");
        setSoapNotesLoaded(true);
        setSoapWideOpen(false);
        setSoapWideEditOpen(false);
        setConsultWorkspaceExpanded(true);
      },
      {
        loadingMessage: "Loading consultation notes…",
        successMessage: "You can update SOAP notes and save as often as you need.",
        errorFallback: "Could not open consultation notes for editing.",
      },
    );
  };

  const closeSoapNotesEdit = () => {
    setEditingSoapAppointmentId(null);
    setDoctorNotes("");
    setSoapNotesLoaded(false);
    setSoapWideOpen(false);
    setSoapWideEditOpen(false);
    setConsultWorkspaceExpanded(false);
    setActiveAppt(null);
  };

  const startVisit = async (appt: Appointment) => {
    const ok = await requestConfirm(confirmStartVisit(appt.patient));
    if (!ok) return;
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
          diagnosis_ids?: number[];
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
        setEditingSoapAppointmentId(null);
        setConsultWorkspaceExpanded(true);
        setActiveAppt(appt);
        setDoctorNotes(data.doctor_notes ?? "");
        setSoapNotesLoaded(true);
        setDiagnosis(data.diagnosis ?? "");
        setSelectedDiagnosisIds(data.diagnosis_ids ?? []);
        setDiagnosisPriorVisitHint(null);
        setDiagnosisSearch("");
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
    setSelectedDiagnosisIds([]);
    setDiagnosisPriorVisitHint(null);
    setDiagnosisSearch("");
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
          terminal_checkout_id?: string | null;
          payment: CompleteVisitPayment;
          pending_payment?: PendingPaymentContext;
          card_last4?: string;
          card_brand?: string;
          has_saved_card?: boolean;
          has_chargeable_saved_card?: boolean;
          card_display_only?: boolean;
        }>(endpoint, {
          doctor_notes: doctorNotes,
          diagnosis_ids: selectedDiagnosisIds,
          rendered_services: rendered,
          professional_discount: professionalDiscount.trim() || "0",
          professional_discount_reason: professionalDiscountReason.trim(),
          charge_saved_card_if_present: shouldChargeSavedCard,
        });
        setPaymentFollowUp({
          invoice_id: result.invoice_id,
          invoice_number: result.invoice_number,
          total_amount: result.total_amount,
          patient_credit_balance: result.patient_credit_balance,
          terminal_checkout_id: result.terminal_checkout_id,
          payment: result.payment,
          pending_payment: result.pending_payment,
          ...mergeSavedCardHints(result, activeAppt),
        });
        setPaymentCollectMode("current");
        const terminalId = result.terminal_checkout_id ?? null;
        setSquareCheckoutId(terminalId);
        window.setTimeout(() => scrollToPaymentBanner(), isRevisingAwaitingPayment ? 150 : 200);

        if (isRevisingAwaitingPayment) {
          billingEditSavedFingerprintRef.current = billingFormFingerprint(
            billLines,
            doctorNotes,
            selectedDiagnosisIds,
            professionalDiscount,
            professionalDiscountReason,
          );
          await load();
          if (options?.autoTerminal && !result.payment.charged && result.invoice_id && !terminalId) {
            try {
              await createTerminalCheckout(result.invoice_id, false);
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
        setSelectedDiagnosisIds([]);
        setDiagnosisPriorVisitHint(null);
        setDiagnosisSearch("");
        setProfessionalDiscount("");
        setProfessionalDiscountReason("");
        setBillLines([]);
        await load({ skipReconnectBillingEdit: true });
        if (options?.autoTerminal && !result.payment.charged && result.invoice_id && !terminalId) {
          try {
            await createTerminalCheckout(result.invoice_id, false);
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
              ? "Visit completed — payment received. Use Print or Email bill on the green banner when ready."
              : "Visit completed — collect payment, then use Print or Email bill on the green banner.",
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
    if (appointmentHasChargeableSavedCard(activeAppt)) {
      setPaymentConfirmOpen(true);
      return;
    }
    await doCompleteVisit(false);
  };

  const closeConsultWorkspace = () => {
    setPaymentConfirmOpen(false);
    if (editingSoapAppointmentId != null) {
      closeSoapNotesEdit();
      return;
    }
    setConsultWorkspaceExpanded(false);
    if (activeAppt?.status === "in_consultation") {
      setLastClosedConsultAppointmentId(activeAppt.id);
    }
    setActiveAppt(null);
  };

  const checkInPatient = async (appt: Appointment) => {
    const ok = await requestConfirm(confirmCheckIn(appt.patient));
    if (!ok) return;
    setIsCheckingIn(true);
    await runWithFeedback(
      async () => {
        const out = await postDeskCheckIn(appt.id);
        await load();
        return out;
      },
      {
        loadingMessage: "Completing check-in…",
        successMessage: (out) =>
          deskCheckInSuccessMessage(
            out,
            `${appt.patient} — check-in complete. You can start the visit now.`,
          ),
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

  const createTerminalCheckout = async (invoiceId: number, includePendingFees: boolean) => {
    const out = await apiPost<{ checkout_id: string; status: string }>("/doctor/terminal_checkout/", {
      invoice_id: invoiceId,
      include_pending_fees: includePendingFees,
    });
    setSquareCheckoutId(out.checkout_id);
    return out.checkout_id;
  };

  const prepareTerminalPayment = async () => {
    if (!paymentFollowUp) return;
    const includePending =
      paymentCollectMode === "all" && Boolean(paymentFollowUp.pending_payment?.has_other_pending);
    setTerminalBusy(true);
    setError("");
    await runWithFeedback(
      async () => {
        await createTerminalCheckout(paymentFollowUp.invoice_id, includePending);
      },
      {
        loadingMessage: includePending ? "Preparing reader (today + prior fees)…" : "Preparing card reader…",
        successMessage: includePending
          ? "Reader ready — total includes today’s visit and prior fees."
          : "Reader ready — follow the prompts on the terminal.",
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

  const recordCashPayment = async () => {
    if (!paymentFollowUp) return;
    const pending = paymentFollowUp.pending_payment;
    const payAll = paymentCollectMode === "all" && Boolean(pending?.has_other_pending);

    if (payAll) {
      const amount = pending?.combined_amount;
      if (!amount || parseMoneyAmount(amount) <= 0) {
        toast.error("Invoice amount not available. Use the Admin → Billing page to record this payment.");
        return;
      }
      if (
        !window.confirm(
          `Record cash payment of ${formatMoneyUsd(amount)} (today's visit + prior fees) and mark all related invoices paid?`,
        )
      ) {
        return;
      }
      setRecordingCashPayment(true);
      await runWithFeedback(
        async () => {
          const invoiceIds = [
            paymentFollowUp.invoice_id,
            ...(pending?.other_invoices.map((i) => i.id) ?? []),
          ];
          for (const invId of invoiceIds) {
            let lineAmount: string | undefined;
            if (invId === paymentFollowUp.invoice_id) {
              lineAmount = paymentFollowUp.amount_due ?? paymentFollowUp.total_amount;
            } else {
              const other = pending?.other_invoices.find((i) => i.id === invId);
              lineAmount = other?.amount_due ?? other?.total_amount;
            }
            if (!lineAmount || parseMoneyAmount(lineAmount) <= 0) {
              continue;
            }
            await apiPost(`/invoices/${invId}/pay/`, {
              amount: lineAmount,
              payment_method: "cash",
              payment_reference: "doctor_cash_bundle",
            });
          }
          setPaymentFollowUp((prev) =>
            prev ? { ...prev, payment: { ...prev.payment, charged: true, status: "paid_cash" } } : prev,
          );
          await load();
        },
        {
          loadingMessage: "Recording cash payment…",
          successMessage: "Cash recorded — today’s visit and prior fees marked paid.",
          errorFallback: "Could not record payment. Try again.",
        },
      );
      setRecordingCashPayment(false);
      return;
    }

    const amountDue = paymentFollowUp.amount_due ?? paymentFollowUp.total_amount;
    if (!amountDue || parseMoneyAmount(amountDue) <= 0) {
      toast.error("This invoice is already paid in full.");
      return;
    }
    const cashAmount = await requestCashAmount({
      invoiceTotal: paymentFollowUp.invoice_total ?? paymentFollowUp.total_amount ?? amountDue,
      amountPaid: paymentFollowUp.amount_paid,
      amountDue,
      subtitle: activeAppt?.patient,
    });
    if (!cashAmount) {
      return;
    }
    setRecordingCashPayment(true);
    await runWithFeedback(
      async () => {
        const out = await apiPost<{
          fully_paid?: boolean;
          amount_due?: string;
          amount_paid?: string;
          invoice_total?: string;
        }>(`/invoices/${paymentFollowUp.invoice_id}/pay/`, {
          amount: cashAmount,
          payment_method: "cash",
          payment_reference: "",
        });
        if (out.fully_paid) {
          setPaymentFollowUp((prev) =>
            prev ? { ...prev, payment: { ...prev.payment, charged: true, status: "paid_cash" } } : prev,
          );
        } else {
          setPaymentFollowUp((prev) =>
            prev
              ? {
                  ...prev,
                  amount_paid: out.amount_paid,
                  amount_due: out.amount_due,
                  invoice_total: out.invoice_total ?? prev.invoice_total,
                  total_amount: out.amount_due ?? prev.total_amount,
                }
              : prev,
          );
        }
        await load();
        return out;
      },
      {
        loadingMessage: "Recording cash payment…",
        successMessage: (out) =>
          out?.fully_paid
            ? "Cash recorded — invoice paid in full."
            : `Cash recorded — $${out?.amount_due ?? amountDue} still due on this invoice.`,
        errorFallback: "Could not record payment. Try again.",
      },
    );
    setRecordingCashPayment(false);
  };

  /** Record cash on the schedule row (no-show fee or visit invoice) — supports partial payments. */
  const recordCashForAppointment = async (appt: Appointment) => {
    if (!appt.invoice_id) {
      toast.error("No unpaid invoice on file for this visit yet.");
      return;
    }
    const amountDue = appt.amount_due ?? appt.invoice_total;
    if (!amountDue || parseMoneyAmount(amountDue) <= 0) {
      toast.error("This invoice is already paid in full.");
      return;
    }
    const cashAmount = await requestCashAmount({
      invoiceTotal: appt.invoice_total ?? amountDue,
      amountPaid: appt.amount_paid,
      amountDue,
      subtitle:
        appt.invoice_kind === "no_show_fee" || appt.status === "no_show"
          ? `No-show fee — ${appt.patient}`
          : appt.patient,
    });
    if (!cashAmount) {
      return;
    }
    setRecordingCashAppointmentId(appt.id);
    await runWithFeedback(
      async () => {
        const out = await apiPost<{
          fully_paid?: boolean;
          amount_due?: string;
          amount_paid?: string;
        }>(`/invoices/${appt.invoice_id}/pay/`, {
          amount: cashAmount,
          payment_method: "cash",
          payment_reference: "",
        });
        if (out.fully_paid && paymentFollowUp?.invoice_id === appt.invoice_id) {
          setPaymentFollowUp((prev) =>
            prev ? { ...prev, payment: { ...prev.payment, charged: true, status: "paid_cash" } } : prev,
          );
        }
        await load();
        return out;
      },
      {
        loadingMessage: "Recording cash payment…",
        successMessage: (out) =>
          out?.fully_paid
            ? "Cash recorded — invoice paid in full."
            : `Cash recorded — $${out?.amount_due ?? amountDue} still due on this invoice.`,
        errorFallback: "Could not record cash payment. Try again.",
      },
    );
    setRecordingCashAppointmentId(null);
  };

  const sortedBillServices = useMemo(
    () => sortBillableServices(services, activeAppt?.booked_service_id ?? null),
    [services, activeAppt?.booked_service_id],
  );

  const {
    estimatedSubtotal: consultationEstimatedSubtotal,
    discountAmount: consultationDiscountAmount,
    estimatedAfterDiscount: consultationEstimatedTotal,
  } = useMemo(
    () => computeBillingEstimates(billLines, services, professionalDiscount),
    [billLines, services, professionalDiscount],
  );

  const [printingBill, setPrintingBill] = useState(false);
  const [previewingBill, setPreviewingBill] = useState(false);
  const [patientBillModal, setPatientBillModal] = useState<PatientBillPayload | null>(null);
  const billEmail = usePatientBillEmail(emailPatientBillDoctor);

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
            if (!opts?.quiet) toast.success("Patient bill opened — tap Print or Email when ready.");
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

  /** Ask the server to match this invoice against Square (fixes stuck awaiting_payment after Terminal paid). */
  const checkSquarePaymentForAppointment = async (appt: Appointment) => {
    if (!appt.invoice_id) {
      toast.error("No invoice on file for this visit yet.");
      return;
    }
    await runWithFeedback(
      async () => {
        const out = await apiPost<{ paid: boolean; detail: string }>("/doctor/sync-invoice-payment/", {
          invoice_id: appt.invoice_id,
        });
        await load();
        return out;
      },
      {
        loadingMessage: "Checking Square…",
        successMessage: (o) => o?.detail ?? "Done.",
        errorFallback: "Could not check Square for payment.",
      },
    );
  };

  const scrollToPaymentBanner = useCallback(() => {
    const run = () => {
      paymentBannerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }, []);

  const dismissPaymentBanner = async () => {
    if (!paymentFollowUp) return;
    const ok = await requestConfirm(confirmDismissPaymentBanner());
    if (!ok) return;
    setPaymentFollowUp(null);
    setSquareCheckoutId(null);
    toast.info("Payment banner hidden. Tap Collect payment on the visit when you are ready.");
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
          pending_payment?: PendingPaymentContext;
          card_last4?: string;
          card_brand?: string;
          has_saved_card?: boolean;
          has_chargeable_saved_card?: boolean;
          card_display_only?: boolean;
        }>("/doctor/prepare_invoice_payment/", {
          appointment_id: appt.id,
          try_saved_card: opts?.trySavedCard ?? false,
        });
        if (out.already_paid && out.payment.charged) {
          await load();
          return out;
        }
        setPaymentFollowUp({
          invoice_id: out.invoice_id,
          invoice_number: out.invoice_number,
          total_amount: out.total_amount,
          patient_credit_balance: out.patient_credit_balance,
          payment: out.payment,
          pending_payment: out.pending_payment,
          ...mergeSavedCardHints(out, appt),
        });
        setPaymentCollectMode("current");
        setSquareCheckoutId(null);
        window.setTimeout(() => scrollToPaymentBanner(), 120);
        return out;
      },
      {
        loadingMessage: "Loading payment options…",
        successMessage: (o) =>
          o?.already_paid
            ? "Already paid — schedule refreshed. Use Print or Email bill on the banner when ready."
            : "",
        errorFallback: "Could not load payment options.",
      },
    );
  };

  const chargeSavedCardOnBanner = async () => {
    if (!paymentFollowUp || paymentFollowUp.payment.charged) return;
    if (!paymentBannerCanChargeSavedCard) return;
    const ok = await requestConfirm({
      title: "Charge saved card?",
      description: `Charge the saved card on file for invoice ${paymentFollowUp.invoice_number ?? paymentFollowUp.invoice_id}?\n\nAmount due: ${formatMoneyUsd(paymentFollowUp.amount_due ?? paymentFollowUp.total_amount ?? "0")}\n\nOnly continue if the patient agreed to this charge.`,
      confirmLabel: "Charge card",
      tone: "default",
    });
    if (!ok) return;
    setChargingSavedCardBanner(true);
    await runWithFeedback(
      async () => {
        const out = await apiPost<{ detail: string; charged?: boolean }>("/doctor/charge-saved-card/", {
          invoice_id: paymentFollowUp.invoice_id,
        });
        setPaymentFollowUp((prev) =>
          prev
            ? {
                ...prev,
                payment: {
                  ...prev.payment,
                  charged: true,
                  status: "charged_saved_card",
                  charge_error: null,
                  charge_error_message: null,
                },
              }
            : prev,
        );
        await load();
        return out;
      },
      {
        loadingMessage: "Charging saved card…",
        successMessage: (o) => o?.detail ?? "Card charged — invoice paid.",
        errorFallback: "Could not charge the saved card.",
      },
    );
    setChargingSavedCardBanner(false);
  };

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

  const openReschedule = async (appt: Appointment) => {
    const ok = await requestConfirm(confirmOpenReschedulePicker(appt.patient));
    if (!ok) return;
    rescheduleVisit.open({
      id: appt.id,
      patientLabel: appt.patient,
      appointmentDate: appt.appointment_date,
      startTimeDisplay: appt.start_time,
      endTimeDisplay: appt.end_time,
      serviceLabel: appt.service,
      bookedServiceId: appt.booked_service_id,
      startTimeIso: appt.start_time_iso,
    });
  };

  const openBookNext = async (appt: Appointment) => {
    const ok = await requestConfirm(confirmOpenBookNextPicker(appt.patient));
    if (!ok) return;
    bookNext.open(
      {
        id: appt.id,
        patientLabel: appt.patient,
        appointmentDate: appt.appointment_date,
        bookedServiceId: appt.booked_service_id,
      },
      { initialDate: scheduleFocusIso >= todayStr ? scheduleFocusIso : todayStr },
    );
  };

  /** Shared consultation UI — `spacious` uses larger fields and scroll area (full workspace overlay). */
  const renderConsultationForm = (spacious: boolean) => {
    if (!activeAppt) return null;
    const isRevisingBilling =
      revisingBillingForAppointmentId != null && revisingBillingForAppointmentId === activeAppt.id;
    const billingEditShowCloseOnly = isRevisingBilling && billingEditJustSaved;
    const scrollToConsultSection = (sectionId: string) => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const consultNavItems = isEditingSoapOnly
      ? ([{ id: "consult-soap", label: "SOAP notes" }] as const)
      : ([
          { id: "consult-chart", label: "Chart notes" },
          { id: "consult-diagnosis", label: "Diagnosis" },
          { id: "consult-procedures", label: "Procedures" },
          { id: "consult-finish", label: "Finish" },
        ] as const);
    const showSoapInBillingForm = isRevisingBilling;

    return (
      <>
        {spacious ? (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#166534]">
                {isEditingSoapOnly
                  ? "Edit consultation notes (SOAP)"
                  : isRevisingBilling
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
            <p className="font-semibold text-slate-900">
              <PatientNameWithProfile name={activeAppt.patient} profile={activeAppt.patient_payment_profile} />
            </p>
            <p className="text-xs text-slate-500">Patient #{activeAppt.patient_id}</p>
          </div>
        </div>
        <PatientPaymentProfileSelector
          patientId={activeAppt.patient_id}
          value={(activeAppt.patient_payment_profile || "") as PatientPaymentProfile}
          intakeSavePath="/doctor/patient_intake/"
          onSaved={(profile) => {
            const patch = { patient_payment_profile: profile };
            setAppointments((list) =>
              list.map((a) => (a.patient_id === activeAppt.patient_id ? { ...a, ...patch } : a)),
            );
          }}
        />
        {activePendingPayment ? (
          <div className="mb-1">
            <DoctorPendingBalanceNotice pending={activePendingPayment} />
          </div>
        ) : null}
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#166534]">Booked for this visit</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">{activeAppt.service || "—"}</p>
          <p className="mt-1 text-xs text-slate-600">
            {activeAppt.start_time} – {activeAppt.end_time} · The procedure list below includes this visit type first, then your
            role&apos;s billable codes for this calendar day.
          </p>
        </div>
        <nav
          className="sticky top-0 z-10 -mx-0.5 mb-3 flex flex-wrap gap-1.5 rounded-xl border border-slate-200/90 bg-white/95 px-2 py-2 shadow-sm backdrop-blur-sm"
          aria-label="Jump to section in this visit"
        >
          {consultNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollToConsultSection(item.id)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-[#16a349]/40 hover:bg-[#ecfdf5] hover:text-[#0d5c2e]"
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Reason for visit</p>
          {activeAppt.reason_for_visit?.trim() ? (
            <AppointmentClientReason reason={activeAppt.reason_for_visit} />
          ) : (
            <p className="text-sm text-slate-700">
              Not recorded yet — the patient may add a reason when booking online, or note details in consultation (SOAP)
              notes in the chart section below.
            </p>
          )}
        </div>
        <VisitPriorChartNotes appointmentId={activeAppt.id} className="mb-3" />
        {!isRevisingBilling ? (
          <div
            id={isEditingSoapOnly ? "consult-soap" : "consult-chart"}
            className="scroll-mt-24 space-y-4 rounded-xl border border-sky-200/70 bg-sky-50/50 p-3 sm:p-4"
          >
            {!isEditingSoapOnly ? (
              <>
            <p className="text-[11px] font-bold uppercase tracking-wide text-sky-900">Chart notes for this visit</p>
            <p className="text-xs leading-relaxed text-sky-950/85">
              Save as you go — notes are stored on the server before you complete the visit. Handoff is for the{" "}
              <span className="font-medium">next</span> appointment; SOAP is your exam documentation (not on the patient bill).
            </p>

            <div id="consult-handoff" className="scroll-mt-24 rounded-lg border border-sky-200/80 bg-white/70 p-3">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Visit reminders & handoff
                  </p>
                  <HelpTip label="Visit reminders & handoff" tone="emerald">
                    For the next visit — birthday cards, preferences, or what the next doctor should check.
                  </HelpTip>
                </div>
                <ChartNoteOpenWideButton
                  onClick={() => {
                    setHandoffWideEditOpen(!handoffNotes.trim());
                    setHandoffWideOpen(true);
                  }}
                />
              </div>
              <ChartNoteRichEditor
                value={handoffNotes}
                onChange={setHandoffNotes}
                className={spacious ? "text-base" : "text-sm"}
                minHeightClassName={spacious ? "min-h-[4.5rem]" : "min-h-[4rem]"}
                disabled={savingHandoff}
              />
              <button
                type="button"
                disabled={savingHandoff}
                onClick={() => void saveHandoffNote()}
                className="mt-2 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-950 shadow-sm hover:bg-sky-100 disabled:opacity-50"
              >
                {savingHandoff ? "Saving…" : "Save reminders & handoff"}
              </button>
            </div>
              </>
            ) : (
              <p className="text-xs leading-relaxed text-sky-950/85">
                Update exam documentation for this visit. Saving does not change billing or payment — only the SOAP notes
                on the chart.
              </p>
            )}

            <div id={isEditingSoapOnly ? undefined : "consult-soap"} className="scroll-mt-24 rounded-lg border border-violet-200/80 bg-white/70 p-3">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Consultation notes (SOAP)
                  </p>
                  <HelpTip label="Consultation notes (SOAP)" tone="emerald">
                    {isEditingSoapOnly
                      ? "You can edit and save again anytime — useful after payment if you could not finish notes during the visit."
                      : "Exam documentation for this visit. Tap Save often — you do not have to wait until Complete visit."}
                  </HelpTip>
                </div>
                <ChartNoteOpenWideButton
                  onClick={() => {
                    setSoapWideEditOpen(true);
                    setSoapWideOpen(true);
                  }}
                />
              </div>
              {!soapNotesLoaded ? (
                <p className="text-sm text-slate-500">Loading saved notes…</p>
              ) : (
                <>
                  <ChartNoteRichEditor
                    value={doctorNotes}
                    onChange={setDoctorNotes}
                    className={spacious ? "text-base" : "text-sm"}
                    minHeightClassName={spacious ? "min-h-[6rem]" : "min-h-[5.5rem]"}
                    disabled={savingSoapNotes || isCompleting}
                  />
                  <button
                    type="button"
                    disabled={savingSoapNotes || isCompleting}
                    onClick={() => void saveSoapNotes()}
                    className="mt-2 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-950 shadow-sm hover:bg-violet-100 disabled:opacity-50"
                  >
                    {savingSoapNotes ? "Saving…" : "Save SOAP notes"}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null}
        {isEditingSoapOnly ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              disabled={savingSoapNotes}
              onClick={() => void saveSoapNotes()}
              className="min-h-11 rounded-xl bg-[#16a349] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
            >
              {savingSoapNotes ? "Saving…" : "Save SOAP notes"}
            </button>
            <button
              type="button"
              onClick={closeSoapNotesEdit}
              className="min-h-11 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        ) : null}
        {!isEditingSoapOnly ? (
        <VisitBillingForm
          spacious={spacious}
          discountLayout="embedded"
          showDiscountFields={false}
          diagnosis={diagnosis}
          onDiagnosisChange={setDiagnosis}
          diagnosisCatalog={diagnosisCatalog}
          selectedDiagnosisIds={selectedDiagnosisIds}
          onToggleDiagnosis={(id) => setSelectedDiagnosisIds((prev) => toggleDiagnosisId(prev, id))}
          diagnosisSearchQuery={diagnosisSearch}
          onDiagnosisSearchQueryChange={setDiagnosisSearch}
          diagnosisPriorVisitHint={diagnosisPriorVisitHint}
          doctorNotes={doctorNotes}
          onDoctorNotesChange={setDoctorNotes}
          showVisitNotes={showSoapInBillingForm}
          professionalDiscount={professionalDiscount}
          onProfessionalDiscountChange={setProfessionalDiscount}
          professionalDiscountReason={professionalDiscountReason}
          onProfessionalDiscountReasonChange={setProfessionalDiscountReason}
          services={services}
          sortedServices={sortedBillServices}
          billLines={billLines}
          onToggleService={(id) => setBillLines((rows) => toggleBillLine(rows, id))}
          onUpdateLine={(serviceId, patch) =>
            setBillLines((rows) => rows.map((r) => (r.service_id === serviceId ? { ...r, ...patch } : r)))
          }
          diagnosisSectionId="consult-diagnosis"
          proceduresSectionId="consult-procedures"
          notesSectionId={showSoapInBillingForm ? "consult-notes" : undefined}
          onOpenSoapWideView={
            showSoapInBillingForm
              ? () => {
                  setSoapWideEditOpen(true);
                  setSoapWideOpen(true);
                }
              : undefined
          }
          soapNotesDisabled={isCompleting}
          proceduresHelpLabel="Patient bill lines"
          proceduresHelpContent={
            <>
              You see active services allowed for your role (chiropractic vs massage), plus any visit types booked for you on this
              calendar day so the patient&apos;s scheduled service is never missing. Check each line that applies. Units multiply the
              clinic price; leave fee override blank unless you need a custom amount. Lines flagged as insurance-only (no patient charge)
              still print on the bill for CPT but do not add to the amount due.
            </>
          }
          proceduresIntro={
            isRevisingBilling ? (
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
            )
          }
        />
        ) : null}
        {!isEditingSoapOnly ? (
        <p id="consult-finish" className="scroll-mt-24 rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
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
        ) : null}
        {!isEditingSoapOnly ? (
        <>
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
        ) : null}
        <ChartNoteWideViewModal
          open={handoffWideOpen}
          onClose={() => setHandoffWideOpen(false)}
          value={handoffNotes}
          title="Visit reminders & handoff"
          editable
          editOpen={handoffWideEditOpen}
          onEditOpenChange={setHandoffWideEditOpen}
          onChange={setHandoffNotes}
          onSave={() => void saveHandoffNote()}
          saving={savingHandoff}
        />
        <ChartNoteWideViewModal
          open={soapWideOpen}
          onClose={() => {
            setSoapWideOpen(false);
            setSoapWideEditOpen(false);
          }}
          value={doctorNotes}
          title="Consultation notes (SOAP)"
          editable
          editOpen={soapWideEditOpen}
          onEditOpenChange={setSoapWideEditOpen}
          onChange={setDoctorNotes}
          onSave={() => void saveSoapNotes()}
          saving={savingSoapNotes}
          saveLabel="Save SOAP notes"
        />
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
        <section
          ref={paymentBannerRef}
          id="doctor-payment-banner"
          className="doctor-panel scroll-mt-20 border-[#16a349]/25 bg-gradient-to-br from-[#f0fdf4] via-white to-white shadow-md shadow-emerald-900/5 lg:col-span-2"
        >
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
                {paymentAmountDue != null && ` · ${formatMoneyUsd(paymentAmountDue)} due`}
                {paymentCollectMode === "current" && paymentFollowUp.total_amount != null
                  ? ` (today: ${formatMoneyUsd(paymentFollowUp.total_amount)})`
                  : null}
              </p>
              {paymentFollowUp.pending_payment?.has_other_pending && !paymentFollowUp.payment.charged ? (
                <div className="mt-3 space-y-2">
                  <DoctorPendingBalanceNotice pending={paymentFollowUp.pending_payment} compact />
                  <fieldset className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2.5">
                    <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      What to collect now
                    </legend>
                    <div className="mt-1 space-y-2">
                      <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                        <input
                          type="radio"
                          name="payment-collect-mode"
                          checked={paymentCollectMode === "current"}
                          onChange={() => setPaymentCollectMode("current")}
                          className="mt-1"
                        />
                        <span>
                          <strong>Current bill only</strong> — today&apos;s visit:{" "}
                          {formatMoneyUsd(
                            paymentFollowUp.amount_due ??
                              paymentFollowUp.pending_payment.current_amount ??
                              paymentFollowUp.total_amount ??
                              "0",
                          )}
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                        <input
                          type="radio"
                          name="payment-collect-mode"
                          checked={paymentCollectMode === "all"}
                          onChange={() => setPaymentCollectMode("all")}
                          className="mt-1"
                        />
                        <span>
                          <strong>Current bill + outstanding</strong> — today plus prior no-show / late-cancel
                          balances: {formatMoneyUsd(paymentFollowUp.pending_payment.combined_amount)}
                        </span>
                      </label>
                    </div>
                  </fieldset>
                </div>
              ) : null}
              {paymentFollowUp.patient_credit_balance != null && (
                <p className="mt-1 text-sm text-slate-600">
                  Patient credit available: <span className="font-semibold">${paymentFollowUp.patient_credit_balance}</span>
                </p>
              )}
              {!paymentFollowUp.payment.charged && paymentBannerSavedCard.has_saved_card ? (
                <div className="mt-4 rounded-xl border border-[#16a349]/30 bg-white/90 p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-[#0f766e]">Card on file</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {paymentBannerSavedCard.card_brand || "Card"}
                        {paymentBannerSavedCard.card_last4 ? ` · •••• ${paymentBannerSavedCard.card_last4}` : ""}
                      </p>
                      {paymentBannerCanChargeSavedCard ? (
                        <p className="mt-1 text-xs text-slate-600">
                          Charge the saved card after you confirm the amount with the patient.
                        </p>
                      ) : null}
                    </div>
                    {paymentBannerCanChargeSavedCard ? (
                      <button
                        type="button"
                        onClick={() => void chargeSavedCardOnBanner()}
                        disabled={chargingSavedCardBanner}
                        className="rounded-xl bg-[#16a349] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
                      >
                        {chargingSavedCardBanner
                          ? "Charging card…"
                          : `Charge saved card${paymentBannerSavedCard.card_last4 ? ` (•••• ${paymentBannerSavedCard.card_last4})` : ""}`}
                      </button>
                    ) : null}
                  </div>
                  {paymentBannerSavedCard.card_display_only ? (
                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                      Card digits are on file but cannot be charged — open the patient chart, save the card again, then use{" "}
                      <strong>Charge saved card</strong>.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {paymentFollowUp.payment.charged && (
                <p className="mt-2 font-semibold text-[#166534]">
                  Paid — use <strong>Print patient bill</strong> or <strong>Email bill</strong> on the right when you are
                  ready (nothing prints automatically).
                </p>
              )}
              {!paymentFollowUp.payment.charged && (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-sm text-amber-950">
                  <span className="font-semibold">Clinic rule:</span> payment is due before the patient leaves.
                  {paymentBannerCanChargeSavedCard
                    ? " Fastest path: charge the saved card above, then the card reader at the desk, or pay on a clinic tablet below."
                    : " Use the card reader at the desk, or pay on a clinic tablet using the button below."}
                </p>
              )}
              {!paymentFollowUp.payment.charged && (
                <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2 text-xs leading-relaxed text-slate-700">
                  <strong className="text-slate-900">Desk Square Terminal:</strong> the bill usually appears on the black reader
                  automatically when you finish the visit. You can also tap <strong>Square Terminal device</strong> below to send it
                  again. This page updates on its own when payment completes.
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
                  <button
                    type="button"
                    onClick={() => void recordCashPayment()}
                    disabled={recordingCashPayment}
                    className="rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {recordingCashPayment ? "Recording…" : "Record cash payment"}
                  </button>
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
                    {terminalBusy ? "Creating…" : paymentCollectMode === "all" && paymentFollowUp.pending_payment?.has_other_pending
                      ? "Square Terminal (today + prior fees)"
                      : "Square Terminal device (desk reader)"}
                  </button>
                </div>
              )}
              {!paymentFollowUp.payment.charged && paymentFollowUp.payment.status === "checkout_link" && paymentFollowUp.payment.checkout_url && (
                <div className="mt-4 space-y-2 border-t border-slate-200/80 pt-4">
                  <p className="text-sm font-medium text-slate-800">Pay at the desk (no reader)</p>
                  <p className="text-sm text-slate-600">
                    Open this on a tablet or front-desk computer and let the patient complete checkout right there before
                    they walk out. You can still copy the link if you need to text it in a pinch.
                    {paymentFollowUp.payment.charge_error &&
                      paymentFollowUp.payment.charge_error !== "no_saved_card" &&
                      paymentFollowUp.payment.charge_error !== "card_on_file_not_chargeable" && (
                      <span className="mt-1 block text-amber-800">
                        Auto-charge did not go through:{" "}
                        {paymentFollowUp.payment.charge_error_message || paymentFollowUp.payment.charge_error}. Collect
                        payment here or with the reader.
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
              {!paymentFollowUp.payment.charged &&
                (paymentFollowUp.payment.charge_error === "no_saved_card" ||
                  paymentFollowUp.payment.charge_error === "card_on_file_not_chargeable") &&
                paymentFollowUp.payment.status !== "checkout_link" && (
                <p className="mt-2 text-sm text-amber-900">
                  {paymentFollowUp.payment.charge_error_message ||
                    "No chargeable card on file — use reader or desk pay screen."}
                </p>
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
              {paymentFollowUp.payment.charged ? (
                <>
                  <EmailBillButton
                    onClick={() => void billEmail.send(paymentFollowUp.invoice_id)}
                    sending={billEmail.isSending(paymentFollowUp.invoice_id)}
                    sentTo={billEmail.sentFor(paymentFollowUp.invoice_id)}
                    className="rounded-lg py-2"
                  />
                  <button
                    type="button"
                    disabled={printingBill}
                    onClick={() => void tryOpenPatientBill(paymentFollowUp.invoice_id, { maxAttempts: 3 })}
                    className="rounded-lg bg-[#16a349] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13823d] disabled:opacity-50"
                  >
                    {printingBill ? "Loading…" : "Print patient bill"}
                  </button>
                  <HelpTip label="Print or email bill" tone="emerald">
                    Opens a preview — you choose <strong>Print</strong> or <strong>Email</strong> from that screen. Loads the
                    current saved bill from the server. If checkout just finished, wait a moment and try again if needed.
                  </HelpTip>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => void dismissPaymentBanner()}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Not paying now
              </button>
            </div>
          </div>
          {(squareCheckoutId || paymentFollowUp.terminal_checkout_id) && !paymentFollowUp.payment.charged ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-semibold text-amber-950">Square Terminal</p>
              <p className="mt-1 text-amber-900">
                Complete the payment on the paired Square Terminal at the desk. This page refreshes automatically when
                the device finishes.
              </p>
              <SquareTerminalCheckoutPoller
                checkoutId={squareCheckoutId || paymentFollowUp.terminal_checkout_id!}
                onComplete={() => {
                  const invId = paymentFollowUp.invoice_id;
                  void handlePaymentReceived(invId, "Payment completed on the Square Terminal.");
                }}
                onTerminalError={(msg) => {
                  toast.error(msg);
                  setSquareCheckoutId(null);
                }}
              />
            </div>
          ) : null}
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
                      <p className="text-sm font-semibold text-slate-900">
                        <PatientNameWithProfile
                          name={inv.patient_name}
                          profile={inv.patient_payment_profile}
                          compactBadge
                        />
                      </p>
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
                      <div className="flex gap-2">
                        <EmailBillButton
                          onClick={() => void billEmail.send(inv.invoice_id)}
                          sending={billEmail.isSending(inv.invoice_id)}
                          sentTo={billEmail.sentFor(inv.invoice_id)}
                          label="Email"
                          compact
                          className="rounded-lg py-1.5"
                        />
                        <button
                          type="button"
                          disabled={printingBill}
                          onClick={() => void tryOpenPatientBill(inv.invoice_id, { maxAttempts: 2 })}
                          className="rounded-lg bg-[#16a349] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#13823d] disabled:opacity-50"
                        >
                          {printingBill ? "Loading…" : "Print"}
                        </button>
                      </div>
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
          help="Day view shows today only. Switch to Week or Month to browse other days. Checked-in patients stay at the top of each day. Click a row to open the chart."
        >
          {scheduleView === "day" ? "Today's schedule" : scheduleView === "week" ? "Week at a glance" : "Month at a glance"}
        </DoctorSectionLabel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            {scheduleView === "day" ? (
              <>
                <span className="font-semibold text-slate-800">Today only</span> — {formatWeekdayMonthDayYear(todayStr)}
                <span className="mt-1 block text-xs text-slate-500">
                  Checked-in patients appear first, then upcoming visits, then past or finished visits at the bottom.
                  Use Week or Month to see other days.
                </span>
              </>
            ) : (
              <>
                Showing <span className="font-semibold text-slate-800">{scheduleRangeLabel(scheduleView, scheduleFocusIso, todayStr)}</span>
                <span className="mt-1 block text-xs text-slate-500">
                  Visits are grouped by day. Tap a day header’s date is for orientation — actions work on each row.
                </span>
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100/80 p-0.5">
              {(
                [
                  { id: "day" as const, label: "Day" },
                  { id: "week" as const, label: "Week" },
                  { id: "month" as const, label: "Month" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setScheduleView(t.id);
                    if (t.id === "day") setScheduleFocusIso(todayStr);
                  }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                    scheduleView === t.id
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {scheduleView !== "day" ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setScheduleFocusIso((d) => shiftScheduleFocus(scheduleView, d, -1))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  aria-label="Previous period"
                >
                  ‹
                </button>
                <span className="min-w-[8rem] text-center text-xs font-semibold text-slate-800">
                  {scheduleRangeLabel(scheduleView, scheduleFocusIso, todayStr)}
                </span>
                <button
                  type="button"
                  onClick={() => setScheduleFocusIso((d) => shiftScheduleFocus(scheduleView, d, 1))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  aria-label="Next period"
                >
                  ›
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setScheduleView("day");
                  setScheduleFocusIso(todayStr);
                  void load();
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Refresh today
              </button>
            )}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100/80 p-0.5">
              {(
                [
                  { id: "list" as const, label: "List" },
                  { id: "calendar" as const, label: "Calendar" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setScheduleLayout(t.id)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                    scheduleLayout === t.id
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <HelpTip label="Schedule view" align="center" tone="emerald">
              Day = today’s visits only. Week = Mon–Fri for the week you pick. Month = full month. Use arrows in Week/Month to
              move forward or back. Calendar view: click an open time to book (including repeat visits).
            </HelpTip>
          </div>
        </div>
        {error && <p className="mb-3 rounded-xl bg-rose-100 p-3 text-sm font-medium text-rose-800">{error}</p>}
        {scheduleLayout === "calendar" && myProviderId != null ? (
          <div className="doctor-panel mb-4 min-w-0 overflow-x-auto p-4">
            {loading ? (
              <Loader variant="page" label="Loading calendar" sublabel="Almost there…" />
            ) : (
              <AdminScheduleCalendar
                view={scheduleView}
                focusDate={scheduleFocusDate}
                appointments={scheduleGridAppointments}
                providers={providersForCalendar}
                providerFilter={String(myProviderId)}
                blocks={scheduleBlocks}
                selectedId={activeAppt?.id ?? null}
                onSelect={() => {
                  /* Row actions stay on the list view */
                }}
                onPickDayInMonth={(d) => {
                  setScheduleFocusIso(toIsoDate(d));
                  setScheduleView("day");
                  setScheduleLayout("list");
                }}
                onPickOpenSlot={
                  scheduleView === "day" || scheduleView === "week"
                    ? (pick) => setDeskBookSeed(pick)
                    : undefined
                }
              />
            )}
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Click a white/open area on your column to book a patient. You can turn on{" "}
              <strong className="font-medium text-slate-700">Repeat on a schedule</strong> in the booking window for
              weekly, every-2-weeks, or monthly visits.
            </p>
          </div>
        ) : null}
        {scheduleLayout === "list" && loading ? (
          <Loader variant="page" label="Loading appointments" sublabel="Almost there…" />
        ) : scheduleLayout === "list" && appointments.length === 0 ? (
          <DoctorEmptyWell
            title={
              scheduleView === "day"
                ? "Clear calendar today"
                : scheduleView === "week"
                  ? "No visits this week"
                  : "No visits this month"
            }
            description={
              scheduleView === "day"
                ? "When patients book with you, they will show up here. Use Week or Month above to plan ahead."
                : `Nothing on your schedule for ${scheduleRangeLabel(scheduleView, scheduleFocusIso, todayStr)}. Try another week or month.`
            }
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100/80 text-[#16a349] shadow-inner">
              <IconStethoscope className="h-7 w-7" />
            </span>
          </DoctorEmptyWell>
        ) : scheduleLayout === "list" ? (
          <div className="stagger-children space-y-2.5">
            {scheduleListItems.map((item) => {
              if (item.kind === "day-header") {
                return (
                  <div
                    key={`hdr-${item.dateIso}`}
                    className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 pb-1.5 pt-4 first:pt-0"
                  >
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                      {item.isToday ? "Today" : formatWeekdayMonthDayYear(item.dateIso)}
                    </p>
                    {item.isToday ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        Current day
                      </span>
                    ) : null}
                  </div>
                );
              }
              const appt = item.appointment;
              const uiStatus = resolveAppointmentUiStatus(appt);
              const isNoShow = uiStatus === "no_show";
              return (
              <div
                key={appt.id}
                className={`overflow-hidden rounded-xl border transition hover:shadow-sm ${
                  isNoShow
                    ? "border-red-400/90 bg-red-50/90 shadow-sm ring-1 ring-red-300/60"
                    : activeAppt?.id === appt.id
                      ? "border-[#16a349]/45 bg-gradient-to-r from-[#16a349]/12 to-emerald-50/50 shadow-sm"
                      : "border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                } ${appointmentStatusStripeClass(uiStatus)}`}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setPatientDetailId(appt.patient_id)}
                  onKeyDown={(e) => e.key === "Enter" && setPatientDetailId(appt.patient_id)}
                  className="cursor-pointer px-4 py-4 sm:px-5 sm:py-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xl font-bold leading-snug tracking-tight text-slate-900">
                        <PatientNameWithProfile name={appt.patient} profile={appt.patient_payment_profile} />
                      </p>
                      {parseMoneyAmount(appt.patient_balance_due) > 0.009 ? (
                        <p className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-950">
                          <span aria-hidden className="text-amber-600">
                            $
                          </span>
                          Owes {formatMoneyUsd(appt.patient_balance_due ?? "0")}
                        </p>
                      ) : null}
                      <p className="mt-1.5 text-sm leading-snug text-slate-600">
                        {scheduleView !== "day" ? (
                          <span className="font-medium text-slate-700">
                            {formatMonthDayYear(appt.appointment_date)} ·{" "}
                          </span>
                        ) : null}
                        <span className="whitespace-nowrap">
                          {appt.start_time} – {appt.end_time}
                        </span>
                        {appt.service ? (
                          <span className="text-slate-500"> · {appt.service}</span>
                        ) : (
                          <span className="text-slate-500"> · Follow-up</span>
                        )}
                      </p>
                      <AppointmentClientReason reason={appt.reason_for_visit} compact className="mt-2" />
                      {isNoShow && appt.auto_no_show_processed_at ? (
                        <p className="mt-2 text-[11px] font-medium text-red-900/90">Marked automatically</p>
                      ) : null}
                    </div>
                    <AppointmentStatusBadge
                      status={statusDisplay(uiStatus)}
                      size="md"
                      className="shrink-0 normal-case"
                    />
                  </div>

                  <div
                    className="mt-3 flex flex-col gap-2"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    role="presentation"
                  >
                    {uiStatus === "booked" && (
                      <button
                        type="button"
                        onClick={() => void checkInPatient(appt)}
                        disabled={isCheckingIn}
                        className="min-h-11 w-full max-w-md rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 shadow-sm hover:bg-amber-100 disabled:opacity-50 sm:w-auto"
                      >
                        {isCheckingIn ? "Completing check-in…" : "Check-in"}
                      </button>
                    )}
                    {uiStatus === "checked_in" && (
                      <div className="flex max-w-md flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startVisit(appt)}
                          disabled={isStarting}
                          className="min-h-11 flex-1 rounded-xl bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-900/15 hover:bg-[#13823d] disabled:opacity-50 sm:flex-none sm:px-6"
                        >
                          Start visit
                        </button>
                        <HelpTip label="Start visit" align="center" tone="emerald">
                          Opens chart and billing workspace. Document the visit, then complete when finished.
                        </HelpTip>
                      </div>
                    )}
                    {uiStatus === "in_consultation" && (
                      <div className="flex max-w-md flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setConsultWorkspaceExpanded(true);
                            setActiveAppt(appt);
                          }}
                          className="min-h-11 flex-1 rounded-xl bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-900/15 hover:bg-[#13823d] sm:flex-none sm:px-6"
                        >
                          Resume visit
                        </button>
                        <HelpTip label="Resume visit" align="center" tone="emerald">
                          Reopens the consultation workspace for this patient.
                        </HelpTip>
                      </div>
                    )}
                    {(uiStatus === "awaiting_payment" ||
                      (isNoShow &&
                        appt.invoice_id != null &&
                        parseMoneyAmount(appt.amount_due ?? appt.invoice_total) > 0.009)) && (
                      <div className="space-y-2.5 rounded-xl border border-slate-200/90 bg-slate-50/60 p-3">
                        <p className="text-xs leading-relaxed text-slate-600">
                          {isNoShow
                            ? "Patient paid in cash, on the card reader, or with a saved card — record it here so the no-show fee is marked paid."
                            : "Chart or invoice changes, then collect payment. Amount due is shown below."}
                        </p>
                        <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 lg:grid-cols-3">
                          {!isNoShow ? (
                            <>
                          <button
                            type="button"
                            onClick={() => void openSoapNotesEdit(appt)}
                            className="min-h-11 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm font-semibold text-violet-950 shadow-sm hover:bg-violet-100"
                          >
                            Edit SOAP notes
                          </button>
                          <button
                            type="button"
                            onClick={() => void openBillingForEdit(appt)}
                            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:border-[#16a349]/40 hover:bg-emerald-50/80"
                          >
                            Edit billing
                          </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={recordingCashAppointmentId === appt.id}
                              onClick={() => void recordCashForAppointment(appt)}
                              className="min-h-11 rounded-xl border border-emerald-600 bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 min-[480px]:col-span-2 lg:col-span-1"
                            >
                              {recordingCashAppointmentId === appt.id ? "Recording…" : "Record cash payment"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void resumePaymentForAppointment(appt)}
                            className="min-h-11 rounded-xl bg-[#16a349] px-3 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-900/15 hover:bg-[#13823d] min-[480px]:col-span-2 lg:col-span-1"
                          >
                            {isNoShow ? "Card / desk checkout" : "Collect payment"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void resumePaymentForAppointment(appt, { trySavedCard: true })}
                            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-[#16a349]/35 hover:bg-emerald-50/80"
                          >
                            Retry saved card
                          </button>
                          {appt.invoice_id ? (
                            <button
                              type="button"
                              onClick={() => void checkSquarePaymentForAppointment(appt)}
                              className="min-h-11 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm font-semibold text-violet-900 shadow-sm hover:bg-violet-100 min-[480px]:col-span-2 lg:col-span-3"
                            >
                              Check Square (any device)
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {(uiStatus === "awaiting_payment" || isNoShow) &&
                  parseMoneyAmount(appt.amount_due ?? appt.invoice_total) > 0.009 && (
                  <p
                    className={`border-t px-4 py-2 text-center text-[13px] font-medium leading-normal ${
                      isNoShow
                        ? "border-red-200/80 bg-red-50/90 text-red-950"
                        : "border-emerald-100/80 bg-[#f0fdf4]/90 text-[#0d5c2e]"
                    }`}
                  >
                    {isNoShow ? "No-show fee" : "Invoice"}: ${appt.invoice_total ?? appt.amount_due}
                    {parseMoneyAmount(appt.amount_paid ?? "0") > 0.009 ? (
                      <> · Paid ${appt.amount_paid} · Still due ${appt.amount_due ?? appt.invoice_total}</>
                    ) : (
                      <> · Due ${appt.amount_due ?? appt.invoice_total}</>
                    )}
                    {appt.invoice_number ? ` · ${appt.invoice_number}` : ""}
                  </p>
                )}
                {canDoctorPreVisitDesk(uiStatus) && (
                  <div className="grid grid-cols-1 gap-2 border-t border-slate-200/80 bg-slate-50/60 px-4 py-3 sm:grid-cols-3">
                    <button
                      type="button"
                      disabled={savingDesk}
                      onClick={() => {
                        void (async () => {
                          const ok = await requestConfirm(confirmNoShow(appt.patient));
                          if (!ok) return;
                          await runWithFeedback(
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
                        })();
                      }}
                      className="min-h-11 w-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[14px] font-semibold leading-normal text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                    >
                      No-show
                    </button>
                    <button
                      type="button"
                      disabled={savingDesk}
                      onClick={() => {
                        void (async () => {
                          const ok = await requestConfirm(
                            confirmCancelVisit(
                              appt.patient,
                              appt.service_type,
                              appt.appointment_date,
                              appt.start_time_iso ?? appt.start_time,
                            ),
                          );
                          if (!ok) return;
                          await runWithFeedback(
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
                        })();
                      }}
                      className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[14px] font-semibold leading-normal text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={savingDesk}
                      onClick={() => void openReschedule(appt)}
                      className="min-h-11 w-full rounded-lg border border-[#16a349]/30 bg-white px-4 py-2.5 text-[14px] font-semibold leading-normal text-[#0d5c2e] hover:bg-emerald-50 disabled:opacity-50"
                    >
                      Reschedule
                    </button>
                  </div>
                )}
                {appt.status === "completed" && (
                  <div
                    className={`grid grid-cols-1 gap-2 border-t border-slate-200/80 bg-slate-50/60 px-4 py-3 ${
                      doctorCanEditVisitBilling(appt) ? "sm:grid-cols-3" : "sm:grid-cols-2"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void openSoapNotesEdit(appt);
                      }}
                      className="min-h-11 w-full rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-[14px] font-semibold leading-normal text-violet-950 hover:bg-violet-100"
                    >
                      Edit SOAP notes
                    </button>
                    {doctorCanEditVisitBilling(appt) ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void openBillingForEdit(appt);
                        }}
                        className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[14px] font-semibold leading-normal text-slate-800 hover:border-[#16a349]/40 hover:bg-emerald-50/80"
                      >
                        Edit billing
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={bookNext.saving || bookNext.optionsLoading}
                      onClick={(e) => {
                        e.stopPropagation();
                        void openBookNext(appt);
                      }}
                      className="min-h-11 w-full rounded-lg border border-[#16a349]/30 bg-white px-4 py-2.5 text-[14px] font-semibold leading-normal text-[#0d5c2e] hover:bg-emerald-50 disabled:opacity-50"
                    >
                      Book next visit
                    </button>
                  </div>
                )}
              </div>
            );
            })}
          </div>
        ) : null}
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
              {activeAppt.card_display_only ? (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  Card digits are on file but Square is not linked for charging. Open the patient chart and save the card
                  again before using Charge saved card.
                </p>
              ) : null}
            </div>
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
              Clinic policy: the patient should know what they are paying before you run the charge or hand them the Terminal.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {activeAppt.has_chargeable_saved_card ||
              appointmentHasChargeableSavedCard(activeAppt) ? (
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
                    Desk pay link or other options in the green banner
                  </button>
                  <p className="text-center text-[11px] leading-snug text-slate-500">
                    The bill is usually sent to the desk Terminal automatically. Use the green banner for desk pay link
                    or to resend to the reader.
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
                    Show all payment options (desk link, Terminal from banner)
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
      <ConfirmDialog />
      {RecordCashPaymentModal}
      <AdminDeskBookFromSlotModal
        open={deskBookSeed !== null}
        seed={deskBookSeed}
        onClose={() => setDeskBookSeed(null)}
        lockProvider
        todayMinIso={todayStr}
        onBooked={() => load()}
        confirmBeforeSubmit={async (ctx) =>
          requestConfirm(
            confirmDeskBook(
              ctx.patientName,
              ctx.serviceName,
              ctx.dateIso,
              ctx.timeLabel,
              ctx.providerName,
              {
                visitCount: ctx.recurringVisitCount,
                recurrenceLabel: ctx.recurrenceLabel,
              },
            ),
          )
        }
      />
      <RescheduleVisitSlotsModal reschedule={rescheduleVisit} titleId="doctor-dashboard-reschedule-title" />
      <BookNextVisitModal bookNext={bookNext} titleId="doctor-dashboard-book-next-title" zIndexClass="z-50" />
      <PatientBillPortalModal
        bill={patientBillModal}
        onClose={() => {
          setPatientBillModal(null);
          billEmail.clearSent();
        }}
        emailingBill={
          patientBillModal?.invoice_id ? billEmail.isSending(patientBillModal.invoice_id) : false
        }
        emailSentTo={
          patientBillModal?.invoice_id ? billEmail.sentFor(patientBillModal.invoice_id) : null
        }
        onEmailBill={
          patientBillModal?.invoice_id
            ? () => void billEmail.send(patientBillModal.invoice_id!)
            : undefined
        }
      />
      {patientDetailId && (
        <PatientDetailModal patientId={patientDetailId} onClose={() => setPatientDetailId(null)} />
      )}
      </div>
    </div>
  );
}
