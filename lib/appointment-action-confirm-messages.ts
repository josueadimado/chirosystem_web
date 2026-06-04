import { cancelAppointmentConfirmMessage } from "@/lib/appointment-previsit";
import { minutesToLabel } from "@/lib/admin-schedule-utils";
import { formatMonthDayYear, formatWeekdayMonthDayYear } from "@/lib/format-date";
import type { AppointmentConfirmOptions } from "@/hooks/use-appointment-action-confirm";

function base(
  title: string,
  description: string,
  confirmLabel: string,
  tone: AppointmentConfirmOptions["tone"] = "default",
): AppointmentConfirmOptions {
  return { title, description, confirmLabel, cancelLabel: "Don't proceed", tone };
}

export function confirmOpenReschedulePicker(patientName: string): AppointmentConfirmOptions {
  return base(
    "Reschedule this visit?",
    `Open the reschedule screen for ${patientName}. You will pick a new date and time, then confirm once more before the change is saved.`,
    "Continue",
  );
}

export function confirmOpenBookNextPicker(patientName: string): AppointmentConfirmOptions {
  return base(
    "Book next visit?",
    `Open the booking screen to schedule ${patientName}'s next visit. You will confirm once more before the appointment is saved.`,
    "Continue",
  );
}

export function confirmStartVisit(patientName: string): AppointmentConfirmOptions {
  return base(
    "Start this visit?",
    `Begin the consultation for ${patientName}. The visit will move to in progress and open the chart and billing workspace.`,
    "Start visit",
  );
}

export function confirmCheckIn(patientName: string): AppointmentConfirmOptions {
  return base(
    "Check in patient?",
    `Mark ${patientName} as checked in for this visit? They will appear in the active visit list.`,
    "Check in",
  );
}

export function confirmNoShow(patientName: string): AppointmentConfirmOptions {
  return base(
    "Mark as no-show?",
    `${patientName} did not attend this visit. It will no longer count as an active booking. You can still book their next visit afterward.`,
    "Mark no-show",
    "destructive",
  );
}

export function confirmCancelVisit(
  patientName: string,
  serviceType: string | undefined,
  appointmentDate: string,
  startTime: string,
  waiveLateCancel?: boolean,
): AppointmentConfirmOptions {
  let description = cancelAppointmentConfirmMessage(serviceType, appointmentDate, startTime);
  if (waiveLateCancel && serviceType === "massage") {
    description +=
      " You checked “Waive late-cancellation fee,” so the patient should not be charged the late cancel fee.";
  }
  return base(
    "Cancel appointment?",
    `${patientName}: ${description}`,
    "Cancel appointment",
    "destructive",
  );
}

export function confirmMarkCompleted(patientName: string): AppointmentConfirmOptions {
  return base(
    "Mark visit completed?",
    `Mark ${patientName}'s visit as completed without checkout here? Use only when payment was handled elsewhere.`,
    "Mark completed",
  );
}

export function confirmFormReschedule(
  patientName: string,
  dateIso: string,
  timeLabel: string,
  providerName?: string,
): AppointmentConfirmOptions {
  const when = `${formatWeekdayMonthDayYear(dateIso)} at ${timeLabel}`;
  const prov = providerName ? ` with ${providerName}` : "";
  return base(
    "Reschedule appointment?",
    `Move ${patientName}'s visit to ${when}${prov}. The patient will receive booking notifications if their preferences allow.`,
    "Reschedule",
  );
}

export function confirmDragReschedule(
  patientName: string,
  dateIso: string,
  startMinute: number,
  providerName: string,
): AppointmentConfirmOptions {
  return base(
    "Move appointment on calendar?",
    `Move ${patientName} to ${formatWeekdayMonthDayYear(dateIso)} at ${minutesToLabel(startMinute)} with ${providerName}. The patient will be notified if their preferences allow.`,
    "Move appointment",
  );
}

export function confirmUndoDrag(patientName: string): AppointmentConfirmOptions {
  return base(
    "Undo calendar move?",
    `Move ${patientName} back to the previous date, time, and provider?`,
    "Undo move",
  );
}

export function confirmExtendDuration(
  patientName: string,
  endTimeLabel: string,
): AppointmentConfirmOptions {
  return base(
    "Extend visit on calendar?",
    `Extend ${patientName}'s visit so it ends at ${endTimeLabel}? This changes the blocked time on the schedule.`,
    "Extend visit",
  );
}

export function confirmDeskBook(
  patientName: string,
  serviceName: string,
  dateIso: string,
  timeLabel: string,
  providerName: string,
  options?: { visitCount?: number; recurrenceLabel?: string },
): AppointmentConfirmOptions {
  const count = options?.visitCount ?? 1;
  if (count > 1) {
    const freq = options?.recurrenceLabel ?? "on a schedule";
    return base(
      `Book ${count} recurring visits?`,
      `Book ${patientName} for ${count} ${serviceName} visits (${freq}), starting ${formatWeekdayMonthDayYear(dateIso)} at ${timeLabel} with ${providerName}. One combined confirmation goes out if their preferences allow.`,
      "Book recurring visits",
    );
  }
  return base(
    "Book this appointment?",
    `Book ${patientName} for ${serviceName} on ${formatWeekdayMonthDayYear(dateIso)} at ${timeLabel} with ${providerName}. The patient will receive a confirmation if their preferences allow.`,
    "Book appointment",
  );
}

export function confirmBookNextVisit(
  patientName: string,
  serviceName: string,
  dateIso: string,
  timeLabel: string,
  providerName: string,
): AppointmentConfirmOptions {
  return base(
    "Book next visit?",
    `Schedule ${patientName} for ${serviceName} on ${formatMonthDayYear(dateIso)} at ${timeLabel} with ${providerName}. They will be notified if their preferences allow.`,
    "Book next visit",
  );
}

export function confirmRescheduleBySlots(
  patientName: string,
  dateIso: string,
  timeLabel: string,
): AppointmentConfirmOptions {
  return base(
    "Reschedule appointment?",
    `Move ${patientName}'s visit to ${formatMonthDayYear(dateIso)} at ${timeLabel}. The patient will be notified if their preferences allow.`,
    "Reschedule",
  );
}

export function confirmDismissPaymentBanner(): AppointmentConfirmOptions {
  return base(
    "Patient not paying now?",
    "Hide the green payment banner for now. The invoice stays open on their account until it is paid. You can tap Collect payment on their visit anytime to bring these options back.",
    "Dismiss for now",
  );
}
