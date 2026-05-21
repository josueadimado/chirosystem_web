"use client";

import { apiGet } from "@/lib/api";
import { formatWeekdayMonthDayYear } from "@/lib/format-date";
import type { AvailabilityApiResponse } from "@/lib/public-booking-types";
import {
  buildFallbackTimeSlots,
  nextWeekdayOnOrAfter,
  normalizeAvailabilityFromResponse,
  toLocalISODate,
} from "@/lib/public-booking-utils";
import { useCallback, useState } from "react";
import { isValidPhoneNumber } from "react-phone-number-input";

/** Scan weekdays forward until the availability API returns at least one open slot. */
export function useFindNextOpenBookingDay({
  maxBookDateIso,
  phone,
  toast,
}: {
  maxBookDateIso: string;
  phone: string | undefined;
  toast: { success: (m: string) => void; error: (m: string) => void };
}) {
  const [findingNextOpenDay, setFindingNextOpenDay] = useState(false);

  const findNextOpenDay = useCallback(
    async (params: {
      startAfterIso: string;
      providerId: number;
      serviceId: number;
      durationMinutes: number;
      serviceType?: "chiropractic" | "massage";
      excludeAppointmentId?: number;
      onFound: (dateIso: string) => void;
    }) => {
      setFindingNextOpenDay(true);
      try {
      let cursor = params.startAfterIso;
      for (let attempt = 0; attempt < 21; attempt++) {
        const bump = new Date(`${cursor}T12:00:00`);
        bump.setDate(bump.getDate() + 1);
        cursor = nextWeekdayOnOrAfter(toLocalISODate(bump), maxBookDateIso);
        if (cursor > maxBookDateIso) break;

        const q = new URLSearchParams({
          date: cursor,
          provider_id: String(params.providerId),
          service_id: String(params.serviceId),
        });
        if (params.excludeAppointmentId != null) {
          q.set("exclude_appointment_id", String(params.excludeAppointmentId));
        }
        if (phone && isValidPhoneNumber(phone)) {
          q.set("phone", phone);
        }
        try {
          const res = await apiGet<AvailabilityApiResponse>(`/booking-options/availability/?${q.toString()}`);
          const { bookableLabels } = normalizeAvailabilityFromResponse(
            res,
            cursor,
            params.durationMinutes,
          );
          if (bookableLabels.length > 0) {
            params.onFound(cursor);
            toast.success(`Next open day: ${formatWeekdayMonthDayYear(cursor)}`);
            return;
          }
        } catch {
          const fb = buildFallbackTimeSlots(cursor, params.serviceType, params.durationMinutes);
          if (fb.length > 0) {
            params.onFound(cursor);
            toast.success(`Next open day: ${formatWeekdayMonthDayYear(cursor)}`);
            return;
          }
        }
      }
      toast.error("No open days found in the next few weeks. Please call the clinic.");
      } finally {
        setFindingNextOpenDay(false);
      }
    },
    [maxBookDateIso, phone, toast],
  );

  return { findNextOpenDay, findingNextOpenDay };
}
