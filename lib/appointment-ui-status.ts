import { effectiveAppointmentStatus } from "@/lib/visit-status-utils";

/** Row shape shared by schedule list, dashboard, and visit panels. */
export type AppointmentStatusFields = {
  status: string;
  display_status?: string | null;
  invoice_kind?: string | null;
};

/** Single status string for badges, colors, and which buttons to show. */
export function resolveAppointmentUiStatus(row: AppointmentStatusFields): string {
  return row.display_status ?? effectiveAppointmentStatus(row.status, row.invoice_kind);
}
