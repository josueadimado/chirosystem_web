/** Shared types for the public booking page (`app/page.tsx`). */

export type PublicBookingStep = 1 | 2 | 3 | 4;

export type BookingResult = {
  appointment_id: number;
  patient: string;
  provider: string;
  service: string;
  service_type?: string;
  appointment_date: string;
  start_time: string;
  total_amount: string;
};

export type BookingFormErrors = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
};

export type PublicServiceOption = {
  id: number;
  name: string;
  description?: string;
  duration_minutes: number;
  price: string;
  service_type?: "chiropractic" | "massage";
  allow_provider_choice?: boolean;
  is_new_client_intake?: boolean;
};

export type PublicProviderOption = { id: number; provider_name: string };

export type PublicBookingOptions = {
  services: PublicServiceOption[];
  providers_by_service: Record<number, PublicProviderOption[]>;
};

export type RescheduleAppointmentRow = {
  id: number;
  appointment_date: string;
  start_time: string;
  service_id: number;
  service_name: string;
  service_type?: string;
  provider_id: number;
  provider_name: string;
  duration_minutes: number;
  price: string;
  patient_name?: string;
};

export type BookingFlowMode = "new" | "reschedule";

export type SlotGridEntry = { label: string; bookable: boolean };

export type CartItem = {
  lineId: string;
  service: PublicServiceOption;
  provider: PublicProviderOption | null;
  providerSkipped: boolean;
};

export type CartSlotPick = { date: string; time: string };

export type AvailabilityApiResponse = {
  available_slots?: string[];
  slot_grid?: Array<{ label?: string; bookable?: boolean }>;
};

export type ChiroIntakeRule = {
  requiresIntake: boolean;
  intakeServices: Array<{ id: number; name: string }>;
  gapDays: number;
  lastVisit: string | null;
  reason: "gap" | "first_chiro" | "new_patient" | null;
};

/** Aliases used by `app/page.tsx` (keeps the large page diff smaller). */
export type Step = PublicBookingStep;
export type ServiceOption = PublicServiceOption;
export type ProviderOption = PublicProviderOption;
export type BookingOptions = PublicBookingOptions;
export type FormErrors = BookingFormErrors;
