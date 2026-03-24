"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
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
  duration_minutes: number;
  price: string;
  service_type?: string;
  allow_provider_choice?: boolean;
};
type ProviderOption = { id: number; provider_name: string };
type BookingOptions = { services: ServiceOption[]; providers_by_service: Record<number, ProviderOption[]> };

const ALL_TIME_SLOTS = ["9:00 AM", "10:15 AM", "2:30 PM", "3:45 PM", "5:15 PM"];

export default function BookingPage() {
  const { toast } = useAppFeedback();
  const today = new Date().toISOString().slice(0, 10);
  const [options, setOptions] = useState<BookingOptions | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [step, setStep] = useState<Step>(1);
  const [selectedService, setSelectedService] = useState<ServiceOption | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderOption | null>(null);
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
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [patientLookup, setPatientLookup] = useState<"idle" | "loading" | "returning" | "new">("idle");

  const fetchOptions = () => {
    setOptionsError("");
    setOptionsLoading(true);
    withMinimumDelay(apiGet<BookingOptions>("/booking-options/"), 520)
      .then((data) => {
        setOptions(data);
        if (data.services.length > 0) setSelectedService(data.services[0]);
      })
      .catch(() => setOptionsError("Could not load booking options. Make sure the API is running, then try again."))
      .finally(() => setOptionsLoading(false));
  };

  useEffect(() => {
    fetchOptions();
  }, []);

  useEffect(() => {
    if (!selectedService || !selectedProvider || !selectedDate) {
      setAvailableSlots(null);
      return;
    }
    setSlotsLoading(true);
    apiGet<{ available_slots: string[] }>(
      `/booking-options/availability/?date=${selectedDate}&provider_id=${selectedProvider.id}&service_id=${selectedService.id}`
    )
      .then((res) => {
        setAvailableSlots(res.available_slots);
        setSlotWarning("");
      })
      .catch(() => setAvailableSlots(ALL_TIME_SLOTS))
      .finally(() => setSlotsLoading(false));
  }, [selectedDate, selectedProvider, selectedService]);

  // Reset selected time if it's no longer available when date/provider changes
  useEffect(() => {
    if (availableSlots && availableSlots.length > 0 && !availableSlots.includes(selectedTime)) {
      setSelectedTime(availableSlots[0]);
    }
  }, [availableSlots]);

  // Look up returning patient by phone when valid (Step 4)
  useEffect(() => {
    if (step !== 4 || !phone || !isValidPhoneNumber(phone)) {
      if (step !== 4) setPatientLookup("idle");
      return;
    }
    const t = setTimeout(() => {
      setPatientLookup("loading");
      apiGet<{ found: boolean; first_name?: string; last_name?: string; email?: string }>(
        `/booking-options/patient-lookup/?phone=${encodeURIComponent(phone)}`
      )
        .then((res) => {
          if (res.found && res.first_name != null && res.last_name != null) {
            setFirstName(res.first_name);
            setLastName(res.last_name);
            setEmail(res.email ?? "");
            setPatientLookup("returning");
          } else {
            setPatientLookup("new");
          }
        })
        .catch(() => setPatientLookup("new"));
    }, 500);
    return () => clearTimeout(t);
  }, [step, phone]);

  const providersForService = selectedService && options
    ? (options.providers_by_service?.[selectedService.id] ?? [])
    : [];
  const canSubmit = selectedService && selectedProvider;

  const goToNextStep = () => {
    if (step < 4) {
      setStep((step + 1) as Step);
    }
  };

  const goToPreviousStep = () => {
    if (step > 1) {
      // Chiropractic skips provider step: Back from step 3 goes to step 1
      if (step === 3 && selectedService && !selectedService.allow_provider_choice) {
        setStep(1);
      } else {
        setStep((step - 1) as Step);
      }
    }
  };

  /** After a successful booking, return to the start of the flow and scroll up. */
  const resetBookingFlow = () => {
    setBookingResult(null);
    setBookingMessage("");
    setStep(1);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const submitBooking = async () => {
    if (!selectedService || !selectedProvider) return;
    setBookingMessage("");
    setSlotWarning("");
    const nextErrors: FormErrors = {};
    if (!firstName.trim()) nextErrors.firstName = "First name is required.";
    if (!lastName.trim()) nextErrors.lastName = "Last name is required.";
    if (!email.trim()) {
      nextErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = "Please enter a valid email address.";
    }
    if (!phone || !isValidPhoneNumber(phone)) {
      nextErrors.phone = "Please enter a valid phone number.";
    }
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setBookingMessageKind("error");
      setBookingMessage("Please correct the highlighted fields.");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await apiPostPublic<BookingResult>(
        "/appointments/book/",
        {
          first_name: firstName,
          last_name: lastName,
          phone,
          email,
          service_id: selectedService.id,
          provider_id: selectedProvider.id,
          provider_name: selectedProvider.provider_name,
          service_name: selectedService.name,
          service_duration_minutes: selectedService.duration_minutes,
          service_price: selectedService.price,
          appointment_date: selectedDate,
          start_time: selectedTime,
        }
      );
      setBookingResult(result);
      setBookingMessageKind("success");
      setBookingMessage(`Appointment booked successfully. Booking ID: ${result.appointment_id}`);
      toast.success("Appointment confirmed! Your confirmation is on screen.");
    } catch (error) {
      setBookingMessageKind("error");
      if (error instanceof ApiError && error.status === 409) {
        setStep(3);
        setSlotWarning(error.message);
        setBookingMessage("Please select another available time slot.");
        toast.info("That time is no longer available — please choose another slot.");
      } else {
        setBookingMessage("Could not complete booking yet. Please check API/server setup and try again.");
        toast.error(
          error instanceof ApiError ? error.message : "Could not complete booking. Please try again.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const printBookingConfirmation = () => {
    if (!bookingResult) return;

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      setBookingMessageKind("error");
      setBookingMessage("Could not open print window. Please allow pop-ups and try again.");
      toast.error("Allow pop-ups for this site to print your confirmation.");
      return;
    }

    // Safe text for HTML (names/services may contain special characters)
    const esc = (s: string | number) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const id = esc(bookingResult.appointment_id);
    const patient = esc(bookingResult.patient);
    const service = esc(bookingResult.service);
    const provider = esc(bookingResult.provider);
    const apptDate = esc(bookingResult.appointment_date);
    const startTime = esc(bookingResult.start_time);
    const total = esc(bookingResult.total_amount);
    const generated = esc(new Date().toLocaleString());
    const showProvider = bookingResult.service_type !== "chiropractic";

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Appointment confirmation — Relief Chiropractic</title>
    <style>
      @page {
        margin: 14mm 16mm;
        size: letter;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 20px;
        font-family: "Georgia", "Times New Roman", serif;
        color: #1e293b;
        background: #f1f5f9;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .screen-note {
        max-width: 640px;
        margin: 0 auto 16px;
        padding: 10px 14px;
        font-family: system-ui, sans-serif;
        font-size: 13px;
        color: #475569;
        text-align: center;
        background: #fff;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
      }
      .form {
        max-width: 640px;
        margin: 0 auto;
        background: #fff;
        border: 2px solid #0f172a;
        box-shadow: 0 4px 24px rgba(15, 23, 42, 0.08);
      }
      .form-accent {
        height: 6px;
        background: linear-gradient(90deg, #16a349 0%, #16a349 38%, #e9982f 38%, #e9982f 100%);
      }
      .form-inner {
        padding: 28px 32px 32px;
      }
      .form-header {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        padding-bottom: 20px;
        margin-bottom: 20px;
        border-bottom: 2px solid #0f172a;
      }
      .clinic-name {
        margin: 0;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 26px;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: #e9982f;
      }
      .doc-title {
        margin: 4px 0 0;
        font-family: system-ui, sans-serif;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: #64748b;
      }
      .badge-wrap { text-align: right; }
      .badge {
        display: inline-block;
        padding: 8px 14px;
        font-family: system-ui, sans-serif;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #166534;
        background: #dcfce7;
        border: 1px solid #86efac;
        border-radius: 4px;
      }
      .ref-block {
        margin-bottom: 24px;
        padding: 16px 18px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-left: 4px solid #16a349;
      }
      .ref-label {
        margin: 0 0 6px;
        font-family: system-ui, sans-serif;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #64748b;
      }
      .ref-number {
        margin: 0;
        font-family: ui-monospace, "Cascadia Code", monospace;
        font-size: 28px;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: 0.04em;
      }
      .section-title {
        margin: 0 0 12px;
        font-family: system-ui, sans-serif;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #334155;
      }
      table.details {
        width: 100%;
        border-collapse: collapse;
        font-family: system-ui, sans-serif;
        font-size: 14px;
        border: 1px solid #cbd5e1;
      }
      table.details tr {
        border-bottom: 1px solid #e2e8f0;
      }
      table.details tr:last-child { border-bottom: none; }
      table.details th {
        width: 38%;
        margin: 0;
        padding: 12px 14px;
        text-align: left;
        font-weight: 600;
        font-size: 12px;
        color: #475569;
        background: #f8fafc;
        border-right: 1px solid #e2e8f0;
        vertical-align: top;
      }
      table.details td {
        margin: 0;
        padding: 12px 14px;
        font-weight: 600;
        color: #0f172a;
        vertical-align: top;
        line-height: 1.45;
      }
      tr.total-row th {
        background: #fffbeb;
        color: #92400e;
        border-right-color: #fde68a;
      }
      tr.total-row td {
        background: #fffbeb;
        font-size: 18px;
        font-weight: 800;
        color: #b45309;
      }
      .instructions {
        margin-top: 22px;
        padding: 14px 16px;
        font-family: system-ui, sans-serif;
        font-size: 12px;
        line-height: 1.55;
        color: #475569;
        background: #f8fafc;
        border: 1px dashed #94a3b8;
        border-radius: 6px;
      }
      .instructions strong { color: #334155; }
      .form-footer {
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid #e2e8f0;
        font-family: system-ui, sans-serif;
        font-size: 10px;
        color: #94a3b8;
        text-align: center;
        letter-spacing: 0.04em;
      }
      @media print {
        body {
          padding: 0;
          background: #fff;
        }
        .screen-note { display: none !important; }
        .form {
          max-width: none;
          border: 2px solid #000;
          box-shadow: none;
        }
        .form-inner { padding: 20px 24px 24px; }
      }
    </style>
  </head>
  <body>
    <p class="screen-note">A print dialog will open next. Choose your printer or <strong>Save as PDF</strong>. You can close this tab when finished.</p>
    <article class="form" aria-label="Appointment confirmation">
      <div class="form-accent" aria-hidden="true"></div>
      <div class="form-inner">
        <header class="form-header">
          <div>
            <h1 class="clinic-name">Relief Chiropractic</h1>
            <p class="doc-title">Appointment confirmation</p>
          </div>
          <div class="badge-wrap">
            <span class="badge">Confirmed</span>
          </div>
        </header>

        <div class="ref-block">
          <p class="ref-label">Confirmation number</p>
          <p class="ref-number">#${id}</p>
        </div>

        <h2 class="section-title">Visit details</h2>
        <table class="details" role="presentation">
          <tbody>
            <tr>
              <th scope="row">Patient name</th>
              <td>${patient}</td>
            </tr>
            <tr>
              <th scope="row">Service</th>
              <td>${service}</td>
            </tr>
            ${
              showProvider
                ? `<tr>
              <th scope="row">Doctor</th>
              <td>${provider}</td>
            </tr>`
                : ""
            }
            <tr>
              <th scope="row">Date</th>
              <td>${apptDate}</td>
            </tr>
            <tr>
              <th scope="row">Time</th>
              <td>${startTime}</td>
            </tr>
            <tr class="total-row">
              <th scope="row">Estimated total</th>
              <td>$${total}</td>
            </tr>
          </tbody>
        </table>

        <div class="instructions">
          <strong>Before your visit:</strong> Please arrive a few minutes early. Bring this confirmation (printed or on your phone) or check in at the clinic kiosk using the <strong>same phone number</strong> you used to book. Estimated total is based on the service booked; final charges follow your visit and any services rendered.
        </div>

        <footer class="form-footer">
          Document generated ${generated} · Relief Chiropractic · Online booking confirmation
        </footer>
      </div>
    </article>
    <script>
      window.onload = function () { window.print(); };
    </script>
  </body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <main className="content-fade-in min-h-screen bg-gradient-to-b from-background via-[#ecfdf5]/25 to-background">
      <div className="mx-auto max-w-7xl p-4 md:p-8">
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
              Choose your visit type, your doctor when needed, then your time. We&apos;ll confirm everything before you submit.
            </p>
          </div>
          <div className="relative min-h-[14rem] md:min-h-full">
            <Image
              src="/images/clinic-reception.png"
              alt="Clinic reception"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
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

          {step === 1 && (
            <div className="animate-fade-in-up space-y-3">
              <h2 className="text-lg font-semibold">Choose service</h2>
              {optionsError && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-rose-700">{optionsError}</p>
                  <Button
                    type="button"
                    onClick={fetchOptions}
                    disabled={optionsLoading}
                    size="sm"
                    className="h-auto rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm"
                  >
                    {optionsLoading ? "Retrying…" : "Retry"}
                  </Button>
                </div>
              )}
              {!options && !optionsError && (
                <Loader variant="page" label="Loading services" sublabel="Fetching available visits and times…" />
              )}
              {(options?.services ?? []).map((service) => (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => {
                    setSelectedService(service);
                    const providers = options?.providers_by_service?.[service.id] ?? [];
                    if (service.allow_provider_choice && providers.length > 0) {
                      setSelectedProvider(null);
                      setStep(2);
                    } else if (providers.length > 0) {
                      setSelectedProvider(providers[0]);
                      setStep(3);
                    } else {
                      setSelectedProvider(null);
                      setStep(2);
                    }
                  }}
                  className={cn(
                    "w-full rounded-xl border p-4 text-left transition-all",
                    selectedService?.id === service.id
                      ? "border-2 border-primary bg-primary/8 shadow-md shadow-primary/10 ring-2 ring-primary/15"
                      : "border-border/90 bg-card hover:border-primary/25 hover:shadow-sm",
                  )}
                >
                  <p
                    className={cn(
                      "font-semibold",
                      selectedService?.id === service.id ? "text-[#0d5c2e]" : "text-foreground",
                    )}
                  >
                    {service.name}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {service.duration_minutes} min · ${service.price}
                  </p>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="animate-fade-in-up space-y-3">
              <h2 className="text-lg font-semibold">Pick doctor</h2>
              {providersForService.length === 0 ? (
                <p className="text-slate-500">No doctors available for this service. Please choose another service.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-3">
                  {providersForService.map((provider) => (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => {
                        setSelectedProvider(provider);
                        setStep(3);
                      }}
                      className={cn(
                        "rounded-xl border p-3 text-sm font-medium transition-all",
                        selectedProvider?.id === provider.id
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
          )}

          {step === 3 && (
            <div className="animate-fade-in-up space-y-4">
              <h2 className="text-lg font-semibold">Select date & time</h2>
              <div className="rounded-xl border-2 border-primary/25 bg-primary/[0.06] p-4 ring-1 ring-primary/10">
                <label className="mb-2 block text-sm font-semibold text-foreground">Appointment date</label>
                <input
                  type="date"
                  min={today}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full max-w-xs rounded-xl border-2 border-border bg-background p-3 text-base font-medium text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <p className="mt-2 text-sm text-slate-600">
                  Your appointment is on{" "}
                  <strong className="text-[#166534]">
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </strong>
                </p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Available time</label>
                {slotsLoading && <Loader variant="dots" label="Checking availability…" className="mb-2" />}
                {(() => {
                  const slotsToShow = availableSlots === null ? ALL_TIME_SLOTS : availableSlots;
                  if (slotsToShow.length === 0) {
                    return (
                      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                        No open times on this day for this provider—try another date, another doctor, or call the clinic. (The desk may
                        have blocked online booking for part of the day.)
                      </p>
                    );
                  }
                  return (
                    <div className="grid gap-2 sm:grid-cols-3">
                      {slotsToShow.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => {
                            setSelectedTime(slot);
                            setSlotWarning("");
                            setStep(4);
                          }}
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
                  );
                })()}
              </div>
              {slotWarning && <p className="text-sm font-medium text-rose-700">{slotWarning}</p>}
            </div>
          )}

          {step === 4 && !bookingResult && (
            <div className="animate-fade-in-up space-y-3">
              <h2 className="text-lg font-semibold">Your details</h2>
              <p className="text-sm text-slate-600">
                Enter your phone first—we&apos;ll look up your info if you&apos;ve visited before.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Phone number</label>
                  <div className={`rounded-lg border bg-white p-2 ${formErrors.phone ? "border-rose-400 bg-rose-50" : "border-slate-200"}`}>
                    <PhoneInput
                      international
                      defaultCountry="US"
                      countryCallingCodeEditable={false}
                      value={phone}
                      onChange={(value) => {
                        setPhone(value);
                        setFormErrors((prev) => ({ ...prev, phone: undefined }));
                        setPatientLookup("idle");
                      }}
                      placeholder="Enter phone number"
                      className="phone-field text-sm"
                    />
                  </div>
                  {formErrors.phone && <p className="mt-1 text-xs text-rose-700">{formErrors.phone}</p>}
                  {patientLookup === "loading" && <p className="mt-1 text-sm text-slate-500">Looking up…</p>}
                  {patientLookup === "returning" && firstName && (
                    <p className="mt-2 rounded-lg bg-[#16a349]/10 px-3 py-2 text-sm font-medium text-[#166534]">
                      Welcome back, {firstName}! We&apos;ve filled in your details—review and confirm below.
                    </p>
                  )}
                  {patientLookup === "new" && (
                    <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
                      First visit? We&apos;re happy to meet you—please fill in your details below.
                    </p>
                  )}
                </div>
                <input
                  className={`rounded-lg border p-2 ${formErrors.firstName ? "border-rose-400 bg-rose-50" : "border-slate-200"}`}
                  placeholder="First name"
                  value={firstName}
                  onChange={(event) => {
                    setFirstName(event.target.value);
                    setFormErrors((prev) => ({ ...prev, firstName: undefined }));
                  }}
                />
                {formErrors.firstName && <p className="-mt-2 text-xs text-rose-700">{formErrors.firstName}</p>}
                <input
                  className={`rounded-lg border p-2 ${formErrors.lastName ? "border-rose-400 bg-rose-50" : "border-slate-200"}`}
                  placeholder="Last name"
                  value={lastName}
                  onChange={(event) => {
                    setLastName(event.target.value);
                    setFormErrors((prev) => ({ ...prev, lastName: undefined }));
                  }}
                />
                {formErrors.lastName && <p className="-mt-2 text-xs text-rose-700">{formErrors.lastName}</p>}
                <input
                  className={`rounded-lg border p-2 ${formErrors.email ? "border-rose-400 bg-rose-50" : "border-slate-200"}`}
                  placeholder="Email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setFormErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                />
                {formErrors.email && <p className="-mt-2 text-xs text-rose-700">{formErrors.email}</p>}
              </div>
              <BookingCardSetup firstName={firstName} lastName={lastName} email={email} phone={phone} />
              <Button
                type="button"
                onClick={() => void submitBooking()}
                disabled={isSubmitting}
                className="h-auto w-full max-w-xs rounded-xl bg-[#e9982f] px-6 py-3 text-base font-semibold text-white shadow-md shadow-[#e9982f]/25 hover:bg-[#cf8727] sm:w-auto"
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader variant="spinner" />
                    Confirming…
                  </span>
                ) : (
                  "Confirm appointment"
                )}
              </Button>
              {bookingMessage && (
                <p className={`text-sm font-medium ${bookingMessageKind === "success" ? "text-[#166534]" : "text-rose-700"}`}>
                  {bookingMessage}
                </p>
              )}
            </div>
          )}

          {step === 4 && bookingResult && (
            <div className="animate-fade-in-up rounded-2xl border border-[#16a349]/25 bg-gradient-to-b from-[#f0fdf4] to-white p-6 sm:p-8">
              <div className="flex flex-col items-center text-center">
                <div
                  className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#16a349] text-white shadow-md shadow-[#16a349]/25"
                  aria-hidden
                >
                  <IconCheck className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Thank you!</h2>
                <p className="mt-2 max-w-md text-sm text-slate-600 sm:text-base">
                  Your appointment is confirmed. We look forward to seeing you.
                </p>
              </div>

              <div className="mx-auto mt-6 max-w-md rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confirmation</p>
                <p className="mt-1 text-lg font-bold text-slate-900">#{bookingResult.appointment_id}</p>
                <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm text-slate-700">
                  <li>
                    <span className="text-slate-500">Patient: </span>
                    <span className="font-medium text-slate-900">{bookingResult.patient}</span>
                  </li>
                  <li>
                    <span className="text-slate-500">Service: </span>
                    <span className="font-medium text-slate-900">{bookingResult.service}</span>
                  </li>
                  {bookingResult.service_type !== "chiropractic" && (
                    <li>
                    <span className="text-slate-500">Doctor: </span>
                    <span className="font-medium text-slate-900">{bookingResult.provider}</span>
                    </li>
                  )}
                  <li>
                    <span className="text-slate-500">When: </span>
                    <span className="font-medium text-slate-900">
                      {new Date(bookingResult.appointment_date + "T12:00:00").toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}{" "}
                      at {bookingResult.start_time}
                    </span>
                  </li>
                  <li>
                    <span className="text-slate-500">Estimated total: </span>
                    <span className="font-semibold text-[#b45309]">${bookingResult.total_amount}</span>
                  </li>
                </ul>
              </div>

              <p className="mx-auto mt-4 max-w-md text-center text-sm text-slate-600">
                On arrival,{" "}
                <Link href="/kiosk" className="font-medium text-[#16a349] hover:underline">
                  check in at the kiosk
                </Link>{" "}
                with the same phone number you used to book.
              </p>

              <div className="mx-auto mt-6 flex max-w-md flex-col gap-3 sm:flex-row-reverse sm:justify-center">
                <Button
                  type="button"
                  onClick={resetBookingFlow}
                  className="h-auto rounded-xl px-6 py-3 text-sm font-semibold shadow-sm"
                >
                  Done
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={printBookingConfirmation}
                  className="h-auto rounded-xl border-border px-6 py-3 text-sm font-semibold"
                >
                  Print confirmation
                </Button>
              </div>
              <p className="mx-auto mt-4 max-w-md text-center text-xs text-slate-500">
                After you tap <span className="font-medium text-slate-600">Done</span>, you can book another visit from Step 1.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={goToPreviousStep}
              disabled={step === 1 || (step === 4 && bookingResult !== null)}
              className="h-auto rounded-xl px-4 py-2.5 text-sm font-semibold"
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={goToNextStep}
              disabled={step === 4 || bookingResult !== null}
              className="h-auto rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:bg-foreground/90"
            >
              Next
            </Button>
          </div>
        </section>

        <aside className="space-y-4 lg:pt-1">
          <div className="rounded-2xl border border-border/90 bg-card p-5 shadow-sm ring-1 ring-slate-100/80">
            <h3 className="text-lg font-bold tracking-tight text-foreground">Booking summary</h3>

            <div className="mt-4 rounded-xl border border-border/80 bg-muted/40 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Appointment date & time</p>
              <p className="font-semibold text-foreground">
                {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}{" "}
                at {selectedTime}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Chosen in Step 3 — change date in the main flow above
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-border/80 bg-background p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected visit</p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-slate-500">Service</span>
                  <span className="text-right font-medium text-slate-900">{selectedService?.name ?? "—"}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-slate-500">Duration</span>
                  <span className="font-medium text-slate-900">{selectedService?.duration_minutes ?? 0} min</span>
                </div>
                {selectedService?.allow_provider_choice && (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500">Doctor</span>
                    <span className="text-right font-medium text-slate-900">{selectedProvider?.provider_name ?? "—"}</span>
                  </div>
                )}
                <div className="flex items-start justify-between gap-3">
                  <span className="text-slate-500">Date</span>
                  <span className="text-right font-medium text-slate-900">
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-slate-500">Time</span>
                  <span className="font-medium text-slate-900">{selectedTime}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-[#e9982f]/30 bg-[#e9982f]/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#9a6700]">Total</p>
              <p className="mt-1 text-3xl font-extrabold text-[#9a6700]">${selectedService?.price ?? "0"}</p>
            </div>
          </div>
        </aside>
      </div>
      </div>
    </main>
  );
}
