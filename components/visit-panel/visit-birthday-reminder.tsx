"use client";

import { getBirthdayReminderForVisit } from "@/lib/birthday-reminder";
import { cn } from "@/lib/utils";
import { Cake } from "lucide-react";

export function VisitBirthdayReminder({
  appointmentDate,
  patientDateOfBirth,
  className,
}: {
  appointmentDate: string;
  patientDateOfBirth?: string | null;
  className?: string;
}) {
  const reminder = getBirthdayReminderForVisit(appointmentDate, patientDateOfBirth);
  if (!reminder) return null;

  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-xl border px-3 py-2.5 text-sm",
        reminder.tone === "today"
          ? "border-pink-200/90 bg-gradient-to-r from-pink-50 to-amber-50 text-pink-950"
          : "border-violet-200/80 bg-violet-50/90 text-violet-950",
        className,
      )}
      role="status"
    >
      <Cake className="mt-0.5 h-4 w-4 shrink-0 opacity-80" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">{reminder.headline}</p>
        <p className="mt-0.5 text-xs leading-relaxed opacity-90">{reminder.detail}</p>
      </div>
    </div>
  );
}
