"use client";

import { AdminPageIntro } from "@/components/admin-shell";
import {
  AdminScheduleCalendar,
  navigateFocusDate,
  schedulePeriodLabel,
  type ProviderBlock,
} from "@/components/admin-schedule-calendar";
import { AdminVisitBillingModal } from "@/components/admin-visit-billing-modal";
import { useAppFeedback } from "@/components/app-feedback";
import { HelpTip } from "@/components/help-tip";
import { Loader } from "@/components/loader";
import { PatientBillPortalModal } from "@/components/patient-bill-portal-modal";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ApiError, apiGet, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import {
  addDays,
  endOfMonth,
  mondayOfWeekContaining,
  parseTimeToMinutes,
  providerColorForId,
  startOfMonth,
  toIsoDate,
} from "@/lib/admin-schedule-utils";
import type { PatientBillPayload } from "@/lib/patient-bill-print";
import { formatWeekdayMonthDayYear } from "@/lib/format-date";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type VisitSnapshot = {
  appointment_id: number;
  appointment_status: string;
  patient_name: string;
  patient_id: number;
  clinical_handoff_notes: string;
  visit_id: number | null;
  visit_status: string | null;
  reason_for_visit: string;
  doctor_notes: string;
  diagnosis: string;
  rendered_services: Array<{
    service_id: number;
    service_name: string;
    billing_code: string;
    quantity: number;
    unit_price: string;
    line_total: string;
    charges_patient: boolean;
  }>;
  invoice: {
    id: number;
    invoice_number: string;
    subtotal: string;
    discount: string;
    credit_applied_total: string;
    professional_discount_reason: string;
    total_amount: string;
    status: string;
  } | null;
};

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

type PatientQuick = {
  phone: string;
  email: string;
};

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
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

function estimatedPriceDisplay(visitSnapshot: VisitSnapshot | null): string {
  if (!visitSnapshot) return "—";
  if (visitSnapshot.invoice?.total_amount?.trim()) {
    const n = Number.parseFloat(visitSnapshot.invoice.total_amount);
    if (!Number.isNaN(n)) return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
    return `$${visitSnapshot.invoice.total_amount}`;
  }
  if (visitSnapshot.rendered_services?.length) {
    let sum = 0;
    for (const row of visitSnapshot.rendered_services) {
      sum += Number.parseFloat(row.line_total || "0") || 0;
    }
    if (sum > 0) {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(sum);
    }
  }
  return "—";
}

/** Drawer status badge styling — complements calendar semantics without changing calendar styles. */
function drawerStatusBadgeClass(status: string): string {
  switch (status) {
    case "booked":
    case "scheduled":
      return "bg-emerald-100 text-emerald-900";
    case "checked_in":
    case "in_consultation":
      return "bg-sky-100 text-sky-900";
    case "awaiting_payment":
      return "bg-violet-100 text-violet-900";
    case "completed":
      return "bg-slate-200 text-slate-800";
    case "cancelled":
      return "bg-pink-100 text-pink-900";
    case "no_show":
      return "bg-orange-100 text-orange-900";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function drawerStatusLabel(status: string): string {
  const key = status === "booked" ? "scheduled" : status;
  return key.replaceAll("_", " ");
}

function formatSchedulePhoneDisplay(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return "";
  const d = trimmed.replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return trimmed;
}

function visitSnapshotHasDetailContent(s: VisitSnapshot): boolean {
  if (s.visit_id != null && (s.visit_status || "").trim()) return true;
  if ((s.clinical_handoff_notes || "").trim()) return true;
  if ((s.reason_for_visit || "").trim()) return true;
  if ((s.doctor_notes || "").trim()) return true;
  if ((s.diagnosis || "").trim()) return true;
  if (s.rendered_services.length > 0) return true;
  if (s.invoice) return true;
  return false;
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

  const [patientQuick, setPatientQuick] = useState<PatientQuick | null>(null);
  const [patientQuickLoading, setPatientQuickLoading] = useState(false);

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

  const navSigRef = useRef<{
    view: ScheduleViewMode;
    focusMs: number;
    providerFilter: string;
    statusFilter: string;
  } | null>(null);

  const todayStr = new Date().toISOString().slice(0, 10);

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
    if (!selected?.patient) {
      setPatientQuick(null);
      setPatientQuickLoading(false);
      return;
    }
    let cancelled = false;
    setPatientQuickLoading(true);
    void apiGetAuth<PatientQuick>(`/patients/${selected.patient}/`)
      .then((p) => {
        if (!cancelled) setPatientQuick(p);
      })
      .catch(() => {
        if (!cancelled) setPatientQuick(null);
      })
      .finally(() => {
        if (!cancelled) setPatientQuickLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.patient]);

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
    if (!raw || appointments.length === 0) return;
    const id = Number.parseInt(raw, 10);
    if (Number.isNaN(id)) return;
    const ap = appointments.find((a) => a.id === id);
    if (ap) setSelected(ap);
  }, [searchParams, appointments]);

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
    void (async () => {
      setBookNextAppt(appt);
      const initialDate = appt.appointment_date >= todayStr ? appt.appointment_date : todayStr;
      setBnDate(initialDate);
      setBookNextOptionsLoading(true);
      try {
        const opts = await apiGet<BookingOptionsResponse>("/booking-options/");
        setBookingOptions(opts);
        const sid =
          appt.booked_service && opts.services.some((s) => s.id === appt.booked_service)
            ? appt.booked_service
            : opts.services[0]?.id ?? 0;
        setBnServiceId(sid);
        const provs = opts.providers_by_service[String(sid)] ?? [];
        const pid = provs.some((p) => p.id === appt.provider) ? appt.provider : provs[0]?.id ?? 0;
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
          await loadAppointments();
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

  const billInvoiceId = visitSnapshot?.invoice?.id ?? billingInvoiceIdHint ?? null;

  return (
    <div className="space-y-6">
      <AdminPageIntro
        title="Schedule"
        description="See who is coming in, filter by doctor or status, and check patients in from the front desk when they arrive."
        pageHelp={
          <>
            Use <strong>Day</strong> for the front-desk time grid (open gaps and provider columns), <strong>Week</strong> for Mon–Fri
            overview, <strong>Month</strong> for counts at a glance. Filters reload appointments from the server.{" "}
            <strong>Check In</strong> marks arrival like the kiosk.
          </>
        }
      />
      <section className="admin-panel w-full max-w-none">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-600">View</span>
            <HelpTip label="Calendar views">
              Day shows a time grid by provider. Week shows Monday–Friday with overlapping visits stacked. Month shows appointment counts;
              click a day to open it in Day view.
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

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">Filters</span>
          <HelpTip label="Filters">
            Provider limits the list to one doctor. Status matches the visit workflow (booked, checked-in, completed, etc.). Both send
            new requests to the server. Use the appointment drawer to mark <strong>no-show</strong>, <strong>cancel</strong>, or{" "}
            <strong>completed</strong>, or to <strong>reschedule</strong>—missed visits stop blocking the slot once marked.
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

        {error && (
          <div className="mb-3 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {loading ? (
          <Loader variant="page" label="Loading schedule" sublabel="Fetching your calendar…" />
        ) : (
          <AdminScheduleCalendar
            view={view}
            focusDate={focusDate}
            appointments={appointments}
            providers={providers}
            providerFilter={providerFilter}
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
            <div className="shrink-0 border-b border-slate-100 px-5 pb-4 pt-14">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">{selected.patient_name}</h2>
              <p className="mt-1 text-sm font-medium text-slate-600">{selected.service_name || "—"}</p>
              <p className="mt-3 text-sm text-slate-800">
                {formatWeekdayMonthDayYear(selected.appointment_date)} at{" "}
                {selected.start_time_display || formatTime(selected.start_time)}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Duration · {formatAppointmentDuration(selected.start_time, selected.end_time)}
              </p>
              <div className="mt-4 flex items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full shadow-sm ring-2 ring-white"
                  style={{ backgroundColor: providerColorForId(selected.provider) }}
                  aria-hidden
                />
                <span className="text-sm font-semibold text-slate-800">{selected.provider_name}</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${drawerStatusBadgeClass(selected.status)}`}
                >
                  {drawerStatusLabel(selected.status)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-100 pt-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Estimated price</span>
                <span className="text-sm font-semibold tabular-nums text-slate-900">
                  {estimatedPriceDisplay(visitSnapshot)}
                </span>
              </div>
              <p className="mt-3 font-mono text-[11px] text-slate-500">Appointment #{String(selected.id).padStart(5, "0")}</p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-3">
                {(selected.status === "cancelled" || selected.status === "no_show") && (
                  <p className="text-center text-sm text-slate-500">No actions available</p>
                )}

                {selected.status === "completed" && (
                  <button
                    type="button"
                    onClick={() => openBookNext(selected)}
                    className="w-full rounded-xl bg-[#16a349] px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-900/15 transition hover:bg-[#13823d]"
                  >
                    Book next visit
                  </button>
                )}

                {selected.status !== "cancelled" && selected.status !== "no_show" && selected.status !== "completed" && (
                  <>
                    {selected.status === "awaiting_payment" && (
                      <div className="rounded-xl border border-[#16a349]/30 bg-gradient-to-br from-[#ecfdf5] to-white p-4 shadow-sm ring-1 ring-[#16a349]/10">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#0d5c2e]">Billing</p>
                        <p className="mt-1 text-xs text-slate-600">
                          Preview the patient bill or adjust line items while this visit is awaiting payment.
                        </p>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                          {billInvoiceId != null ? (
                            <button
                              type="button"
                              disabled={previewingBill}
                              onClick={() => void openPatientBillPreview(billInvoiceId)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 sm:w-auto sm:flex-1"
                            >
                              {previewingBill ? "Opening…" : "Preview bill"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={billingHintLoading || visitSnapshotLoading}
                              className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-500 shadow-sm disabled:cursor-not-allowed sm:w-auto sm:flex-1"
                            >
                              {billingHintLoading || visitSnapshotLoading ? "Loading…" : "Preview bill"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setBillingEditForAppointment(selected)}
                            className="w-full rounded-xl border border-[#16a349]/50 bg-[#16a349] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#13823d] sm:w-auto sm:flex-1"
                          >
                            Edit billing
                          </button>
                        </div>
                        {billInvoiceId == null && !billingHintLoading && !visitSnapshotLoading && (
                          <p className="mt-2 text-[11px] text-slate-500">
                            Preview needs an invoice. If the doctor hasn&apos;t finished the visit yet, complete it first or use{" "}
                            <span className="font-medium text-slate-700">Invoices &amp; Billing</span> in the sidebar.
                          </p>
                        )}
                      </div>
                    )}

                    {selected.status !== "checked_in" &&
                      selected.status !== "in_consultation" &&
                      selected.status !== "completed" &&
                      selected.status !== "no_show" &&
                      selected.status !== "cancelled" && (
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={handleCheckIn}
                            disabled={checkingIn}
                            className="w-full rounded-xl bg-[#16a349] px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-900/15 transition hover:bg-[#13823d] disabled:opacity-50"
                          >
                            {checkingIn ? "Completing check-in…" : "Check in"}
                          </button>
                          <HelpTip label="Check-in" align="center">
                            Records arrival for this appointment (same API as the kiosk). The assigned doctor may get an SMS if their alert
                            number is set under Providers.
                          </HelpTip>
                        </div>
                      )}

                    {canRescheduleStaff(selected.status) && (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setShowReschedule((v) => !v)}
                          disabled={savingDesk}
                          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          {showReschedule ? "Hide reschedule" : "Reschedule"}
                        </button>
                        {showReschedule && (
                          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                            <label className="block text-xs font-semibold text-slate-600">
                              Date
                              <input
                                type="date"
                                value={resDate}
                                onChange={(e) => setResDate(e.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                              />
                            </label>
                            <label className="block text-xs font-semibold text-slate-600">
                              Start time
                              <input
                                type="time"
                                value={resTime}
                                onChange={(e) => setResTime(e.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                              />
                            </label>
                            <label className="block text-xs font-semibold text-slate-600">
                              Provider
                              <select
                                value={resProviderId}
                                onChange={(e) => setResProviderId(e.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                              >
                                {providers.map((p) => (
                                  <option key={p.id} value={String(p.id)}>
                                    {p.provider_name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              disabled={savingDesk || !resDate}
                              onClick={() => void submitReschedule()}
                              className="w-full rounded-xl bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
                            >
                              {savingDesk ? "Saving…" : "Save new time"}
                            </button>
                            <p className="text-[11px] text-slate-500">
                              End time is recalculated from the booked service length. The server blocks double-booking for that doctor.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {canMarkNoShowOrCancel(selected.status) && (
                      <div className="space-y-2">
                        {selected.service_type === "massage" &&
                          within24HoursBeforeStart(selected.appointment_date, selected.start_time) && (
                            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
                              <input
                                type="checkbox"
                                checked={waiveLateCancelFee}
                                onChange={(e) => setWaiveLateCancelFee(e.target.checked)}
                                className="mt-0.5"
                              />
                              <span>
                                <strong>Waive late-cancellation fee</strong> — check only if the patient called and you moved them to another
                                same-day slot (under 24h policy).
                              </span>
                            </label>
                          )}
                        <button
                          type="button"
                          disabled={savingDesk}
                          onClick={() => {
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
                          className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                        >
                          No-show
                        </button>
                        <button
                          type="button"
                          disabled={savingDesk}
                          onClick={() => {
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
                          className="w-full rounded-xl border-2 border-rose-300 bg-white px-4 py-3 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50"
                        >
                          Cancel visit
                        </button>
                      </div>
                    )}

                    {canMarkCompletedStaff(selected.status) && (
                      <button
                        type="button"
                        disabled={savingDesk}
                        onClick={() => {
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
                        className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        Mark completed
                      </button>
                    )}
                  </>
                )}
              </div>

              <div className="mt-8 border-t border-slate-200 pt-6">
                <h3 className="text-sm font-semibold text-slate-900">Visit details</h3>

                <div className="mt-4 space-y-3 rounded-xl border border-slate-200/90 bg-slate-50/40 p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Visit snapshot</p>
                    <HelpTip label="Visit snapshot" tone="emerald">
                      Handoff, notes, diagnosis, and line items for this appointment. When status is <strong>awaiting payment</strong>, use the
                      billing actions above for <strong>Preview bill</strong> and <strong>Edit billing</strong>.
                    </HelpTip>
                  </div>
                  {visitSnapshotLoading && <p className="text-xs text-slate-500">Loading visit details…</p>}
                  {!visitSnapshotLoading && visitSnapshot && visitSnapshotHasDetailContent(visitSnapshot) && (
                    <>
                      {visitSnapshot.visit_id != null && visitSnapshot.visit_status && (
                        <p className="text-xs text-slate-600">
                          <span className="font-semibold text-slate-500">Visit record:</span>{" "}
                          <span className="capitalize">{visitSnapshot.visit_status.replace(/_/g, " ")}</span>
                        </p>
                      )}
                      <SnapshotField label="Clinical handoff" value={visitSnapshot.clinical_handoff_notes} />
                      <SnapshotField label="Reason for visit" value={visitSnapshot.reason_for_visit} />
                      <SnapshotField label="Doctor notes" value={visitSnapshot.doctor_notes} />
                      <SnapshotField label="Diagnosis" value={visitSnapshot.diagnosis} />
                      {visitSnapshot.rendered_services.length > 0 ? (
                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white text-xs">
                          <table className="min-w-full border-collapse text-left">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50/90">
                                <th className="px-2 py-2 font-semibold text-slate-600">Service</th>
                                <th className="px-2 py-2 font-semibold text-slate-600">Code</th>
                                <th className="px-2 py-2 text-right font-semibold text-slate-600">Qty</th>
                                <th className="px-2 py-2 text-right font-semibold text-slate-600">Line</th>
                                <th className="px-2 py-2 text-center font-semibold text-slate-600">Pt</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visitSnapshot.rendered_services.map((row) => (
                                <tr key={row.service_id} className="border-b border-slate-100 last:border-0">
                                  <td className="px-2 py-1.5 text-slate-800">{row.service_name}</td>
                                  <td className="px-2 py-1.5 font-mono text-slate-600">{row.billing_code || "—"}</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{row.quantity}</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-800">{row.line_total}</td>
                                  <td className="px-2 py-1.5 text-center text-slate-600">{row.charges_patient ? "Y" : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">No line items on this visit yet.</p>
                      )}
                      {visitSnapshot.invoice && (
                        <div className="space-y-1 text-xs text-slate-700">
                          <p>
                            <span className="font-semibold text-slate-500">Invoice:</span> {visitSnapshot.invoice.invoice_number} · $
                            {visitSnapshot.invoice.total_amount}{" "}
                            <span className="text-slate-500">({visitSnapshot.invoice.status})</span>
                          </p>
                          {parseFloat(visitSnapshot.invoice.discount || "0") > 0 ? (
                            <div className="space-y-0.5">
                              <p className="text-emerald-700">
                                <span className="font-semibold">Professional discount (internal):</span> ${visitSnapshot.invoice.discount}
                              </p>
                              {parseFloat(visitSnapshot.invoice.credit_applied_total || "0") > 0 ? (
                                <p className="text-emerald-700">
                                  <span className="font-semibold">Credit applied (wallet):</span> $
                                  {visitSnapshot.invoice.credit_applied_total}
                                </p>
                              ) : null}
                              {visitSnapshot.invoice.professional_discount_reason?.trim() ? (
                                <p className="text-slate-600">
                                  <span className="font-semibold">Reason:</span> {visitSnapshot.invoice.professional_discount_reason}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </>
                  )}
                  {!visitSnapshotLoading && visitSnapshot && !visitSnapshotHasDetailContent(visitSnapshot) && (
                    <p className="text-sm text-slate-500">No visit notes yet</p>
                  )}
                  {!visitSnapshotLoading && !visitSnapshot && (
                    <p className="text-xs text-slate-500">Could not load visit details for this appointment.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-200 bg-slate-50/90 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Patient contact</p>
              <div className="mt-2 space-y-2 text-sm">
                {patientQuickLoading ? (
                  <p className="text-slate-500">Loading contact…</p>
                ) : (
                  <>
                    {patientQuick?.phone?.trim() ? (
                      <a
                        href={`tel:${patientQuick.phone.replace(/\D/g, "")}`}
                        className="block font-medium text-[#0d5c2e] underline decoration-[#16a349]/30 underline-offset-2 hover:text-[#13823d]"
                      >
                        {formatSchedulePhoneDisplay(patientQuick.phone) || patientQuick.phone}
                      </a>
                    ) : (
                      <p className="text-slate-500">Phone not on file</p>
                    )}
                    {patientQuick?.email?.trim() ? (
                      <a href={`mailto:${patientQuick.email.trim()}`} className="block break-all text-slate-700 hover:text-[#0d5c2e]">
                        {patientQuick.email.trim()}
                      </a>
                    ) : null}
                    <Link
                      href={`/admin/patients/${selected.patient}/history`}
                      className="inline-block text-sm font-semibold text-[#16a349] hover:text-[#13823d]"
                    >
                      View full patient profile
                    </Link>
                  </>
                )}
              </div>
            </div>
          </SheetContent>
        ) : null}
      </Sheet>

      {bookNextAppt && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-book-next-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 id="admin-book-next-title" className="text-lg font-bold text-slate-900">
              Book next visit
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Schedule a new appointment for <span className="font-semibold text-slate-800">{bookNextAppt.patient_name}</span>. Only times
              that match online booking rules are shown.
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
                      const pid = provs.some((p) => p.id === bookNextAppt.provider) ? bookNextAppt.provider : provs[0]?.id ?? 0;
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

function SnapshotField({ label, value }: { label: string; value: string }) {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">{trimmed}</p>
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
