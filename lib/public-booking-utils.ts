import type {
  AvailabilityApiResponse,
  ChiroIntakeRule,
  PublicBookingOptions,
  PublicProviderOption,
  PublicServiceOption,
  RescheduleAppointmentRow,
  SlotGridEntry,
} from "@/lib/public-booking-types";

/** Post-massage turnover on the provider schedule for public booking (matches API). */
export const MASSAGE_PUBLIC_BOOKING_TAIL_MINUTES = 15;

export const PUBLIC_BOOKING_SLOT_STEP_MIN = 15;

export function newCartLineId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function providerPickForService(
  service: PublicServiceOption,
  providers: PublicProviderOption[],
): { provider: PublicProviderOption | null; providerSkipped: boolean } {
  if (providers.length === 0) {
    return { provider: null, providerSkipped: false };
  }
  if (providers.length === 1) {
    return { provider: providers[0], providerSkipped: true };
  }
  const isChiroBooking =
    service.service_type === "chiropractic" || service.is_new_client_intake === true;
  if (isChiroBooking) {
    return { provider: providers[0], providerSkipped: true };
  }
  return { provider: null, providerSkipped: false };
}

function massageCalendarTailMinutes(service: { service_type?: string }): number {
  return service.service_type === "massage" ? MASSAGE_PUBLIC_BOOKING_TAIL_MINUTES : 0;
}

export function publicBookingCalendarSpanMinutes(service: PublicServiceOption): number {
  return Number(service.duration_minutes) + massageCalendarTailMinutes(service);
}

export function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export function startOfCalendarMonth(d: Date): Date {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  x.setDate(1);
  return x;
}

export function addCalendarMonths(d: Date, delta: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + delta);
  return x;
}

export function nextWeekdayOnOrAfter(iso: string, maxIso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  for (let i = 0; i < 14; i++) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) {
      const out = toLocalISODate(d);
      if (out <= maxIso) return out;
      return lastWeekdayOnOrBefore(maxIso);
    }
    d.setDate(d.getDate() + 1);
  }
  return lastWeekdayOnOrBefore(maxIso);
}

export function lastWeekdayOnOrBefore(maxIso: string): string {
  const d = new Date(`${maxIso}T12:00:00`);
  for (let i = 0; i < 14; i++) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) return toLocalISODate(d);
    d.setDate(d.getDate() - 1);
  }
  return toLocalISODate(d);
}

export function publicBookingOpenMinutes(
  dateIso: string,
  serviceType: "chiropractic" | "massage" | undefined,
): number {
  const d = new Date(`${dateIso}T12:00:00`);
  if (d.getDay() === 5) return 7 * 60;
  return serviceType === "massage" ? 9 * 60 : 8 * 60;
}

export function publicBookingDayEndMinutes(dateIso: string): number {
  const d = new Date(`${dateIso}T12:00:00`);
  return d.getDay() === 5 ? 16 * 60 : 18 * 60;
}

export function publicBookingLastSlotStartMinutes(dateIso: string): number {
  const d = new Date(`${dateIso}T12:00:00`);
  const dow = d.getDay();
  const closeMin = publicBookingDayEndMinutes(dateIso);
  const capByClose = closeMin - PUBLIC_BOOKING_SLOT_STEP_MIN;
  if (dow === 0 || dow === 6) return capByClose;
  const policyLast = dow === 5 ? 15 * 60 + 45 : 17 * 60 + 45;
  return Math.min(policyLast, capByClose);
}

export function parsePublicSlotLabelToMinutes(slot: string): number | null {
  const m = slot.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

export function formatPublicClosingLabel(dateIso: string): string {
  const total = publicBookingDayEndMinutes(dateIso);
  const h24 = Math.floor(total / 60);
  const min = total % 60;
  const isPm = h24 >= 12;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${isPm ? "PM" : "AM"}`;
}

/** Minutes for slot checks from API/catalog; only falls back to 30 when missing or invalid. */
export function bookingDurationMinutes(durationMinutes: unknown): number {
  const n = Number(durationMinutes);
  return Number.isFinite(n) && n >= 5 ? Math.round(n) : 30;
}

export function massageReservedBlockExtendsPastPublicClose(
  dateIso: string,
  slot: string,
  service: Pick<PublicServiceOption, "service_type" | "duration_minutes">,
): boolean {
  if (service.service_type !== "massage") return false;
  const start = parsePublicSlotLabelToMinutes(slot);
  if (start === null) return false;
  const duration = bookingDurationMinutes(service.duration_minutes);
  return start + duration > publicBookingDayEndMinutes(dateIso);
}

export function massagePastClosingScheduleMessage(dateIso: string): string {
  const close = formatPublicClosingLabel(dateIso);
  return `This visit would end after our ${close} closing time for online booking. Pick an earlier start time or another open day.`;
}

function slotChainFitsPublicDayEnd(dateIso: string, slot: string, durationMinutes: number): boolean {
  const duration = bookingDurationMinutes(durationMinutes);
  const dayEnd = publicBookingDayEndMinutes(dateIso);
  const start = parsePublicSlotLabelToMinutes(slot);
  if (start === null) return true;
  return start + duration <= dayEnd;
}

export function normalizeAvailabilityFromResponse(
  res: AvailabilityApiResponse,
  dateIso: string,
  visitDurationMin: number,
): { bookableLabels: string[]; slotGrid: SlotGridEntry[] | null } {
  const raw = Array.isArray(res.slot_grid) ? res.slot_grid : [];
  const parsed: SlotGridEntry[] = [];
  for (const row of raw) {
    if (row && typeof row.label === "string" && typeof row.bookable === "boolean") {
      parsed.push({ label: row.label, bookable: row.bookable });
    }
  }
  if (parsed.length > 0) {
    return {
      bookableLabels: parsed.filter((x) => x.bookable).map((x) => x.label),
      slotGrid: parsed,
    };
  }
  let slots = Array.isArray(res.available_slots) ? res.available_slots : [];
  slots = slots.filter((slot) => slotChainFitsPublicDayEnd(dateIso, slot, visitDurationMin));
  return { bookableLabels: slots, slotGrid: null };
}

export function buildFallbackTimeSlots(
  dateIso: string,
  serviceType: "chiropractic" | "massage" | undefined,
  durationMinutes: number,
): string[] {
  const openMin = publicBookingOpenMinutes(dateIso, serviceType);
  const closeMin = publicBookingDayEndMinutes(dateIso);
  const duration = bookingDurationMinutes(durationMinutes);
  const step = PUBLIC_BOOKING_SLOT_STEP_MIN;
  const lastSlotStart = publicBookingLastSlotStartMinutes(dateIso);
  if (openMin >= closeMin || openMin > lastSlotStart) return [];
  const out: string[] = [];
  for (let t = openMin; t <= lastSlotStart; t += step) {
    if (t + duration > closeMin) continue;
    const h24 = Math.floor(t / 60);
    const m = t % 60;
    const suffix = h24 < 12 ? "AM" : "PM";
    const displayH = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24 === 12 ? 12 : h24;
    out.push(`${displayH}:${String(m).padStart(2, "0")} ${suffix}`);
  }
  return out;
}

export function chiroIntakeRuleFromLookupResponse(res: {
  chiropractic_returning_gap_requires_intake?: boolean;
  chiropractic_first_chiro_requires_intake?: boolean;
  chiropractic_new_patient_requires_intake?: boolean;
  chiropractic_intake_services?: Array<{ id: number; name: string }>;
  chiropractic_gap_days?: number;
  last_chiropractic_visit_date?: string | null;
}): ChiroIntakeRule | null {
  const intakeServices = Array.isArray(res.chiropractic_intake_services) ? res.chiropractic_intake_services : [];
  const gapDays = typeof res.chiropractic_gap_days === "number" ? res.chiropractic_gap_days : 730;
  const lastVisit = res.last_chiropractic_visit_date ?? null;
  let reason: ChiroIntakeRule["reason"] = null;
  if (res.chiropractic_returning_gap_requires_intake === true) reason = "gap";
  else if (res.chiropractic_first_chiro_requires_intake === true) reason = "first_chiro";
  else if (res.chiropractic_new_patient_requires_intake === true) reason = "new_patient";
  const needsIntake =
    res.chiropractic_returning_gap_requires_intake === true ||
    res.chiropractic_first_chiro_requires_intake === true ||
    res.chiropractic_new_patient_requires_intake === true;
  if (!needsIntake) return null;
  return {
    requiresIntake: true,
    intakeServices,
    gapDays,
    lastVisit,
    reason: reason ?? "new_patient",
  };
}

export function formatBookingPrice(p: string): string {
  const n = parseFloat(p);
  if (Number.isNaN(n)) return `$${p}`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export function appointmentStartDateTimeLocal(appointmentDate: string, displayTime12h: string): Date | null {
  const m = displayTime12h.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  const d = new Date(`${appointmentDate}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isMassageLateCancelWindow(
  row: RescheduleAppointmentRow,
  bookingOptions: PublicBookingOptions | null,
): boolean {
  const fromRow = row.service_type === "massage";
  const fromOptions =
    bookingOptions?.services.find((s) => s.id === row.service_id)?.service_type === "massage";
  if (!fromRow && !fromOptions) return false;
  const dt = appointmentStartDateTimeLocal(row.appointment_date, row.start_time);
  if (!dt) return false;
  const ms = dt.getTime() - Date.now();
  return ms > 0 && ms < 24 * 60 * 60 * 1000;
}
