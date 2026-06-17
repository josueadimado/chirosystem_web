import { apiPost } from "@/lib/api";

export type KioskCheckInAppointment = {
  appointment_id: number;
  status: string;
  checked_in_at: string;
  service_name?: string;
  start_time_display?: string;
};

/** Response from POST /kiosk/checkin/ (patient kiosk or staff desk). */
export type KioskCheckinResponse = {
  detail: string;
  checked_in_count?: number;
  appointment_ids?: number[];
  status?: string;
  appointments?: KioskCheckInAppointment[];
};

/** Ensure the server actually saved checked_in before showing success in the UI. */
export function assertKioskCheckInSucceeded(
  out: KioskCheckinResponse,
  expectedAppointmentId?: number,
): void {
  if (out.status !== "checked_in") {
    throw new Error(out.detail?.trim() || "Check-in did not complete. Please see the front desk.");
  }
  const ids = out.appointment_ids ?? [];
  if (!ids.length || (out.checked_in_count ?? 0) < 1) {
    throw new Error("Check-in did not save. Please see the front desk or try again.");
  }
  if (expectedAppointmentId != null && !ids.includes(expectedAppointmentId)) {
    throw new Error("Check-in did not match this appointment. Please see the front desk.");
  }
  const rows = out.appointments ?? [];
  if (rows.length) {
    const bad = rows.find(
      (r) => r.status !== "checked_in" || !r.checked_in_at?.trim(),
    );
    if (bad) {
      throw new Error("Check-in could not be confirmed. Please see the front desk.");
    }
  }
}

/** Staff desk / doctor schedule — same API as the lobby kiosk, without phone (early window bypass). */
export async function postDeskCheckIn(appointmentId: number): Promise<KioskCheckinResponse> {
  const out = await apiPost<KioskCheckinResponse>("/kiosk/checkin/", { appointment_id: appointmentId });
  assertKioskCheckInSucceeded(out, appointmentId);
  return out;
}

/** Prefer API detail (includes visit copy); fall back to a short UI default. */
export function deskCheckInSuccessMessage(out: KioskCheckinResponse, fallback: string): string {
  const detail = out.detail?.trim();
  return detail || fallback;
}
