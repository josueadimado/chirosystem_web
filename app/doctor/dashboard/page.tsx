"use client";

import { DoctorEmptyWell, DoctorPageIntro, DoctorSectionLabel, DoctorStatsRow, doctorGreeting } from "@/components/doctor-shell";
import { HelpTip } from "@/components/help-tip";
import { IconStethoscope } from "@/components/icons";
import { Loader } from "@/components/loader";
import { PatientDetailModal } from "@/components/patient-detail-modal";
import { StripeTerminalCollect } from "@/components/stripe-terminal-collect";
import { ApiError, apiGetAuth, apiPost } from "@/lib/api";
import type { PatientBillPayload } from "@/lib/patient-bill-print";
import { openPatientBillPrint } from "@/lib/patient-bill-print";
import { useEffect, useMemo, useState } from "react";

type Appointment = {
  id: number;
  patient: string;
  patient_id: number;
  service: string;
  booked_service_id: number | null;
  start_time: string;
  end_time: string;
  status: string;
  reason_for_visit: string;
  visit_id?: number;
};

type ServiceOpt = {
  id: number;
  name: string;
  price: string;
  billing_code: string;
  is_active: boolean;
};

type BillLine = { service_id: number; quantity: string; unit_price: string };

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
  const [terminalClientSecret, setTerminalClientSecret] = useState<string | null>(null);
  const [terminalLocationId, setTerminalLocationId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    setDisplayName(localStorage.getItem("chiroflow_user_name") || "");
  }, []);

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
        help: "Front desk (or kiosk) marked them arrived. Tap Start visit on their row when you are ready to see them.",
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

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const appts = await apiGetAuth<Appointment[]>(`/doctor/appointments/?date=${selectedDate}`);
      setAppointments(appts);
      const inConsult = appts.find((a) => a.status === "in_consultation");
      setActiveAppt(inConsult ?? null);
      if (inConsult?.visit_id) {
        setDoctorNotes("");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load.");
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [selectedDate]);

  useEffect(() => {
    apiGetAuth<ServiceOpt[]>("/services/")
      .then((list) => setServices(list.filter((s) => s.is_active)))
      .catch(() => setServices([]));
  }, []);

  /** Terminal internet readers need a location id from the API; simulated mode works in Stripe test without it. */
  useEffect(() => {
    if (!paymentFollowUp || paymentFollowUp.payment.charged) {
      setTerminalLocationId(null);
      return;
    }
    apiGetAuth<{ location_id: string; has_location: boolean }>("/doctor/terminal_reader_config/")
      .then((c) => setTerminalLocationId(c.has_location && c.location_id ? c.location_id : null))
      .catch(() => setTerminalLocationId(null));
  }, [paymentFollowUp]);

  useEffect(() => {
    if (!activeAppt?.booked_service_id) {
      setBillLines([]);
      setDiagnosis("");
      return;
    }
    setBillLines([{ service_id: activeAppt.booked_service_id, quantity: "1", unit_price: "" }]);
    setDiagnosis("");
  }, [activeAppt?.id, activeAppt?.booked_service_id]);

  const startVisit = async (appt: Appointment) => {
    setIsStarting(true);
    setError("");
    try {
      await apiPost(`/doctor/${appt.id}/start_visit/`, {});
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to start visit.");
    } finally {
      setIsStarting(false);
    }
  };

  const completeVisit = async () => {
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
      setError("Add at least one service line for this visit (adjust or add rows below).");
      return;
    }
    setIsCompleting(true);
    setError("");
    try {
      const result = await apiPost<{
        invoice_id: number;
        invoice_number: string;
        total_amount: string;
        payment: CompleteVisitPayment;
      }>(`/doctor/${activeAppt.id}/complete_visit/`, {
        doctor_notes: doctorNotes,
        diagnosis,
        rendered_services: rendered,
        charge_saved_card_if_present: chargeSavedCard,
      });
      const bill = await apiGetAuth<PatientBillPayload>(`/doctor/invoice_bill/?invoice_id=${result.invoice_id}`);
      openPatientBillPrint(bill);
      setPaymentFollowUp({
        invoice_id: result.invoice_id,
        invoice_number: result.invoice_number,
        total_amount: result.total_amount,
        payment: result.payment,
      });
      setTerminalClientSecret(null);
      setActiveAppt(null);
      setDoctorNotes("");
      setDiagnosis("");
      setBillLines([]);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to complete.");
    } finally {
      setIsCompleting(false);
    }
  };

  const prepareTerminalPayment = async () => {
    if (!paymentFollowUp) return;
    setTerminalBusy(true);
    setError("");
    try {
      const out = await apiPost<{ client_secret: string; payment_intent_id: string }>(
        "/doctor/terminal_payment_intent/",
        { invoice_id: paymentFollowUp.invoice_id }
      );
      setTerminalClientSecret(out.client_secret);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create terminal payment.");
    } finally {
      setTerminalBusy(false);
    }
  };

  const onTerminalSdkPaid = () => {
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
        : null
    );
    setTerminalClientSecret(null);
  };

  const addBillLine = () => {
    const first = services[0]?.id;
    if (!first) return;
    setBillLines((rows) => [...rows, { service_id: first, quantity: "1", unit_price: "" }]);
  };

  const statusDisplay = (s: string) => {
    const map: Record<string, string> = {
      booked: "scheduled",
      confirmed: "scheduled",
      checked_in: "checked_in",
      in_consultation: "in_consultation",
      awaiting_payment: "awaiting_payment",
      completed: "completed",
    };
    return (map[s] || s) as "scheduled" | "checked_in" | "in_consultation" | "completed" | "awaiting_payment";
  };

  const badgeLabel = (s: string) => {
    const map: Record<string, string> = {
      scheduled: "SCHEDULED",
      booked: "SCHEDULED",
      confirmed: "SCHEDULED",
      checked_in: "CHECKED IN",
      in_consultation: "IN CONSULTATION",
      completed: "COMPLETED",
      awaiting_payment: "AWAITING PAYMENT",
    };
    return map[s] ?? s.toUpperCase().replaceAll("_", " ");
  };

  return (
    <div className="space-y-8">
      <DoctorPageIntro
        eyebrow="Clinical workspace"
        title={`${doctorGreeting()}, ${firstName}`}
        description="See who you're treating today, start visits when patients check in, and wrap up with billing. After you complete a visit, you'll get payment options so nothing is missed at the desk."
        pageHelp={
          <>
            This page is your <strong>daily command center</strong>: pick a date, work down the list, and use the right column when
            someone is in consultation. Completing a visit creates the bill and then shows ways to collect payment before they leave.
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
                  Paid — their saved card was charged. They are clear to go.
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
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={prepareTerminalPayment}
                    disabled={terminalBusy}
                    className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {terminalBusy ? "Creating…" : "Use card reader (terminal) at the desk"}
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
                paymentFollowUp.payment.status === "stripe_not_configured" && (
                  <p className="mt-2 text-sm text-slate-600">
                    Stripe is not set up on the server — take payment at the desk (cash, external terminal, etc.) and
                    record it in your usual workflow.
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
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setPaymentFollowUp(null)}
                className="text-sm font-medium text-slate-500 hover:text-slate-800"
              >
                Dismiss (after paid)
              </button>
            </div>
          </div>
          {terminalClientSecret && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-semibold text-amber-950">Card reader — next step</p>
              <p className="mt-1 text-amber-900">
                Prefer this browser flow if you use a Stripe-supported reader. Otherwise use desk checkout — it works
                without Terminal.
              </p>
              <StripeTerminalCollect
                clientSecret={terminalClientSecret}
                locationId={terminalLocationId}
                onSuccess={onTerminalSdkPaid}
              />
              <details className="mt-3 rounded border border-amber-200/80 bg-white/60 p-2">
                <summary className="cursor-pointer text-xs font-semibold text-amber-950">
                  Manual client secret (other POS / integration)
                </summary>
                <p className="mt-2 text-xs text-amber-900">
                  Paste into software that already integrates with Stripe Terminal. Not needed for desk checkout.
                </p>
                <textarea
                  readOnly
                  className="mt-2 w-full rounded border border-amber-200 bg-white p-2 font-mono text-xs"
                  rows={3}
                  value={terminalClientSecret}
                />
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-amber-900 underline"
                  onClick={() => void navigator.clipboard.writeText(terminalClientSecret)}
                >
                  Copy secret
                </button>
              </details>
            </div>
          )}
        </section>
      )}
      <section className="doctor-panel">
        <DoctorSectionLabel
          help="Only visits where you are the provider. Click a patient name to open their chart. Checked-in patients show a Start visit button."
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
                role="button"
                tabIndex={0}
                onClick={() => setPatientDetailId(appt.patient_id)}
                onKeyDown={(e) => e.key === "Enter" && setPatientDetailId(appt.patient_id)}
                className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3.5 transition hover:shadow-sm ${
                  activeAppt?.id === appt.id
                    ? "border-[#16a349]/45 bg-gradient-to-r from-[#16a349]/12 to-emerald-50/50 shadow-sm"
                    : "border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className="w-12 shrink-0 text-sm font-medium text-slate-600">{appt.start_time}</span>
                  <div>
                    <p className="font-semibold text-slate-900">{appt.patient}</p>
                    <p className="text-sm text-slate-500">{appt.service || "Follow-up"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      appt.status === "completed"
                        ? "bg-emerald-100 text-emerald-700"
                        : appt.status === "in_consultation"
                          ? "bg-cyan-100 text-cyan-700"
                          : appt.status === "checked_in"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {badgeLabel(statusDisplay(appt.status))}
                  </span>
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
                </div>
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
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Reason for visit</p>
              <p className="text-sm text-slate-700">{activeAppt.reason_for_visit || "No reason noted."}</p>
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
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Services performed (CPT / fees)</p>
                <HelpTip label="Service lines" tone="emerald">
                  Each line is one billable service. Quantity multiplies the fee. Leave fee override blank to use the clinic default
                  price for that service.
                </HelpTip>
              </div>
              <p className="mb-2 text-xs text-slate-500">
                Add or change lines to match what was done today. Default price comes from the service; override fee if
                needed.
              </p>
              <div className="space-y-2">
                {billLines.map((line, idx) => (
                  <div key={idx} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2">
                    <label className="min-w-[140px] flex-1 text-xs">
                      <span className="text-slate-500">Service</span>
                      <select
                        className="mt-0.5 w-full rounded border border-slate-200 bg-white p-1.5 text-sm"
                        value={line.service_id}
                        onChange={(e) => {
                          const id = Number(e.target.value);
                          setBillLines((rows) => rows.map((r, i) => (i === idx ? { ...r, service_id: id } : r)));
                        }}
                      >
                        {services.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} (${s.price})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="w-16 text-xs">
                      <span className="text-slate-500">Units</span>
                      <input
                        type="number"
                        min={1}
                        className="mt-0.5 w-full rounded border border-slate-200 bg-white p-1.5 text-sm"
                        value={line.quantity}
                        onChange={(e) => {
                          const v = e.target.value;
                          setBillLines((rows) => rows.map((r, i) => (i === idx ? { ...r, quantity: v } : r)));
                        }}
                      />
                    </label>
                    <label className="w-24 text-xs">
                      <span className="text-slate-500">Fee override</span>
                      <input
                        className="mt-0.5 w-full rounded border border-slate-200 bg-white p-1.5 text-sm"
                        placeholder="Auto"
                        value={line.unit_price}
                        onChange={(e) => {
                          const v = e.target.value;
                          setBillLines((rows) => rows.map((r, i) => (i === idx ? { ...r, unit_price: v } : r)));
                        }}
                      />
                    </label>
                    {billLines.length > 1 && (
                      <button
                        type="button"
                        className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                        onClick={() => setBillLines((rows) => rows.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addBillLine}
                className="mt-2 text-sm font-medium text-[#16a349] hover:underline"
              >
                + Add service line
              </button>
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
                {isCompleting ? "Completing…" : "Complete visit & print patient bill"}
              </button>
              <HelpTip label="Complete visit" align="center" tone="emerald">
                Finalizes clinical documentation for this visit, builds the invoice from your service lines, opens a printable bill for
                the patient, and shows the payment banner if money is still due.
              </HelpTip>
            </div>
            <p className="text-xs text-slate-500">
              Creates the bill and opens print view. Plan for payment at the desk before they leave — the green banner
              after this step walks through reader, saved card, or tablet checkout.
            </p>
          </>
        ) : (
          <DoctorEmptyWell
            title="No active visit"
            description="When a patient is checked in, tap Start visit on their row. Their chart, services, and notes will open here."
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
              <IconStethoscope className="h-6 w-6" />
            </span>
          </DoctorEmptyWell>
        )}
      </aside>
      {patientDetailId && (
        <PatientDetailModal patientId={patientDetailId} onClose={() => setPatientDetailId(null)} />
      )}
      </div>
    </div>
  );
}
