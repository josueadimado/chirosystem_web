/** Public / staff booking options payload (services + providers per service). */

export type BookingOptionsResponse = {
  services: Array<{
    id: number;
    name: string;
    duration_minutes: number;
    price: string;
    service_type: string;
    /** Present on desk=1 responses — hidden from the public patient portal. */
    staff_only?: boolean;
    calendar_highlight?: boolean;
  }>;
  providers_by_service: Record<string, Array<{ id: number; provider_name: string }>>;
};
