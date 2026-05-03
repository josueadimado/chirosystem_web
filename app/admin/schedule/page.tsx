"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { AdminVisitBillingModal } from "@/components/admin-visit-billing-modal";
import { useAppFeedback } from "@/components/app-feedback";
import { HelpTip } from "@/components/help-tip";
import { IconCalendar } from "@/components/icons";
import { Loader } from "@/components/loader";
import { StatusChipView, appointmentStatusStripeClass } from "@/components/status-chip";
import { PatientBillPortalModal } from "@/components/patient-bill-portal-modal";
import { ApiError, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import type { PatientBillPayload } from "@/lib/patient-bill-print";
import { formatWeekdayMonthDayYear } from "@/lib/format-date";
import { Suspense, useEffect, useState } from "react";
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
  invoice: { id: number; invoice_number: string; total_amount: string; status: string } | null;
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

function getWeekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

function AdminSchedulePageContent() {
  const { runWithFeedback, toast } = useAppFeedback();
  const searchParams = useSearchParams();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [view, setView] = useState<"week" | "day">("week");
  const [providerFilter, setProviderFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return d;
  });
  const [selectedDate, setSelectedDate] = useState(() => new Date());
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
      const params = new URLSearchParams();
      if (view === "week") {
        const start = new Date(weekStart);
        const end = new Date(weekStart);
        end.setDate(end.getDate() + 6);
        params.set("date_from", start.toISOString().slice(0, 10));
        params.set("date_to", end.toISOString().slice(0, 10));
      } else {
        params.set("appointment_date", selectedDate.toISOString().slice(0, 10));
      }
      if (providerFilter) params.set("provider_id", providerFilter);
      if (statusFilter) params.set("status", statusFilter);

      const list = await apiGetAuth<Appointment[]>(`/appointments/?${params}`);
      setAppointments(list);
      setSelected((prev) => {
        if (!prev) return null;
        const fresh = list.find((a) => a.id === prev.id);
        return fresh ?? null;
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load schedule.");
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  useEffect(() => {
    loadAppointments();
  }, [view, weekStart, selectedDate, providerFilter, statusFilter]);

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

  /** Update one visit (status, time, or provider). Reloads the calendar and keeps the side panel in sync. */
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

  const dates = view === "week" ? getWeekDates(weekStart) : [selectedDate];

  /** Fresh patient-facing bill while the invoice is still unpaid (admin can open from schedule). */
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

  const appointmentsByDate = dates.reduce(
    (acc, d) => {
      const key = d.toISOString().slice(0, 10);
      acc[key] = appointments.filter((a) => a.appointment_date === key);
      return acc;
    },
    {} as Record<string, Appointment[]>
  );

  const billInvoiceId = visitSnapshot?.invoice?.id ?? billingInvoiceIdHint ?? null;

  return (
    <div className="space-y-6">
      <AdminPageIntro
        title="Schedule"
        description="See who is coming in, filter by doctor or status, and check patients in from the front desk when they arrive."
        pageHelp={
          <>
            <strong>Week</strong> shows seven columns; <strong>Day</strong> focuses on one date. Filters query the server when you change
            them. <strong>Check In</strong> marks the selected visit as arrived (same action families use at the kiosk).
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <section className="admin-panel">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-600">View</span>
            <HelpTip label="Week vs day">
              Week shows Sunday–Saturday around your chosen week. Day shows a single calendar date—use the arrows or picker implied by
              navigation to move.
            </HelpTip>
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
              onClick={() => setView("day")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                view === "day"
                  ? "bg-[#16a349] text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Day
            </button>
            {view === "week" && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(weekStart);
                    d.setDate(d.getDate() - 7);
                    setWeekStart(d);
                  }}
                  className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(weekStart);
                    d.setDate(d.getDate() + 7);
                    setWeekStart(d);
                  }}
                  className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100"
                >
                  →
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">Filters</span>
          <HelpTip label="Filters">
            Provider limits the list to one doctor. Status matches the visit workflow (booked, checked-in, completed, etc.). Both send
            new requests to the server. Use the side panel to mark <strong>no-show</strong>, <strong>cancel</strong>, or{' '}
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
          <div
            className={`grid gap-2 text-xs ${
              view === "week" ? "grid-cols-7" : "grid-cols-1"
            }`}
          >
            {dates.map((d) => {
              const key = d.toISOString().slice(0, 10);
              const dayAppts = appointmentsByDate[key] || [];
              return (
                <div
                  key={key}
                  className="rounded-lg border border-slate-200 p-2"
                >
                  <p className="font-semibold leading-tight">
                    {formatWeekdayMonthDayYear(key)}
                  </p>
                  <div className="mt-2 space-y-2">
                    {dayAppts.length === 0 ? (
                      <p className="py-2 text-slate-400">No appointments</p>
                    ) : (
                      dayAppts.map((a) => {
                        const isSelected = selected?.id === a.id;
                        const timeStr =
                          a.start_time_display || formatTime(a.start_time);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setSelected(a)}
                            className={`w-full rounded-lg p-2 pl-2.5 text-left transition ${appointmentStatusStripeClass(a.status)} ${
                              isSelected
                                ? "bg-[#16a349]/20 ring-2 ring-[#16a349]/50"
                                : "bg-[#16a349]/10 hover:bg-[#16a349]/15"
                            }`}
                          >
                            <span className="font-medium">{timeStr}</span>
                            <br />
                            <span className="text-slate-700">
                              {a.patient_name}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <aside className="admin-panel flex min-h-[min(22rem,65vh)] flex-col gap-5 ring-1 ring-[#16a349]/15 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto">
        <AdminSectionLabel help="Choose an appointment on the left. Actions here apply only to that visit.">
          Visit details
        </AdminSectionLabel>

        {selected ? (
          <div className="flex min-h-0 flex-1 flex-col gap-5">
            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-[#ecfdf5] via-white to-white shadow-sm shadow-emerald-900/5 ring-1 ring-[#16a349]/10">
              <div className="flex gap-3 p-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#16a349]/15 text-lg font-bold text-[#0d5c2e] shadow-inner">
                  {selected.patient_name.trim().charAt(0).toUpperCase() || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#13823d]">Patient</p>
                  <p className="truncate text-lg font-bold tracking-tight text-slate-900">{selected.patient_name}</p>
                  <p className="mt-1 text-sm font-medium text-[#0d5c2e]">
                    {selected.start_time_display || formatTime(selected.start_time)}
                    <span className="mx-1.5 font-normal text-slate-400">–</span>
                    {selected.end_time_display || formatTime(selected.end_time)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{formatWeekdayMonthDayYear(selected.appointment_date)}</p>
                </div>
              </div>
              <div className="border-t border-slate-200/80 bg-white/70 px-4 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Appointment</p>
                <p className="font-mono text-xs text-slate-600">#{String(selected.id).padStart(5, "0")}</p>
              </div>
            </div>

            <dl className="space-y-0 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Provider</dt>
                <dd className="max-w-[65%] text-right text-sm font-medium text-slate-800">{selected.provider_name}</dd>
              </div>
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Service</dt>
                <dd className="max-w-[65%] text-right text-sm font-medium text-slate-800">
                  {selected.service_name || "—"}
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</dt>
                <dd>
                  <StatusChipView status={selected.status === "booked" ? "scheduled" : selected.status} />
                </dd>
              </div>
            </dl>

            {selected.status === "awaiting_payment" && (
              <div className="rounded-xl border border-[#16a349]/30 bg-gradient-to-br from-[#ecfdf5] to-white p-4 shadow-sm ring-1 ring-[#16a349]/10">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#0d5c2e]">Billing</p>
                <p className="mt-1 text-xs text-slate-600">
                  Preview the patient bill or adjust line items while this visit is awaiting payment.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {billInvoiceId != null ? (
                    <button
                      type="button"
                      disabled={previewingBill}
                      onClick={() => void openPatientBillPreview(billInvoiceId)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                    >
                      {previewingBill ? "Opening…" : "Preview bill"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={billingHintLoading || visitSnapshotLoading}
                      className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-500 shadow-sm disabled:cursor-not-allowed"
                    >
                      {billingHintLoading || visitSnapshotLoading ? "Loading…" : "Preview bill"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setBillingEditForAppointment(selected)}
                    className="rounded-xl border border-[#16a349]/50 bg-[#16a349] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#13823d]"
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

            <div className="space-y-3 rounded-xl border border-slate-200/90 bg-slate-50/40 p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Visit snapshot</p>
                <HelpTip label="Visit snapshot" tone="emerald">
                  Handoff, notes, diagnosis, and line items for this appointment. When status is <strong>awaiting payment</strong>, use the
                  green <strong>Billing</strong> box above for <strong>Preview bill</strong> and <strong>Edit billing</strong>.
                </HelpTip>
              </div>
              {visitSnapshotLoading && (
                <p className="text-xs text-slate-500">Loading visit details…</p>
              )}
              {!visitSnapshotLoading && visitSnapshot && (
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
                    <p className="text-xs text-slate-700">
                      <span className="font-semibold text-slate-500">Invoice:</span>{" "}
                      {visitSnapshot.invoice.invoice_number} · ${visitSnapshot.invoice.total_amount}{" "}
                      <span className="text-slate-500">({visitSnapshot.invoice.status})</span>
                    </p>
                  )}
                </>
              )}
              {!visitSnapshotLoading && !visitSnapshot && (
                <p className="text-xs text-slate-500">Could not load visit details for this appointment.</p>
              )}
            </div>

            <div className="mt-auto flex flex-col gap-2.5 border-t border-slate-200/90 pt-4">
              {canRescheduleStaff(selected.status) && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowReschedule((v) => !v)}
                    disabled={savingDesk}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {showReschedule ? "Hide reschedule" : "Reschedule"}
                  </button>
                  {showReschedule && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-2">
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
                          <strong>Waive late-cancellation fee</strong> — check only if the patient called and you moved
                          them to another same-day slot (under 24h policy).
                        </span>
                      </label>
                    )}
                  <div className="flex flex-wrap gap-2">
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
                          }
                        );
                      }}
                      className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
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
                          }
                        );
                      }}
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Cancel visit
                    </button>
                  </div>
                </div>
              )}

              {canMarkCompletedStaff(selected.status) && (
                <button
                  type="button"
                  disabled={savingDesk}
                  onClick={() => {
                    if (!confirm("Mark this visit completed without going through checkout here? Use when payment was handled elsewhere."))
                      return;
                    void runWithFeedback(
                      async () => {
                        await patchAppointment(selected.id, { status: "completed" });
                      },
                      {
                        loadingMessage: "Updating…",
                        successMessage: "Marked completed.",
                        errorFallback: "Could not complete.",
                      }
                    );
                  }}
                  className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950 hover:bg-emerald-100 disabled:opacity-50"
                >
                  Mark completed
                </button>
              )}

              {selected.status !== "checked_in" &&
                selected.status !== "in_consultation" &&
                selected.status !== "completed" &&
                selected.status !== "no_show" &&
                selected.status !== "cancelled" && (
                  <div className="flex w-full items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCheckIn}
                      disabled={checkingIn}
                      className="min-w-0 flex-1 rounded-xl bg-[#16a349] px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-900/15 transition hover:bg-[#13823d] disabled:opacity-50"
                    >
                      {checkingIn ? "Completing check-in…" : "Check-in"}
                    </button>
                    <HelpTip label="Check-in" align="center">
                      Records arrival for this appointment (same API as the kiosk). The assigned doctor may get an SMS if their alert
                      number is set under Providers.
                    </HelpTip>
                  </div>
                )}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-gradient-to-b from-slate-50/70 to-white px-5 py-12 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#16a349]/10 text-[#16a349] shadow-inner">
              <IconCalendar className="h-7 w-7" />
            </span>
            <p className="text-sm font-semibold text-slate-800">No appointment selected</p>
            <p className="mx-auto mt-2 max-w-[15rem] text-sm leading-relaxed text-slate-500">
              Click a time slot on the calendar to see who is booked, the provider, and check-in actions.
            </p>
          </div>
        )}
      </aside>
      </div>

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
