/** True if appointment start is in the future but less than 24 hours away (browser local clock). */
export function appointmentWithin24HoursBeforeStart(
  appointmentDate: string,
  startTime: string,
): boolean {
  const t = (startTime || "09:00:00").slice(0, 8);
  const start = new Date(`${appointmentDate}T${t}`);
  const ms = start.getTime() - Date.now();
  return ms > 0 && ms < 24 * 60 * 60 * 1000;
}

/** Confirm dialog copy when staff or doctor cancels a visit. */
export function cancelAppointmentConfirmMessage(
  serviceType: string | undefined,
  appointmentDate: string,
  startTime: string,
): string {
  if (
    serviceType === "massage" &&
    appointmentWithin24HoursBeforeStart(appointmentDate, startTime)
  ) {
    return (
      "This massage is inside the 24-hour window: the patient will be charged the full massage price. " +
      "To waive the fee when you rescheduled them same-day by phone, cancel from Admin → Schedule with " +
      '"Waive late-cancellation fee" checked. Continue to cancel from here?'
    );
  }
  return "Cancel this appointment? The time slot will be freed.";
}
