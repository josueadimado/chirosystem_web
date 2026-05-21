import { apiGetAuth } from "@/lib/api";

/** Load bookable time slots for a provider, service, and date (shared by book-next and reschedule). */
export async function fetchAvailabilitySlots(params: {
  date: string;
  providerId: number;
  serviceId: number;
  excludeAppointmentId?: number;
  desk?: boolean;
}): Promise<{ labels: string[]; times: string[] }> {
  const q = new URLSearchParams({
    date: params.date,
    provider_id: String(params.providerId),
    service_id: String(params.serviceId),
  });
  if (params.excludeAppointmentId != null) {
    q.set("exclude_appointment_id", String(params.excludeAppointmentId));
  }
  if (params.desk) q.set("desk", "1");

  const data = await apiGetAuth<{ available_slots: string[]; slot_start_times?: string[] }>(
    `/booking-options/availability/?${q.toString()}`,
  );
  const labels = data.available_slots || [];
  const times = data.slot_start_times || [];
  return {
    labels,
    times: times.length ? times : labels.map(() => ""),
  };
}
