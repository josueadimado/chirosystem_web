import { apiPost } from "@/lib/api";

/** Response from POST /kiosk/checkin/ (patient kiosk or staff desk). */
export type KioskCheckinResponse = {
  detail: string;
  checked_in_count?: number;
  appointment_ids?: number[];
  status?: string;
};

/** Staff desk / doctor schedule — same API as the lobby kiosk, without phone (early window bypass). */
export async function postDeskCheckIn(appointmentId: number): Promise<KioskCheckinResponse> {
  return apiPost<KioskCheckinResponse>("/kiosk/checkin/", { appointment_id: appointmentId });
}

/** Prefer API detail (includes multi-visit copy); fall back to a short UI default. */
export function deskCheckInSuccessMessage(out: KioskCheckinResponse, fallback: string): string {
  const detail = out.detail?.trim();
  return detail || fallback;
}
