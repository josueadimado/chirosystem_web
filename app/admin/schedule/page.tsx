"use client";

import { AdminPageIntro } from "@/components/admin-shell";
import {
  AdminScheduleCalendar,
  navigateFocusDate,
  schedulePeriodLabel,
  type ProviderBlock,
  type ScheduleAppointment,
} from "@/components/admin-schedule-calendar";
import { AdminDeskBookFromSlotModal, type DeskBookSlotSeed } from "@/components/admin-desk-book-from-slot-modal";
import { AdminVisitBillingModal } from "@/components/admin-visit-billing-modal";
import { BookNextVisitModal } from "@/components/visit-panel/book-next-visit-modal";
import { VisitDeskActions } from "@/components/visit-panel/visit-desk-actions";
import { VisitSnapshotDisplay } from "@/components/visit-panel/visit-snapshot-display";
import { VisitPanelPatientFooter } from "@/components/visit-panel/visit-panel-patient-footer";
import { VisitSummaryHeader } from "@/components/visit-panel/visit-summary-header";
import { useBookNextVisit } from "@/hooks/use-book-next-visit";
import { usePatientQuickContact } from "@/hooks/use-patient-quick-contact";
import { useAppFeedback } from "@/components/app-feedback";
import { HelpTip } from "@/components/help-tip";
import { Loader } from "@/components/loader";
import { PatientBillPortalModal } from "@/components/patient-bill-portal-modal";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ApiError, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import {
  addDays,
  endOfMonth,
  filterAppointmentsForScheduleGrid,
  minutesToApiTime,
  mondayOfWeekContaining,
  parseTimeToMinutes,
  providerColorForId,
  startOfMonth,
  toIsoDate,
} from "@/lib/admin-schedule-utils";
import type { PatientBillPayload } from "@/lib/patient-bill-print";
import { formatWeekdayMonthDayYear } from "@/lib/format-date";
import { estimatedPriceFromSnapshot, type VisitSnapshot } from "@/lib/visit-panel-types";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";

type Appointment = {
  id: number;
  patient: number;
  patient_name: string;
  provider: number;
  provider_name: string;
  booked_service: number | null;
  service_name: string;
  /** From API: chiropractic | massage */
  service_type?: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  start_time_display?: string;
  end_time_display?: string;
  status: string;
};

type Provider = {
  id: number;
  provider_name: string;
};

const STATUS_OPTIONS = [
  { value: "", label: "Active on calendar" },
  { value: "booked", label: "Booked" },
  { value: "checked_in", label: "Checked in" },
  { value: "in_consultation", label: "In consultation" },
  { value: "awaiting_payment", label: "Awaiting payment" },
  { value: "completed", label: "Completed" },
  { value: "no_show", label: "No-show" },
  { value: "cancelled", label: "Cancelled" },
];

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

/** True if appointment start is in the future but less than 24 hours away (local clock). */
function within24HoursBeforeStart(appointmentDate: string, startTime: string): boolean {
  const t = (startTime || "09:00:00").slice(0, 8);
  const start = new Date(`${appointmentDate}T${t}`);
  const ms = start.getTime() - Date.now();
  return ms > 0 && ms < 24 * 60 * 60 * 1000;
}

type ScheduleViewMode = "day" | "week" | "month";

function buildAppointmentListParams(
  view: ScheduleViewMode,
  focusDate: Date,
  providerFilter: string,
  statusFilter: string,
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
  if (providerFilter) params.set("provider_id", providerFilter);
  if (statusFilter) params.set("status", statusFilter);
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

function formatAppointmentDuration(start: string, end: string): string {
  const m = Math.max(0, parseTimeToMinutes(end) - parseTimeToMinutes(start));
  if (m <= 0) return "—";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (rem === 0) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${h} hr ${rem} min`;
}

function AdminSchedulePageContent() {
  const { runWithFeedback, toast } = useAppFeedback();
  const searchParams = useSearchParams();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [view, setView] = useState<ScheduleViewMode>("day");
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [blocks, setBlocks] = useState<ProviderBlock[]>([]);
  const [providerFilter, setProviderFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [checkingIn, setCheckingIn] = useState(false);
  const [savingDesk, setSavingDesk] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [waiveLateCancelFee, setWaiveLateCancelFee] = useState(false);
  const [resDate, setResDate] = useState("");
  const [resTime, setResTime] = useState("09:00");
  const [resProviderId, setResProviderId] = useState("");

  const [visitSnapshot, setVisitSnapshot] = useState<VisitSnapshot | null>(null);
  const [visitSnapshotLoading, setVisitSnapshotLoading] = useState(false);
  const [patientBillModal, setPatientBillModal] = useState<PatientBillPayload | null>(null);
  const [previewingBill, setPreviewingBill] = useState(false);
  const [billingEditForAppointment, setBillingEditForAppointment] = useState<Appointment | null>(null);
  /** Invoice id for preview — matches snapshot when present; otherwise loaded from visit_billing_for_edit. */
  const [billingInvoiceIdHint, setBillingInvoiceIdHint] = useState<number | null>(null);
  const [billingHintLoading, setBillingHintLoading] = useState(false);

  const { contact: patientContact, loading: patientContactLoading } = usePatientQuickContact(
    selected?.patient ?? null,
  );

  const [deskBookSeed, setDeskBookSeed] = useState<DeskBookSlotSeed | null>(null);
  const [dragUndo, setDragUndo] = useState<{
    appointmentId: number;
    appointment_date: string;
    start_time: string;
    provider: number;
    label: string;
  } | null>(null);
  const openedFromUrlRef = useRef<number | null>(null);
  const pendingAppointmentIdRef = useRef<number | null>(null);

  const navSigRef = useRef<{
    view: ScheduleViewMode;
    focusMs: number;
    providerFilter: string;
    statusFilter: string;
  } | null>(null);

  const filterSummaryLabel = useMemo(() => {
    const provLabel =
      providerFilter === ""
        ? "All providers"
        : providers.find((p) => String(p.id) === providerFilter)?.provider_name ?? "Selected provider";
    const statusLabel =
      statusFilter === ""
        ? "Active on calendar"
        : STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? statusFilter;
    return `Showing: ${provLabel} · ${statusLabel}`;
  }, [providerFilter, statusFilter, providers]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const bookNext = useBookNextVisit({
    todayMinIso: todayStr,
    useDeskAvailability: true,
    onBooked: () => loadAppointments(),
  });

  const calendarAppointments = useMemo(
    () => filterAppointmentsForScheduleGrid(appointments, statusFilter),
    [appointments, statusFilter],
  );

  useEffect(() => {
    if (!selected) {
      setVisitSnapshot(null);
      return;
    }
    let cancelled = false;
    setVisitSnapshotLoading(true);
    void apiGetAuth<VisitSnapshot>(`/admin/visit_snapshot/?appointment_id=${selected.id}`)
      .then((snap) => {
        if (!cancelled) setVisitSnapshot(snap);
      })
      .catch(() => {
        if (!cancelled) setVisitSnapshot(null);
      })
      .finally(() => {
        if (!cancelled) setVisitSnapshotLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  useEffect(() => {
    if (!selected || selected.status !== "awaiting_payment") {
      setBillingInvoiceIdHint(null);
      setBillingHintLoading(false);
      return;
    }
    let cancelled = false;
    setBillingHintLoading(true);
    void apiGetAuth<{ invoice_id: number }>(`/admin/visit_billing_for_edit/?appointment_id=${selected.id}`)
      .then((b) => {
        if (!cancelled) setBillingInvoiceIdHint(b.invoice_id);
      })
      .catch(() => {
        if (!cancelled) setBillingInvoiceIdHint(null);
      })
      .finally(() => {
        if (!cancelled) setBillingHintLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.status]);

  useEffect(() => {
    const ms = focusDate.getTime();
    const prev = navSigRef.current;
    navSigRef.current = { view, focusMs: ms, providerFilter, statusFilter };
    if (!prev) return;
    if (
      prev.view !== view ||
      prev.focusMs !== ms ||
      prev.providerFilter !== providerFilter ||
      prev.statusFilter !== statusFilter
    ) {
      setSelected(null);
    }
  }, [view, focusDate, providerFilter, statusFilter]);

  useEffect(() => {
    if (view !== "day") setDeskBookSeed(null);
  }, [view]);

  const loadProviders = async () => {
    try {
      const list = await apiGetAuth<{ id: number; provider_name?: string }[]>(
        "/providers/"
      );
      setProviders(
        list.map((p) => ({
          id: p.id,
          provider_name: p.provider_name || `Provider ${p.id}`,
        }))
      );
    } catch {
      setProviders([]);
    }
  };

  const loadAppointments = async () => {
    setLoading(true);
    setError("");
    try {
      const params = buildAppointmentListParams(view, focusDate, providerFilter, statusFilter);
      const { from, to } = blockListRange(view, focusDate);
      const blockParams = new URLSearchParams({ date_from: from, date_to: to });

      const [list, blockList] = await Promise.all([
        apiGetAuth<Appointment[]>(`/appointments/?${params}`),
        apiGetAuth<ProviderBlock[]>(`/provider-unavailability/?${blockParams}`).catch(() => [] as ProviderBlock[]),
      ]);

      setAppointments(list);
      setBlocks(blockList);
      setSelected((prev) => {
        if (!prev) return null;
        const fresh = list.find((a) => a.id === prev.id);
        return fresh ?? null;
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load schedule.");
      setAppointments([]);
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  useEffect(() => {
    loadAppointments();
  }, [view, focusDate, providerFilter, statusFilter]);

  useEffect(() => {
    const raw = searchParams.get("appointment");
    if (!raw) return;
    const id = Number.parseInt(raw, 10);
    if (!Number.isNaN(id)) pendingAppointmentIdRef.current = id;
  }, [searchParams]);

  useEffect(() => {
    const id = pendingAppointmentIdRef.current;
    if (id == null) return;

    const ap = appointments.find((a) => a.id === id);
    if (ap) {
      if (openedFromUrlRef.current !== ap.id) {
        openedFromUrlRef.current = ap.id;
        setSelected(ap);
        toast.info(`Opened ${ap.patient_name} — details are in the panel on the right.`);
      }
      pendingAppointmentIdRef.current = null;
      return;
    }

    if (loading) return;

    let cancelled = false;
    void apiGetAuth<Appointment>(`/appointments/${id}/`)
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
  }, [appointments, loading, toast]);

  useEffect(() => {
    setShowReschedule(false);
    setWaiveLateCancelFee(false);
    if (selected) {
      setResDate(selected.appointment_date);
      const raw = selected.start_time;
      setResTime(raw.length >= 5 ? raw.slice(0, 5) : "09:00");
      setResProviderId(String(selected.provider));
    }
  }, [selected?.id]);

  const handleCheckIn = async () => {
    if (!selected) return;
    setCheckingIn(true);
    setError("");
    await runWithFeedback(
      async () => {
        await apiPost("/kiosk/checkin/", { appointment_id: selected.id });
        await loadAppointments();
        setSelected((prev) => (prev ? { ...prev, status: "checked_in" } : null));
      },
      {
        loadingMessage: "Completing check-in…",
        successMessage: "Check-in complete.",
        errorFallback: "Could not complete check-in for this appointment.",
      },
    );
    setCheckingIn(false);
  };

  /** Update one visit (status, time, or provider). Reloads the calendar and keeps the drawer in sync. */
  const patchAppointment = async (id: number, body: Record<string, unknown>) => {
    setSavingDesk(true);
    setError("");
    try {
      await apiPatch(`/appointments/${id}/`, body);
      await loadAppointments();
      const nextStatus = typeof body.status === "string" ? body.status : undefined;
      if (nextStatus === "cancelled" || nextStatus === "no_show") {
        setSelected(null);
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not update appointment.";
      setError(msg);
      throw e;
    } finally {
      setSavingDesk(false);
    }
  };

  const canMarkNoShowOrCancel = (s: string) => s === "booked" || s === "checked_in";

  const canMarkCompletedStaff = (s: string) =>
    s === "in_consultation" || s === "awaiting_payment" || s === "checked_in";

  /** Front desk may move visits that are not finished or already cleared. */
  const canRescheduleStaff = (s: string) =>
    s !== "completed" && s !== "no_show" && s !== "cancelled";

  const submitReschedule = async () => {
    if (!selected) return;
    const pid = Number.parseInt(resProviderId, 10);
    const body: Record<string, unknown> = {
      appointment_date: resDate,
      start_time: resTime.length === 5 ? `${resTime}:00` : resTime,
    };
    if (!Number.isNaN(pid) && pid !== selected.provider) {
      body.provider = pid;
    }
    let saved = false;
    await runWithFeedback(
      async () => {
        await patchAppointment(selected.id, body);
        saved = true;
      },
      {
        loadingMessage: "Rescheduling…",
        successMessage: "Appointment updated.",
        errorFallback: "Could not reschedule.",
      }
    );
    if (saved) setShowReschedule(false);
  };

  const handleRescheduleFromGrid = async (pick: {
    appointment: ScheduleAppointment;
    providerId: number;
    dateIso: string;
    startMinute: number;
  }) => {
    const { appointment, providerId, dateIso, startMinute } = pick;
    if (!canRescheduleStaff(appointment.status)) {
      toast.error("This visit cannot be moved from the calendar.");
      return;
    }
    const prevDate = appointment.appointment_date;
    const prevTime = appointment.start_time.length >= 5 ? appointment.start_time.slice(0, 5) : appointment.start_time;
    const prevProvider = appointment.provider;
    const body: Record<string, unknown> = {
      appointment_date: dateIso,
      start_time: minutesToApiTime(startMinute),
    };
    if (providerId !== appointment.provider) {
      body.provider = providerId;
    }
    let moved = false;
    await runWithFeedback(
      async () => {
        await patchAppointment(appointment.id, body);
        moved = true;
      },
      {
        loadingMessage: "Moving appointment…",
        successMessage: "Appointment moved on the calendar.",
        errorFallback: "Could not move this appointment — the slot may be taken or outside booking rules.",
      },
    );
    if (moved) {
      setDragUndo({
        appointmentId: appointment.id,
        appointment_date: prevDate,
        start_time: prevTime.length === 5 ? `${prevTime}:00` : prevTime,
        provider: prevProvider,
        label: appointment.patient_name,
      });
    }
  };

  const undoDragMove = async () => {
    if (!dragUndo) return;
    const snap = dragUndo;
    setDragUndo(null);
    let restored = false;
    await runWithFeedback(
      async () => {
        await patchAppointment(snap.appointmentId, {
          appointment_date: snap.appointment_date,
          start_time: snap.start_time,
          provider: snap.provider,
        });
        restored = true;
      },
      {
        loadingMessage: "Undoing move…",
        successMessage: `${snap.label} moved back to the previous time.`,
        errorFallback: "Could not undo — the old slot may no longer be open.",
      },
    );
    if (!restored) setDragUndo(snap);
  };

  const openPatientBillPreview = async (invoiceId: number) => {
    setPreviewingBill(true);
    try {
      const bill = await apiGetAuth<PatientBillPayload>(
        `/admin/invoice_bill/?invoice_id=${invoiceId}&preview=1`,
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

  const openBookNext = (appt: Appointment) => {
    bookNext.open({
      id: appt.id,
      patientLabel: appt.patient_name,
      appointmentDate: appt.appointment_date,
      bookedServiceId: appt.booked_service,
      providerId: appt.provider,
    });
  };

  const billInvoiceId = visitSnapshot?.invoice?.id ?? billingInvoiceIdHint ?? null;

  return (
    <div className="space-y-6">
      <AdminPageIntro
        title="Schedule"
        description="See who is coming in, filter by doctor or status, and check patients in from the front desk when they arrive."
        pageHelp={
          <>
            Use <strong>Day</strong> for the front-desk time grid (open gaps through 9:00 PM for staff) — click an open strip to book a patient.{" "}
            <strong>Week</strong> for Mon–Fri overview, <strong>Month</strong> for counts at a glance. Filters reload appointments from the
            server. <strong>Check In</strong> marks arrival like the kiosk.
          </>
        }
      />
      <section className="admin-panel w-full max-w-none">
        <div className="sticky top-0 z-10 mb-4 space-y-3 rounded-xl border border-slate-200/90 bg-white/95 px-3 py-3 shadow-sm ring-1 ring-slate-100/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/85">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-600">View</span>
              <HelpTip label="Calendar views">
                Day shows a time grid by provider — click any open strip to book (staff may run past public closing, through 9:00 PM). Week shows Monday–Friday with
                overlapping visits stacked. Month shows appointment counts; click a day to open it in Day view.
              </HelpTip>
              <button
                type="button"
                onClick={() => setView("day")}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  view === "day"
                    ? "bg-[#16a349] text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Day
              </button>
              <button
                type="button"
                onClick={() => setView("week")}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  view === "week"
                    ? "bg-[#16a349] text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Week
              </button>
              <button
                type="button"
                onClick={() => setView("month")}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  view === "month"
                    ? "bg-[#16a349] text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Month
              </button>
              <button
                type="button"
                aria-label="Previous period"
                onClick={() => setFocusDate(navigateFocusDate(view, focusDate, -1))}
                className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100"
              >
                ←
              </button>
              <button
                type="button"
                aria-label="Next period"
                onClick={() => setFocusDate(navigateFocusDate(view, focusDate, 1))}
                className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100"
              >
                →
              </button>
              <button
                type="button"
                onClick={() => setFocusDate(new Date())}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Today
              </button>
              <span className="text-sm font-semibold text-slate-800">{schedulePeriodLabel(view, focusDate)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-500">Filters</span>
              <HelpTip label="Filters">
                Provider limits the list to one doctor. <strong>Active on calendar</strong> hides cancelled and no-show visits so those times
                are open for new bookings; pick <strong>Cancelled</strong> or <strong>No-show</strong> to review them here. Cancelled visits
                always stay on the patient&apos;s history page. Use the drawer to mark <strong>no-show</strong>, <strong>cancel</strong>, or{" "}
                <strong>completed</strong>, or to <strong>reschedule</strong>.
              </HelpTip>
              <select
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
              >
                <option value="">All providers</option>
                {providers.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.provider_name}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value || "all"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="min-w-0 text-sm text-slate-600 sm:ml-auto sm:max-w-[min(100%,28rem)] sm:text-right">{filterSummaryLabel}</p>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {dragUndo ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
            <p>
              <strong>{dragUndo.label}</strong> was moved on the calendar. Undo to put it back at the previous time?
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void undoDragMove()}
                className="rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-800"
              >
                Undo move
              </button>
              <button
                type="button"
                onClick={() => setDragUndo(null)}
                className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-sm font-semibold text-sky-900 hover:bg-sky-100/80"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <Loader variant="page" label="Loading schedule" sublabel="Fetching your calendar…" />
        ) : (
          <AdminScheduleCalendar
            view={view}
            focusDate={focusDate}
            appointments={calendarAppointments}
            providers={providers}
            providerFilter={providerFilter}
            blocks={blocks}
            selectedId={selected?.id ?? null}
            onSelect={(row) => {
              const full = appointments.find((x) => x.id === row.id);
              if (!full) return;
              if (selected?.id !== full.id) {
                setSelected(full);
                toast.info(`${full.patient_name} — use the panel on the right for check-in, reschedule, and billing.`);
              } else {
                setSelected(full);
              }
            }}
            onPickDayInMonth={(d) => {
              setFocusDate(d);
              setView("day");
            }}
            onPickOpenSlot={view === "day" ? (pick) => setDeskBookSeed(pick) : undefined}
            onRescheduleAppointment={view === "day" ? (pick) => void handleRescheduleFromGrid(pick) : undefined}
          />
        )}
      </section>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        {selected ? (
          <SheetContent
            side="right"
            showCloseButton
            className="flex h-full max-h-[100dvh] w-full max-w-[min(100vw,480px)] flex-col gap-0 overflow-hidden border-l border-slate-200 bg-white p-0 shadow-2xl sm:max-w-[480px]"
          >
            <VisitSummaryHeader
              patientName={selected.patient_name}
              serviceName={selected.service_name}
              dateTimeLabel={`${formatWeekdayMonthDayYear(selected.appointment_date)} at ${selected.start_time_display || formatTime(selected.start_time)}`}
              durationLabel={formatAppointmentDuration(selected.start_time, selected.end_time)}
              providerName={selected.provider_name}
              providerColor={providerColorForId(selected.provider)}
              status={selected.status}
              estimatedPrice={estimatedPriceFromSnapshot(visitSnapshot)}
              appointmentId={selected.id}
            />

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-3">
                <VisitDeskActions
                  appointment={selected}
                  providers={providers}
                  checkingIn={checkingIn}
                  savingDesk={savingDesk}
                  waiveLateCancelFee={waiveLateCancelFee}
                  onWaiveLateCancelFeeChange={setWaiveLateCancelFee}
                  within24HoursBeforeStart={within24HoursBeforeStart}
                  canReschedule={canRescheduleStaff}
                  canNoShowOrCancel={canMarkNoShowOrCancel}
                  canMarkCompleted={canMarkCompletedStaff}
                  reschedule={{
                    open: showReschedule,
                    date: resDate,
                    time: resTime,
                    providerId: resProviderId,
                    onToggle: () => setShowReschedule((v) => !v),
                    onDateChange: setResDate,
                    onTimeChange: setResTime,
                    onProviderChange: setResProviderId,
                    onSave: () => void submitReschedule(),
                  }}
                  billing={
                    selected.status === "awaiting_payment"
                      ? {
                          invoiceId: billInvoiceId,
                          hintLoading: billingHintLoading,
                          snapshotLoading: visitSnapshotLoading,
                          previewing: previewingBill,
                          onPreview: () => {
                            if (billInvoiceId != null) void openPatientBillPreview(billInvoiceId);
                          },
                          onEditBilling: () => setBillingEditForAppointment(selected),
                        }
                      : undefined
                  }
                  onCheckIn={handleCheckIn}
                  onBookNext={() => openBookNext(selected)}
                  onNoShow={() => {
                    if (!confirm("Mark this visit as no-show? It will no longer count as an active booking.")) return;
                    void runWithFeedback(
                      async () => {
                        await patchAppointment(selected.id, { status: "no_show" });
                      },
                      {
                        loadingMessage: "Updating…",
                        successMessage: "Marked as no-show.",
                        errorFallback: "Could not update status.",
                      },
                    );
                  }}
                  onCancel={() => {
                    const lateMassage =
                      selected.service_type === "massage" &&
                      within24HoursBeforeStart(selected.appointment_date, selected.start_time);
                    const msg = lateMassage
                      ? "This massage is inside the 24-hour window: the patient will be charged the full massage price unless you checked “Waive late-cancellation fee.” Continue?"
                      : "Cancel this appointment? It will free the slot.";
                    if (!confirm(msg)) return;
                    void runWithFeedback(
                      async () => {
                        await patchAppointment(selected.id, {
                          status: "cancelled",
                          ...(waiveLateCancelFee ? { waive_late_cancel_fee: true } : {}),
                        });
                      },
                      {
                        loadingMessage: "Updating…",
                        successMessage: "Appointment cancelled.",
                        errorFallback: "Could not cancel.",
                      },
                    );
                  }}
                  onMarkCompleted={() => {
                    if (
                      !confirm(
                        "Mark this visit completed without going through checkout here? Use when payment was handled elsewhere.",
                      )
                    )
                      return;
                    void runWithFeedback(
                      async () => {
                        await patchAppointment(selected.id, { status: "completed" });
                      },
                      {
                        loadingMessage: "Updating…",
                        successMessage: "Marked completed.",
                        errorFallback: "Could not complete.",
                      },
                    );
                  }}
                />
              </div>

              <VisitSnapshotDisplay snapshot={visitSnapshot} loading={visitSnapshotLoading} />
            </div>

            <VisitPanelPatientFooter
              loading={patientContactLoading}
              phone={patientContact?.phone}
              email={patientContact?.email}
              profileHref={`/admin/patients/${selected.patient}/history`}
            />
          </SheetContent>
        ) : null}
      </Sheet>

      <AdminDeskBookFromSlotModal
        open={deskBookSeed !== null}
        seed={deskBookSeed}
        onClose={() => setDeskBookSeed(null)}
        todayMinIso={todayStr}
        onBooked={() => loadAppointments()}
      />

      <BookNextVisitModal bookNext={bookNext} titleId="admin-book-next-title" />

      <PatientBillPortalModal bill={patientBillModal} onClose={() => setPatientBillModal(null)} />
      {billingEditForAppointment && (
        <AdminVisitBillingModal
          open
          appointmentId={billingEditForAppointment.id}
          appointmentDate={billingEditForAppointment.appointment_date}
          bookedServiceId={billingEditForAppointment.booked_service}
          patientLabel={billingEditForAppointment.patient_name}
          onClose={() => setBillingEditForAppointment(null)}
          onSaved={() => {
            const id = billingEditForAppointment.id;
            void loadAppointments().then(async () => {
              try {
                const snap = await apiGetAuth<VisitSnapshot>(`/admin/visit_snapshot/?appointment_id=${id}`);
                setVisitSnapshot(snap);
              } catch {
                /* keep prior snapshot */
              }
            });
          }}
        />
      )}
    </div>
  );
}

export default function AdminSchedulePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center p-8">
          <Loader variant="page" label="Opening schedule" sublabel="One moment…" />
        </div>
      }
    >
      <AdminSchedulePageContent />
    </Suspense>
  );
}
