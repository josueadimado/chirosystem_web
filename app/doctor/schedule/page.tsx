"use client";

import {
  AdminScheduleCalendar,
  navigateFocusDate,
  schedulePeriodLabel,
  type ProviderBlock,
  type ScheduleAppointment,
} from "@/components/admin-schedule-calendar";
import type { DeskBookSlotSeed } from "@/components/admin-desk-book-from-slot-modal";
import dynamic from "next/dynamic";

// Modals are only needed when the user opens them — load them lazily.
const AdminDeskBookFromSlotModal = dynamic(
  () =>
    import("@/components/admin-desk-book-from-slot-modal").then((m) => ({
      default: m.AdminDeskBookFromSlotModal,
    })),
  { ssr: false },
);
import { AppointmentStatusBadge } from "@/components/status-chip";
import { useAppFeedback } from "@/components/app-feedback";
import { Loader } from "@/components/loader";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ApiError, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import { deskCheckInSuccessMessage, postDeskCheckIn } from "@/lib/kiosk-checkin";
import {
  addDays,
  endOfMonth,
  filterAppointmentsForScheduleGrid,
  minutesToApiTime,
  mondayOfWeekContaining,
  parseTimeToMinutes,
  scheduleRangeIncludesToday,
  SCHEDULE_DAY_START_MIN,
  SCHEDULE_DESK_DAY_END_MIN,
  startOfMonth,
  toIsoDate,
} from "@/lib/admin-schedule-utils";
import { useScheduleAutoRefresh } from "@/hooks/use-schedule-auto-refresh";
const BookNextVisitModal = dynamic(
  () =>
    import("@/components/visit-panel/book-next-visit-modal").then((m) => ({
      default: m.BookNextVisitModal,
    })),
  { ssr: false },
);

const PatientBillPortalModal = dynamic(
  () =>
    import("@/components/patient-bill-portal-modal").then((m) => ({
      default: m.PatientBillPortalModal,
    })),
  { ssr: false },
);

const SquareTerminalCheckoutPoller = dynamic(
  () =>
    import("@/components/square-terminal-checkout").then((m) => ({
      default: m.SquareTerminalCheckoutPoller,
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
import { VisitDeskActions } from "@/components/visit-panel/visit-desk-actions";
import { VisitDoctorScheduleActions } from "@/components/visit-panel/visit-doctor-schedule-actions";
import { useRecordCashPayment } from "@/components/record-cash-payment-modal";
import { VisitPanelPatientFooter } from "@/components/visit-panel/visit-panel-patient-footer";
import { VisitBirthdayReminder } from "@/components/visit-panel/visit-birthday-reminder";
import {
  PatientPaymentProfileSelector,
  type PatientPaymentProfile,
} from "@/components/patient-payment-profile";
import { VisitSummaryHeader } from "@/components/visit-panel/visit-summary-header";
import { VisitAppointmentStaffNotes } from "@/components/visit-panel/visit-appointment-staff-notes";
import { VisitPriorChartNotes } from "@/components/visit-panel/visit-prior-chart-notes";
import { useAppointmentActionConfirm } from "@/hooks/use-appointment-action-confirm";
import { useBookNextVisit } from "@/hooks/use-book-next-visit";
import { usePatientQuickContact } from "@/hooks/use-patient-quick-contact";
import { useRescheduleVisitSlots } from "@/hooks/use-reschedule-visit-slots";
import { appointmentBlocksDeskActions, effectiveAppointmentStatus } from "@/lib/visit-status-utils";
import {
  confirmBookNextVisit,
  confirmCheckIn,
  confirmCheckInPastVisit,
  confirmDeskBook,
  confirmDragReschedule,
  confirmReopenAndCheckIn,
  confirmRescheduleBySlots,
} from "@/lib/appointment-action-confirm-messages";
import { clinicTodayIso, formatWeekdayMonthDayYear } from "@/lib/format-date";
import type { PatientBillPayload } from "@/lib/patient-bill-print";
import { parseMoneyAmount } from "@/lib/record-cash-prompt";
import { Plus } from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type CalendarStatus = { oauth_configured: boolean; connected: boolean };

type AppointmentRow = {
  id: number;
  patient: number;
  patient_name: string;
  provider: number;
  provider_name: string;
  booked_service: number | null;
  service_name: string;
  service_type?: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  start_time_display?: string;
  end_time_display?: string;
  status: string;
  display_status?: string;
  invoice_kind?: string | null;
  invoice_id?: number | null;
  invoice_total?: string | null;
  amount_paid?: string | null;
  amount_due?: string | null;
  auto_no_show_processed_at?: string | null;
  reason_for_visit?: string;
  patient_date_of_birth?: string | null;
  patient_payment_profile?: string;
  patient_iris_tag?: boolean;
};

type ScheduleViewMode = "day" | "week" | "month";

function appointmentUiStatus(row: { status: string; display_status?: string; invoice_kind?: string | null }): string {
  return row.display_status ?? effectiveAppointmentStatus(row.status, row.invoice_kind);
}

function formatTime(t: string): string {
  if (!t) return "";
  const match = t.match(/(\d{1,2}):(\d{2})/);
  if (!match) return t;
  const h = parseInt(match[1], 10);
  const m = match[2];
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function formatAppointmentDuration(start: string, end: string): string {
  const mins = Math.max(0, parseTimeToMinutes(end) - parseTimeToMinutes(start));
  if (mins <= 0) return "—";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  if (rem === 0) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${h} hr ${rem} min`;
}

function buildAppointmentListParams(
  view: ScheduleViewMode,
  focusDate: Date,
  providerId: number,
): URLSearchParams {
  const params = new URLSearchParams();
  if (view === "day") {
    params.set("appointment_date", toIsoDate(focusDate));
  } else if (view === "week") {
    const mon = mondayOfWeekContaining(focusDate);
    const fri = addDays(mon, 4);
    params.set("date_from", toIsoDate(mon));
    params.set("date_to", toIsoDate(fri));
  } else {
    params.set("date_from", toIsoDate(startOfMonth(focusDate)));
    params.set("date_to", toIsoDate(endOfMonth(focusDate)));
  }
  params.set("provider_id", String(providerId));
  return params;
}

function blockListRange(view: ScheduleViewMode, focusDate: Date): { from: string; to: string } {
  if (view === "day") {
    const iso = toIsoDate(focusDate);
    return { from: iso, to: iso };
  }
  if (view === "week") {
    const mon = mondayOfWeekContaining(focusDate);
    const fri = addDays(mon, 4);
    return { from: toIsoDate(mon), to: toIsoDate(fri) };
  }
  return { from: toIsoDate(startOfMonth(focusDate)), to: toIsoDate(endOfMonth(focusDate)) };
}

function DoctorSchedulePageInner() {
  const { runWithFeedback, toast } = useAppFeedback();
  const { requestConfirm, ConfirmDialog } = useAppointmentActionConfirm();
  const { requestCashAmount, RecordCashPaymentModal } = useRecordCashPayment();
  const searchParams = useSearchParams();
  const [providerId, setProviderId] = useState<number | null>(null);
  const [providerName, setProviderName] = useState("");
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [blocks, setBlocks] = useState<ProviderBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<ScheduleViewMode>("day");
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [selected, setSelected] = useState<AppointmentRow | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [appointmentSaving, setAppointmentSaving] = useState(false);

  const [handoffNotes, setHandoffNotes] = useState("");
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [savingHandoff, setSavingHandoff] = useState(false);

  const [deskBookSeed, setDeskBookSeed] = useState<DeskBookSlotSeed | null>(null);
  const [patientBillModal, setPatientBillModal] = useState<PatientBillPayload | null>(null);
  const [previewingBill, setPreviewingBill] = useState(false);
  const [recordingCash, setRecordingCash] = useState(false);
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [terminalCheckoutId, setTerminalCheckoutId] = useState<string | null>(null);

  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);

  const navSigRef = useRef<{ view: ScheduleViewMode; focusMs: number } | null>(null);
  const openedFromUrlRef = useRef<number | null>(null);
  const pendingAppointmentIdRef = useRef<number | null>(null);
  const todayStr = clinicTodayIso();

  const bookNext = useBookNextVisit({
    todayMinIso: todayStr,
    preferredProviderId: providerId,
    onBooked: () => loadAppointments(),
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
    providerId,
    defaultDateIso: toIsoDate(focusDate),
    onRescheduled: () => loadAppointments(),
    confirmBeforeSubmit: async (ctx) =>
      requestConfirm(
        confirmRescheduleBySlots(ctx.patientLabel, ctx.dateIso, ctx.timeLabel),
      ),
  });
  const { contact: patientContact, loading: patientContactLoading } = usePatientQuickContact(
    selected?.patient ?? null,
  );

  const providersForCalendar = useMemo(() => {
    if (providerId == null) return [];
    return [{ id: providerId, provider_name: providerName || `Provider ${providerId}` }];
  }, [providerId, providerName]);

  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    void apiGetAuth<{ provider_id: number; provider_name: string }>("/doctor/me/")
      .then((r) => {
        setProviderId(r.provider_id);
        setProviderName(r.provider_name || "");
      })
      .catch(() => {
        setProviderId(null);
        setProviderName("");
      })
      .finally(() => setAuthReady(true));
  }, []);

  const loadAppointments = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (providerId == null) return;
      if (!opts?.silent) {
        setLoading(true);
        setError("");
      }
      try {
        const params = buildAppointmentListParams(view, focusDate, providerId);
        const list = await apiGetAuth<AppointmentRow[]>(`/appointments/?${params}`);
        setAppointments(list);
        setSelected((prev) => {
          if (!prev) return null;
          const fresh = list.find((a) => a.id === prev.id);
          return fresh ?? null;
        });
      } catch (e) {
        if (!opts?.silent) {
          setError(e instanceof ApiError ? e.message : "Failed to load schedule.");
          setAppointments([]);
        }
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [providerId, view, focusDate],
  );

  useEffect(() => {
    setTerminalCheckoutId(null);
  }, [selected?.id]);

  const showNoShowBilling =
    selected != null &&
    appointmentUiStatus(selected) === "no_show" &&
    selected.invoice_kind === "no_show_fee" &&
    selected.invoice_id != null &&
    parseMoneyAmount(selected.amount_due ?? selected.invoice_total ?? "0") > 0.009;

  const openPatientBillPreview = async (invoiceId: number) => {
    setPreviewingBill(true);
    try {
      const bill = await apiGetAuth<PatientBillPayload>(
        `/doctor/invoice_bill/?invoice_id=${invoiceId}&preview=1`,
        { cache: "no-store" },
      );
      setPatientBillModal(bill);
      toast.success("Bill preview opened — press Esc to close.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not load bill preview.");
    } finally {
      setPreviewingBill(false);
    }
  };

  const startTerminalCheckout = async () => {
    if (!selected?.invoice_id) {
      toast.error("No unpaid invoice on file for this visit yet.");
      return;
    }
    setTerminalBusy(true);
    await runWithFeedback(
      async () => {
        const out = await apiPost<{ checkout_id: string }>("/doctor/terminal_checkout/", {
          invoice_id: selected.invoice_id,
        });
        setTerminalCheckoutId(out.checkout_id);
        return out;
      },
      {
        loadingMessage: "Sending amount to Square Terminal…",
        successMessage: "Follow the prompts on the card reader.",
        errorFallback: "Could not start terminal payment.",
      },
    );
    setTerminalBusy(false);
  };

  const recordCashPayment = async () => {
    if (!selected?.invoice_id) return;
    const amountDue = selected.amount_due ?? selected.invoice_total;
    if (!amountDue || parseMoneyAmount(amountDue) <= 0) {
      toast.error("This invoice is already paid in full.");
      return;
    }
    const cashAmount = await requestCashAmount({
      invoiceTotal: selected.invoice_total ?? amountDue,
      amountPaid: selected.amount_paid ?? "0",
      amountDue,
      subtitle: `No-show fee — ${selected.patient_name}`,
    });
    if (!cashAmount) return;
    setRecordingCash(true);
    await runWithFeedback(
      async () => {
        const out = await apiPost<{ fully_paid?: boolean; amount_due?: string }>(
          `/invoices/${selected.invoice_id}/pay/`,
          {
            amount: cashAmount,
            payment_method: "cash",
            payment_reference: "",
          },
        );
        await loadAppointments();
        return out;
      },
      {
        loadingMessage: "Recording cash payment…",
        successMessage: (out) =>
          out?.fully_paid
            ? "Cash recorded — no-show fee paid in full."
            : `Cash recorded — $${out?.amount_due ?? amountDue} still due.`,
        errorFallback: "Could not record payment. Try again.",
      },
    );
    setRecordingCash(false);
  };

  const scheduleRangeHasToday = useMemo(() => {
    const { from, to } = blockListRange(view, focusDate);
    return scheduleRangeIncludesToday(from, to);
  }, [view, focusDate]);

  useScheduleAutoRefresh({
    enabled: scheduleRangeHasToday && providerId != null,
    refresh: () => loadAppointments({ silent: true }),
  });

  const loadBlocks = useCallback(async () => {
    if (providerId == null) return;
    const { from, to } = blockListRange(view, focusDate);
    const blockParams = new URLSearchParams({
      date_from: from,
      date_to: to,
      provider_id: String(providerId),
    });
    try {
      const blockList = await apiGetAuth<ProviderBlock[]>(`/provider-unavailability/?${blockParams}`);
      setBlocks(blockList);
    } catch {
      setBlocks([]);
    }
  }, [providerId, view, focusDate]);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    const raw = searchParams.get("appointment");
    if (!raw) return;
    const id = Number.parseInt(raw, 10);
    if (!Number.isNaN(id)) pendingAppointmentIdRef.current = id;
  }, [searchParams]);

  useEffect(() => {
    const id = pendingAppointmentIdRef.current;
    if (id == null || providerId == null) return;

    const ap = appointments.find((a) => a.id === id);
    if (ap) {
      if (openedFromUrlRef.current !== ap.id) {
        openedFromUrlRef.current = ap.id;
        setSelected(ap);
      }
      pendingAppointmentIdRef.current = null;
      return;
    }

    if (loading) return;

    let cancelled = false;
    void apiGetAuth<AppointmentRow>(`/appointments/${id}/`)
      .then((row) => {
        if (cancelled) return;
        setFocusDate(new Date(`${row.appointment_date}T12:00:00`));
        setView("day");
      })
      .catch(() => {
        if (!cancelled) pendingAppointmentIdRef.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [appointments, providerId, loading, toast]);

  useEffect(() => {
    if (view !== "day") setDeskBookSeed(null);
  }, [view]);

  useEffect(() => {
    void loadBlocks();
  }, [loadBlocks]);

  useEffect(() => {
    const ms = focusDate.getTime();
    const prev = navSigRef.current;
    navSigRef.current = { view, focusMs: ms };
    if (!prev) return;
    if (prev.view !== view || prev.focusMs !== ms) {
      setSelected(null);
    }
  }, [view, focusDate]);

  useEffect(() => {
    apiGetAuth<CalendarStatus>("/doctor/google_calendar/status/")
      .then(setCalendarStatus)
      .catch(() => setCalendarStatus(null));
  }, []);

  useEffect(() => {
    const g = searchParams.get("google_calendar");
    if (g === "connected") {
      toast.success("Google Calendar connected. New appointments will appear on your personal calendar.");
      apiGetAuth<CalendarStatus>("/doctor/google_calendar/status/").then(setCalendarStatus);
    }
    if (g === "error") {
      const r = searchParams.get("reason") || "unknown";
      toast.error(`Google connection failed: ${decodeURIComponent(r)}`);
    }
  }, [searchParams, toast]);

  useEffect(() => {
    if (!selected) {
      setHandoffNotes("");
      return;
    }
    let cancelled = false;
    setHandoffLoading(true);
    void apiGetAuth<{ clinical_handoff_notes?: string }>(`/appointments/${selected.id}/`)
      .then((row) => {
        if (!cancelled) setHandoffNotes(row.clinical_handoff_notes ?? "");
      })
      .catch(() => {
        if (!cancelled) setHandoffNotes("");
      })
      .finally(() => {
        if (!cancelled) setHandoffLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload notes when appointment id changes
  }, [selected?.id]);

  const handleCheckIn = async () => {
    if (!selected) return;
    const uiStatus = effectiveAppointmentStatus(selected.status, selected.invoice_kind);
    if (appointmentBlocksDeskActions(selected.status, selected.invoice_kind) && uiStatus !== "no_show") {
      return;
    }
    const isPastVisit = selected.appointment_date < todayStr;
    const ok = await requestConfirm(
      uiStatus === "no_show"
        ? confirmReopenAndCheckIn(selected.patient_name)
        : isPastVisit
          ? confirmCheckInPastVisit(selected.patient_name, selected.appointment_date)
          : confirmCheckIn(selected.patient_name),
    );
    if (!ok) return;
    setCheckingIn(true);
    await runWithFeedback(
      async () => {
        const out = await postDeskCheckIn(selected.id);
        await loadAppointments();
        return out;
      },
      {
        loadingMessage: "Completing check-in…",
        successMessage: (out) => deskCheckInSuccessMessage(out, "Check-in complete."),
        errorFallback: "Could not complete check-in.",
      },
    );
    setCheckingIn(false);
  };

  const saveHandoff = async () => {
    if (!selected) return;
    setSavingHandoff(true);
    try {
      await runWithFeedback(
        async () => {
          await apiPatch("/doctor/appointment_handoff/", {
            appointment_id: selected.id,
            clinical_handoff_notes: handoffNotes,
          });
        },
        {
          loadingMessage: "Saving chart note…",
          successMessage: "Reminders & handoff saved.",
          errorFallback: "Could not save chart note.",
        },
      );
    } finally {
      setSavingHandoff(false);
    }
  };

  const openReschedule = (appt: AppointmentRow) => {
    rescheduleVisit.open({
      id: appt.id,
      patientLabel: appt.patient_name,
      appointmentDate: appt.appointment_date,
      startTimeDisplay: appt.start_time_display || formatTime(appt.start_time),
      endTimeDisplay: appt.end_time_display || formatTime(appt.end_time),
      serviceLabel: appt.service_name,
      bookedServiceId: appt.booked_service,
      startTimeIso: appt.start_time,
    });
  };

  const openBookNext = (appt: AppointmentRow) => {
    bookNext.open({
      id: appt.id,
      patientLabel: appt.patient_name,
      appointmentDate: appt.appointment_date,
      bookedServiceId: appt.booked_service,
      providerId: appt.provider,
    });
  };

  const patchAppointmentStatus = async (id: number, status: "cancelled" | "no_show") => {
    setAppointmentSaving(true);
    try {
      await runWithFeedback(
        async () => {
          await apiPatch(`/appointments/${id}/`, { status });
          await loadAppointments();
          setSelected((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
        },
        {
          loadingMessage: status === "cancelled" ? "Cancelling…" : "Updating…",
          successMessage: status === "cancelled" ? "Appointment cancelled." : "Marked as no-show.",
          errorFallback: status === "cancelled" ? "Could not cancel." : "Could not update this visit.",
        },
      );
    } finally {
      setAppointmentSaving(false);
    }
  };

  const handleNoShow = (appt: AppointmentRow) => {
    void patchAppointmentStatus(appt.id, "no_show");
  };

  const handleCancel = (appt: AppointmentRow) => {
    void patchAppointmentStatus(appt.id, "cancelled");
  };

  const canRescheduleOnCalendar = (s: string) =>
    s !== "completed" && s !== "no_show" && s !== "cancelled";

  const handleRescheduleFromGrid = async (pick: {
    appointment: ScheduleAppointment;
    providerId: number;
    providerName: string;
    dateIso: string;
    startMinute: number;
  }) => {
    const { appointment, providerId, providerName: pickProviderName, dateIso, startMinute } = pick;
    const uiStatus = appointmentUiStatus(appointment);
    if (!canRescheduleOnCalendar(uiStatus)) {
      toast.error("This visit cannot be moved from the calendar.");
      return;
    }
    const body: Record<string, unknown> = {
      appointment_date: dateIso,
      start_time: minutesToApiTime(startMinute),
    };
    if (providerId !== appointment.provider) {
      body.provider = providerId;
    }
    const ok = await requestConfirm(
      confirmDragReschedule(
        appointment.patient_name,
        dateIso,
        startMinute,
        pickProviderName || providerName || `Provider ${providerId}`,
      ),
    );
    if (!ok) return;
    setAppointmentSaving(true);
    try {
      await runWithFeedback(
        async () => {
          await apiPatch(`/appointments/${appointment.id}/`, body);
          await loadAppointments();
          setSelected((prev) =>
            prev && prev.id === appointment.id
              ? {
                  ...prev,
                  appointment_date: dateIso,
                  start_time: minutesToApiTime(startMinute),
                  provider: providerId,
                }
              : prev,
          );
        },
        {
          loadingMessage: "Moving appointment…",
          successMessage: "Appointment moved on the calendar.",
          errorFallback: "Could not move this appointment — the slot may be taken or outside booking rules.",
        },
      );
    } finally {
      setAppointmentSaving(false);
    }
  };

  const scheduleAppts = useMemo(() => filterAppointmentsForScheduleGrid(appointments), [appointments]);

  if (!authReady) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-[#e8e8e8] bg-white py-12">
        <Loader variant="page" label="Loading schedule" sublabel="Verifying your profile…" />
      </div>
    );
  }

  if (providerId === null) {
    return (
      <div className="rounded-xl border border-[#e8e8e8] bg-[#fefce8] px-4 py-6 text-sm text-[#0d1f14]">
        No provider profile is linked to your account. Contact the clinic administrator.
      </div>
    );
  }

  const openNewAppointment = () => {
    if (providerId == null) return;
    const day = new Date();
    setFocusDate(day);
    setView("day");
    const now = new Date();
    let startMin = now.getHours() * 60 + now.getMinutes();
    startMin = Math.ceil(startMin / 15) * 15;
    const dayStart = SCHEDULE_DAY_START_MIN;
    if (startMin < dayStart) startMin = dayStart;
    if (startMin > SCHEDULE_DESK_DAY_END_MIN - 15) startMin = dayStart;
    setDeskBookSeed({
      providerId,
      providerName: providerName || `Provider ${providerId}`,
      dateIso: toIsoDate(day),
      startMinute: startMin,
      gapStartMin: dayStart,
      gapEndMin: SCHEDULE_DESK_DAY_END_MIN,
    });
  };

  const connectGoogleCalendar = async () => {
    setCalendarBusy(true);
    try {
      const r = await apiGetAuth<{ authorization_url: string }>("/doctor/google_calendar/oauth/start/");
      window.location.href = r.authorization_url;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not start Google sign-in.");
      setCalendarBusy(false);
    }
  };

  const disconnectGoogleCalendar = async () => {
    setCalendarBusy(true);
    await runWithFeedback(
      async () => {
        await apiPost("/doctor/google_calendar/disconnect/", {});
        setCalendarStatus({ oauth_configured: true, connected: false });
      },
      {
        loadingMessage: "Disconnecting Google Calendar…",
        successMessage: "Disconnected. New events will not sync until you connect again.",
        errorFallback: "Could not disconnect Google Calendar.",
      },
    );
    setCalendarBusy(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Banani DoctorSchedule toolbar — date nav left, view + calendar + New Appointment right */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <button
            type="button"
            aria-label="Previous period"
            onClick={() => setFocusDate(navigateFocusDate(view, focusDate, -1))}
            className="rounded-lg border border-[#e8e8e8] bg-white px-3 py-2 text-[#949494] hover:bg-[#f5f5f5] hover:text-[#0d1f14]"
          >
            ←
          </button>
          <div className="max-w-[min(16rem,50vw)] truncate text-base font-semibold text-[#0d1f14] sm:max-w-none">
            {schedulePeriodLabel(view, focusDate)}
          </div>
          <button
            type="button"
            aria-label="Next period"
            onClick={() => setFocusDate(navigateFocusDate(view, focusDate, 1))}
            className="rounded-lg border border-[#e8e8e8] bg-white px-3 py-2 text-[#949494] hover:bg-[#f5f5f5] hover:text-[#0d1f14]"
          >
            →
          </button>
          <button
            type="button"
            onClick={() => setFocusDate(new Date())}
            className="rounded-lg border border-[#e8e8e8] bg-white px-3 py-2 text-sm text-[#0d1f14] hover:bg-[#f5f5f5]"
          >
            Today
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg bg-[#e8e8e8]" role="group" aria-label="Calendar view">
            {(
              [
                ["day", "Day"],
                ["week", "Week"],
                ["month", "Month"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                className={`px-4 py-2 text-sm transition ${
                  view === value
                    ? "bg-white font-semibold text-[#0d1f14]"
                    : "text-[#949494] hover:text-[#0d1f14]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {calendarStatus?.oauth_configured && !calendarStatus.connected ? (
            <button
              type="button"
              disabled={calendarBusy}
              onClick={() => void connectGoogleCalendar()}
              title="Sync appointments to your personal Google Calendar"
              className="inline-flex shrink-0 items-center rounded-lg border border-[#e8e8e8] bg-white px-3 py-2 text-sm font-medium text-[#0d1f14] hover:bg-[#f5f5f5] disabled:opacity-50"
            >
              {calendarBusy ? "Connecting…" : "Connect Calendar"}
            </button>
          ) : null}

          {calendarStatus?.oauth_configured && calendarStatus.connected ? (
            <button
              type="button"
              disabled={calendarBusy}
              onClick={() => void disconnectGoogleCalendar()}
              title="Stop syncing new appointments to Google Calendar"
              className="inline-flex shrink-0 items-center rounded-lg border border-[#e8e8e8] bg-white px-3 py-2 text-sm font-medium text-[#0d1f14] hover:bg-[#f5f5f5] disabled:opacity-50"
            >
              {calendarBusy ? "…" : "Disconnect Calendar"}
            </button>
          ) : null}

          <button
            type="button"
            onClick={openNewAppointment}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#16a349] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13823d]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New Appointment
          </button>
        </div>
      </div>

      {/* Status legend — Banani */}
      <div className="flex w-full flex-wrap items-center gap-2">
        {(
          [
            "scheduled",
            "checked_in",
            "in_consultation",
            "awaiting_payment",
            "completed",
            "no_show",
            "cancelled",
          ] as const
        ).map((s) => (
          <AppointmentStatusBadge key={s} status={s} size="xs" className="normal-case" />
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}

      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#e8e8e8] bg-white">
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          {loading ? (
            <div className="p-6">
              <Loader variant="page" label="Loading schedule" sublabel="Fetching your calendar…" />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <AdminScheduleCalendar
                view={view}
                focusDate={focusDate}
                appointments={scheduleAppts}
                providers={providersForCalendar}
                providerFilter={String(providerId)}
                blocks={blocks}
                selectedId={selected?.id ?? null}
                onSelect={(row) => {
                  const full = appointments.find((x) => x.id === row.id);
                  if (full) setSelected(full);
                }}
                onPickDayInMonth={(d) => {
                  setFocusDate(d);
                  setView("day");
                }}
                onPickOpenSlot={view === "day" || view === "week" ? (pick) => setDeskBookSeed(pick) : undefined}
                onRescheduleAppointment={
                  view === "day" || view === "week"
                    ? (pick) => void handleRescheduleFromGrid(pick)
                    : undefined
                }
              />
            </div>
          )}
        </div>
      </section>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        {selected ? (
          <SheetContent
            side="right"
            showCloseButton
            className="flex h-full max-h-[100dvh] w-full max-w-[min(100vw,24rem)] flex-col gap-0 overflow-hidden border-l border-[#e8e8e8] bg-white p-0 shadow-xl sm:max-w-96"
          >
            <VisitSummaryHeader
              patientName={selected.patient_name}
              serviceName={selected.service_name}
              dateTimeLabel={`${formatWeekdayMonthDayYear(selected.appointment_date)} at ${selected.start_time_display || formatTime(selected.start_time)}`}
              durationLabel={formatAppointmentDuration(selected.start_time, selected.end_time)}
              providerName={selected.provider_name}
              providerColor="#16a349"
              status={appointmentUiStatus(selected)}
              appointmentId={selected.id}
              reasonForVisit={selected.reason_for_visit}
              patientPaymentProfile={selected.patient_payment_profile}
              patientIrisTag={selected.patient_iris_tag}
            />

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <PatientPaymentProfileSelector
                patientId={selected.patient}
                value={(selected.patient_payment_profile || "") as PatientPaymentProfile}
                intakeSavePath="/doctor/patient_intake/"
                onSaved={(profile) => {
                  const patch = { patient_payment_profile: profile };
                  setSelected((s) => (s ? { ...s, ...patch } : s));
                  setAppointments((list) =>
                    list.map((a) => (a.patient === selected.patient ? { ...a, ...patch } : a)),
                  );
                }}
                irisTag={!!selected.patient_iris_tag}
                onIrisSaved={(iris) => {
                  const patch = { patient_iris_tag: iris };
                  setSelected((s) => (s ? { ...s, ...patch } : s));
                  setAppointments((list) =>
                    list.map((a) => (a.patient === selected.patient ? { ...a, ...patch } : a)),
                  );
                }}
                className="mb-4"
              />
              <VisitBirthdayReminder
                appointmentDate={selected.appointment_date}
                patientDateOfBirth={selected.patient_date_of_birth}
                className="mb-4"
              />
              {appointmentBlocksDeskActions(selected.status, selected.invoice_kind) ? (
                <VisitDeskActions
                  appointment={{
                    id: selected.id,
                    status: selected.status,
                    display_status: selected.display_status,
                    invoice_kind: selected.invoice_kind,
                    auto_no_show_processed_at: selected.auto_no_show_processed_at,
                    appointment_date: selected.appointment_date,
                    start_time: selected.start_time,
                  }}
                  providers={[]}
                  checkingIn={checkingIn}
                  savingDesk={appointmentSaving}
                  waiveLateCancelFee={false}
                  onWaiveLateCancelFeeChange={() => {}}
                  within24HoursBeforeStart={() => false}
                  canReschedule={() => false}
                  canNoShowOrCancel={() => false}
                  canMarkCompleted={() => false}
                  reschedule={{
                    open: false,
                    date: "",
                    time: "",
                    providerId: "",
                    onToggle: () => {},
                    onDateChange: () => {},
                    onTimeChange: () => {},
                    onProviderChange: () => {},
                    onSave: () => {},
                  }}
                  billing={
                    showNoShowBilling
                      ? {
                          invoiceId: selected.invoice_id ?? null,
                          invoiceTotalAmount: selected.invoice_total,
                          amountPaid: selected.amount_paid ?? undefined,
                          amountDue: selected.amount_due ?? undefined,
                          hintLoading: false,
                          snapshotLoading: false,
                          previewing: previewingBill,
                          recordingCash,
                          onPreview: () => void openPatientBillPreview(selected.invoice_id!),
                          onRecordCashPayment: () => void recordCashPayment(),
                          onTerminalCheckout: () => void startTerminalCheckout(),
                          terminalBusy,
                          terminalCheckoutId,
                        }
                      : undefined
                  }
                  onCheckIn={() => void handleCheckIn()}
                  canReopenMissed={
                    effectiveAppointmentStatus(selected.status, selected.invoice_kind) === "no_show"
                  }
                  onNoShow={() => {}}
                  onCancel={() => {}}
                  onMarkCompleted={() => {}}
                  onBookNext={() => openBookNext(selected)}
                  onBookInOpenSlot={
                    view === "day" || view === "week"
                      ? () => {
                          const startMin = parseTimeToMinutes(selected.start_time);
                          const endMin = parseTimeToMinutes(selected.end_time);
                          setDeskBookSeed({
                            providerId: selected.provider,
                            providerName: selected.provider_name,
                            dateIso: selected.appointment_date,
                            startMinute: startMin,
                            gapStartMin: startMin,
                            gapEndMin: Math.max(endMin, startMin + 15),
                          });
                        }
                      : undefined
                  }
                />
              ) : (
                <VisitDoctorScheduleActions
                  patientName={selected.patient_name}
                  requestConfirm={requestConfirm}
                  status={selected.status}
                  displayStatus={selected.display_status}
                  invoiceKind={selected.invoice_kind}
                  autoNoShowProcessedAt={selected.auto_no_show_processed_at}
                  checkingIn={checkingIn}
                  saving={appointmentSaving}
                  serviceType={selected.service_type}
                  appointmentDate={selected.appointment_date}
                  startTime={selected.start_time}
                  onCheckIn={() => void handleCheckIn()}
                  onReschedule={() => openReschedule(selected)}
                  onBookNext={() => openBookNext(selected)}
                  onNoShow={() => handleNoShow(selected)}
                  onCancel={() => handleCancel(selected)}
                />
              )}
              {terminalCheckoutId && selected?.invoice_id ? (
                <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50/90 p-3 text-sm text-violet-950">
                  <p className="font-semibold">Square Terminal</p>
                  <p className="mt-1 text-xs leading-relaxed">
                    Complete payment on the desk reader. This panel updates when the device finishes.
                  </p>
                  <SquareTerminalCheckoutPoller
                    checkoutId={terminalCheckoutId}
                    statusPath="/doctor/terminal_checkout_status/"
                    onComplete={() => {
                      setTerminalCheckoutId(null);
                      void loadAppointments();
                      toast.success("Terminal payment recorded.");
                    }}
                    onTerminalError={(msg) => {
                      toast.error(msg);
                      setTerminalCheckoutId(null);
                    }}
                  />
                </div>
              ) : null}

              <div className="mt-6 space-y-4 border-t border-[#e8e8e8] pt-6">
                <VisitPriorChartNotes appointmentId={selected.id} />
                <VisitAppointmentStaffNotes
                  value={handoffNotes}
                  onChange={setHandoffNotes}
                  onSave={() => void saveHandoff()}
                  saving={savingHandoff}
                  loading={handoffLoading}
                  savePathLabel="you and the front desk"
                />
              </div>

            </div>

            <VisitPanelPatientFooter
              loading={patientContactLoading}
              phone={patientContact?.phone}
              email={patientContact?.email}
              dateOfBirth={selected.patient_date_of_birth ?? patientContact?.date_of_birth}
              profileHref={`/doctor/patients/${selected.patient}/record`}
              profileLabel="View full patient record →"
            />
          </SheetContent>
        ) : null}
      </Sheet>

      <AdminDeskBookFromSlotModal
        open={deskBookSeed !== null}
        seed={deskBookSeed}
        onClose={() => setDeskBookSeed(null)}
        lockProvider
        todayMinIso={todayStr}
        onBooked={() => loadAppointments()}
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

      <ConfirmDialog />
      {RecordCashPaymentModal}

      <PatientBillPortalModal bill={patientBillModal} onClose={() => setPatientBillModal(null)} />

      <RescheduleVisitSlotsModal reschedule={rescheduleVisit} titleId="doctor-schedule-reschedule-title" />
      <BookNextVisitModal
        bookNext={bookNext}
        titleId="doctor-schedule-book-next-title"
        showDeskHoursHint={false}
      />
    </div>
  );
}

export default function DoctorSchedulePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center py-16">
          <Loader variant="page" label="Opening schedule" sublabel="One moment…" />
        </div>
      }
    >
      <DoctorSchedulePageInner />
    </Suspense>
  );
}
