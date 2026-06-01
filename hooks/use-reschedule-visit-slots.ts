"use client";

import { useAppFeedback } from "@/components/app-feedback";
import { fetchAvailabilitySlots } from "@/lib/availability-slots";
import { apiPost } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";

export type RescheduleVisitSource = {
  id: number;
  patientLabel: string;
  appointmentDate: string;
  startTimeDisplay: string;
  endTimeDisplay?: string;
  serviceLabel?: string | null;
  bookedServiceId: number | null;
  /** ISO start time from API — used to pre-select the current slot when still open. */
  startTimeIso?: string;
};

/** Reschedule using real openings (doctor dashboard; same rules as online booking). */
export function useRescheduleVisitSlots({
  todayMinIso,
  providerId,
  defaultDateIso,
  onRescheduled,
  confirmBeforeSubmit,
}: {
  todayMinIso: string;
  providerId: number | null;
  /** Calendar day shown on the dashboard when opening without a visit date. */
  defaultDateIso: string;
  onRescheduled: () => void | Promise<void>;
  /** Staff must confirm before the reschedule API runs. */
  confirmBeforeSubmit?: (ctx: {
    patientLabel: string;
    dateIso: string;
    timeLabel: string;
  }) => Promise<boolean>;
}) {
  const { runWithFeedback } = useAppFeedback();
  const [source, setSource] = useState<RescheduleVisitSource | null>(null);
  const [date, setDate] = useState("");
  const [slotLabels, setSlotLabels] = useState<string[]>([]);
  const [slotTimes, setSlotTimes] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const close = useCallback(() => setSource(null), []);

  const open = useCallback(
    (src: RescheduleVisitSource) => {
      setSource(src);
      const initial =
        src.appointmentDate >= todayMinIso ? src.appointmentDate : defaultDateIso >= todayMinIso ? defaultDateIso : todayMinIso;
      setDate(initial);
    },
    [todayMinIso, defaultDateIso],
  );

  useEffect(() => {
    if (!source || !date || providerId == null || !source.bookedServiceId) {
      setSlotLabels([]);
      setSlotTimes([]);
      setSelectedSlot("");
      return;
    }
    let cancelled = false;
    void (async () => {
      setSlotsLoading(true);
      try {
        const { labels, times } = await fetchAvailabilitySlots({
          date,
          providerId,
          serviceId: source.bookedServiceId!,
          excludeAppointmentId: source.id,
        });
        if (cancelled) return;
        setSlotLabels(labels);
        setSlotTimes(times);
        const iso = source.startTimeIso || "";
        let pick = times[0] || "";
        const idx = times.findIndex((t) => t === iso || t.startsWith(iso.slice(0, 5)));
        if (idx >= 0) pick = times[idx];
        setSelectedSlot(pick);
      } catch {
        if (!cancelled) {
          setSlotLabels([]);
          setSlotTimes([]);
          setSelectedSlot("");
        }
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source?.id, source?.bookedServiceId, source?.startTimeIso, date, providerId]);

  const submit = useCallback(async () => {
    if (!source || !date || !selectedSlot) return;
    const slotIdx = slotTimes.findIndex((t) => t === selectedSlot);
    const timeLabel =
      slotIdx >= 0 && slotLabels[slotIdx]
        ? slotLabels[slotIdx]
        : selectedSlot.length >= 5
          ? selectedSlot.slice(0, 5)
          : selectedSlot;
    if (confirmBeforeSubmit) {
      const ok = await confirmBeforeSubmit({
        patientLabel: source.patientLabel,
        dateIso: date,
        timeLabel,
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      await runWithFeedback(
        async () => {
          await apiPost(`/appointments/${source.id}/reschedule-by-provider/`, {
            appointment_date: date,
            start_time: selectedSlot,
          });
          close();
          await onRescheduled();
        },
        {
          loadingMessage: "Rescheduling…",
          successMessage: "Appointment rescheduled",
          errorFallback: "Could not reschedule (slot may be taken).",
        },
      );
    } finally {
      setSaving(false);
    }
  }, [
    source,
    date,
    selectedSlot,
    slotLabels,
    slotTimes,
    confirmBeforeSubmit,
    close,
    onRescheduled,
    runWithFeedback,
  ]);

  const canSubmit =
    !saving &&
    !!source?.bookedServiceId &&
    !!date &&
    !!selectedSlot &&
    !slotsLoading &&
    slotLabels.length > 0;

  return {
    isOpen: source !== null,
    source,
    patientLabel: source?.patientLabel ?? "",
    open,
    close,
    submit,
    saving,
    slotsLoading,
    date,
    setDate,
    slotLabels,
    slotTimes,
    selectedSlot,
    setSelectedSlot,
    canSubmit,
    todayMinIso,
  };
}

export type RescheduleVisitSlotsController = ReturnType<typeof useRescheduleVisitSlots>;
