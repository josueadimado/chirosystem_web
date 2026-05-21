"use client";

import { useAppFeedback } from "@/components/app-feedback";
import { fetchAvailabilitySlots } from "@/lib/availability-slots";
import { apiGet, apiPost } from "@/lib/api";
import type { BookingOptionsResponse } from "@/lib/booking-options-types";
import { useCallback, useEffect, useState } from "react";

export type BookNextSource = {
  id: number;
  patientLabel: string;
  appointmentDate: string;
  bookedServiceId: number | null;
  providerId?: number;
};

export function useBookNextVisit({
  todayMinIso,
  onBooked,
  useDeskAvailability = false,
  preferredProviderId,
}: {
  todayMinIso: string;
  onBooked: () => void | Promise<void>;
  /** Admin schedule: extended desk hours when loading slots. */
  useDeskAvailability?: boolean;
  /** Doctor dashboard: default to logged-in provider when possible. */
  preferredProviderId?: number | null;
}) {
  const { runWithFeedback } = useAppFeedback();
  const [source, setSource] = useState<BookNextSource | null>(null);
  const [bookingOptions, setBookingOptions] = useState<BookingOptionsResponse | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serviceId, setServiceId] = useState(0);
  const [providerId, setProviderId] = useState(0);
  const [date, setDate] = useState("");
  const [slotLabels, setSlotLabels] = useState<string[]>([]);
  const [slotTimes, setSlotTimes] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(false);

  const pickProviderForService = useCallback(
    (sid: number, src: BookNextSource) => {
      const provs = bookingOptions?.providers_by_service[String(sid)] ?? [];
      if (preferredProviderId != null && provs.some((p) => p.id === preferredProviderId)) {
        return preferredProviderId;
      }
      if (src.providerId != null && provs.some((p) => p.id === src.providerId)) {
        return src.providerId;
      }
      return provs[0]?.id ?? 0;
    },
    [bookingOptions, preferredProviderId],
  );

  const close = useCallback(() => {
    setSource(null);
    setBookingOptions(null);
  }, []);

  const open = useCallback(
    (src: BookNextSource, opts?: { initialDate?: string }) => {
      void (async () => {
        setSource(src);
        const initialDate =
          opts?.initialDate ??
          (src.appointmentDate >= todayMinIso ? src.appointmentDate : todayMinIso);
        setDate(initialDate);
        setOptionsLoading(true);
        try {
          const optsRes = await apiGet<BookingOptionsResponse>("/booking-options/");
          setBookingOptions(optsRes);
          const sid =
            src.bookedServiceId != null && optsRes.services.some((s) => s.id === src.bookedServiceId)
              ? src.bookedServiceId
              : optsRes.services[0]?.id ?? 0;
          const provs = optsRes.providers_by_service[String(sid)] ?? [];
          let pid = provs[0]?.id ?? 0;
          if (preferredProviderId != null && provs.some((p) => p.id === preferredProviderId)) {
            pid = preferredProviderId;
          } else if (src.providerId != null && provs.some((p) => p.id === src.providerId)) {
            pid = src.providerId;
          }
          setServiceId(sid);
          setProviderId(pid);
        } catch {
          setBookingOptions(null);
          setServiceId(0);
          setProviderId(0);
        } finally {
          setOptionsLoading(false);
        }
      })();
    },
    [todayMinIso, preferredProviderId],
  );

  const onServiceChange = useCallback(
    (sid: number) => {
      setServiceId(sid);
      if (source) setProviderId(pickProviderForService(sid, source));
    },
    [source, pickProviderForService],
  );

  useEffect(() => {
    if (!source || !date || !serviceId || !providerId) {
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
          serviceId,
          desk: useDeskAvailability,
        });
        if (cancelled) return;
        setSlotLabels(labels);
        setSlotTimes(times);
        setSelectedSlot(times[0] || "");
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
  }, [source?.id, date, serviceId, providerId, useDeskAvailability]);

  const submit = useCallback(async () => {
    if (!source || !serviceId || !providerId || !date || !selectedSlot) return;
    setSaving(true);
    try {
      await runWithFeedback(
        async () => {
          await apiPost(`/appointments/book-by-provider/`, {
            source_appointment_id: source.id,
            service_id: serviceId,
            provider_id: providerId,
            appointment_date: date,
            start_time: selectedSlot,
          });
          close();
          await onBooked();
        },
        {
          loadingMessage: "Booking…",
          successMessage: "Next visit booked",
          errorFallback: "Could not book that slot (it may have been taken).",
        },
      );
    } finally {
      setSaving(false);
    }
  }, [source, serviceId, providerId, date, selectedSlot, close, onBooked, runWithFeedback]);

  const canSubmit =
    !saving &&
    !optionsLoading &&
    !!serviceId &&
    !!providerId &&
    !!date &&
    !!selectedSlot &&
    !slotsLoading &&
    slotLabels.length > 0;

  return {
    isOpen: source !== null,
    patientLabel: source?.patientLabel ?? "",
    source,
    open,
    close,
    submit,
    saving,
    optionsLoading,
    slotsLoading,
    bookingOptions,
    serviceId,
    providerId,
    setProviderId,
    onServiceChange,
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

export type BookNextVisitController = ReturnType<typeof useBookNextVisit>;
