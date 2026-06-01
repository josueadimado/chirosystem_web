"use client";

import { useAppFeedback } from "@/components/app-feedback";
import type { BookNextDayAppointment } from "@/components/visit-panel/book-next-schedule-panel";
import { addDaysIso, monthGridRange, weekRangeContaining } from "@/lib/book-next-schedule-dates";
import { fetchAvailabilitySlots } from "@/lib/availability-slots";
import { apiGet, apiGetAuth, apiPost } from "@/lib/api";
import type { BookingOptionsResponse } from "@/lib/booking-options-types";
import { useCallback, useEffect, useState } from "react";

export type BookNextSource = {
  id: number;
  patientLabel: string;
  appointmentDate: string;
  bookedServiceId: number | null;
  providerId?: number;
};

export type BookNextVisitContext = {
  patient_name: string;
  appointment_date: string;
  start_time_display: string;
  service_name: string;
  provider_name: string;
  provider_id: number;
  handoff_notes: string;
  clinical_notes: string;
  diagnosis: string;
  diagnoses: Array<{ id: number | null; code: string; description: string }>;
};

export function useBookNextVisit({
  todayMinIso,
  onBooked,
  useDeskAvailability = true,
  preferredProviderId,
  confirmBeforeSubmit,
}: {
  todayMinIso: string;
  onBooked: () => void | Promise<void>;
  /** Staff/doctor extended hours when loading slots and schedule. */
  useDeskAvailability?: boolean;
  preferredProviderId?: number | null;
  /** Staff must confirm before the book-next API runs. */
  confirmBeforeSubmit?: (ctx: {
    patientLabel: string;
    serviceName: string;
    dateIso: string;
    timeLabel: string;
    providerName: string;
  }) => Promise<boolean>;
}) {
  const { runWithFeedback } = useAppFeedback();
  const [source, setSource] = useState<BookNextSource | null>(null);
  const [visitContext, setVisitContext] = useState<BookNextVisitContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [nextHandoffNotes, setNextHandoffNotes] = useState("");
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
  const [dayAppointments, setDayAppointments] = useState<BookNextDayAppointment[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [rangeAppointments, setRangeAppointments] = useState<BookNextDayAppointment[]>([]);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [scheduleView, setScheduleView] = useState<"day" | "week" | "month">("day");

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
    setVisitContext(null);
    setNextHandoffNotes("");
    setDayAppointments([]);
    setRangeAppointments([]);
    setScheduleView("day");
  }, []);

  const open = useCallback(
    (src: BookNextSource, opts?: { initialDate?: string }) => {
      void (async () => {
        setSource(src);
        setContextLoading(true);
        setVisitContext(null);
        setNextHandoffNotes("");
        const initialDate =
          opts?.initialDate ??
          (src.appointmentDate >= todayMinIso ? src.appointmentDate : todayMinIso);
        setDate(initialDate);
        setOptionsLoading(true);
        try {
          const [optsRes, ctx] = await Promise.all([
            apiGet<BookingOptionsResponse>("/booking-options/"),
            apiGetAuth<BookNextVisitContext>(`/appointments/${src.id}/book_next_context/`),
          ]);
          setBookingOptions(optsRes);
          setVisitContext(ctx);
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
          } else if (ctx.provider_id && provs.some((p) => p.id === ctx.provider_id)) {
            pid = ctx.provider_id;
          }
          setServiceId(sid);
          setProviderId(pid);
        } catch {
          setBookingOptions(null);
          setVisitContext(null);
          setServiceId(0);
          setProviderId(0);
        } finally {
          setOptionsLoading(false);
          setContextLoading(false);
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

  useEffect(() => {
    if (!source || !date || !providerId) {
      setDayAppointments([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setDayLoading(true);
      try {
        const params = new URLSearchParams({
          appointment_date: date,
          provider_id: String(providerId),
        });
        const list = await apiGetAuth<
          Array<{
            id: number;
            patient_name: string;
            start_time: string;
            end_time: string;
            status: string;
          }>
        >(`/appointments/?${params.toString()}`);
        if (cancelled) return;
        setDayAppointments(
          list.map((a) => ({
            id: a.id,
            patient_name: a.patient_name,
            start_time: a.start_time,
            end_time: a.end_time,
            status: a.status,
          })),
        );
      } catch {
        if (!cancelled) setDayAppointments([]);
      } finally {
        if (!cancelled) setDayLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source?.id, date, providerId]);

  useEffect(() => {
    if (!source || !providerId || !date || scheduleView === "day") {
      setRangeAppointments([]);
      return;
    }
    let cancelled = false;
    const range =
      scheduleView === "week"
        ? weekRangeContaining(date)
        : monthGridRange(date);
    void (async () => {
      setRangeLoading(true);
      try {
        const params = new URLSearchParams({
          date_from: range.start,
          date_to: range.end,
          provider_id: String(providerId),
        });
        const list = await apiGetAuth<
          Array<{
            id: number;
            appointment_date: string;
            patient_name: string;
            start_time: string;
            end_time: string;
            status: string;
          }>
        >(`/appointments/?${params.toString()}`);
        if (cancelled) return;
        setRangeAppointments(
          list.map((a) => ({
            id: a.id,
            appointment_date: a.appointment_date,
            patient_name: a.patient_name,
            start_time: a.start_time,
            end_time: a.end_time,
            status: a.status,
          })),
        );
      } catch {
        if (!cancelled) setRangeAppointments([]);
      } finally {
        if (!cancelled) setRangeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source?.id, date, providerId, scheduleView]);

  const selectSlot = useCallback((time: string) => {
    setSelectedSlot(time);
  }, []);

  const shiftDate = useCallback(
    (iso: string) => {
      if (iso < todayMinIso) return;
      setDate(iso);
    },
    [todayMinIso],
  );

  const submit = useCallback(async () => {
    if (!source || !serviceId || !providerId || !date || !selectedSlot) return;
    const svcName =
      bookingOptions?.services.find((s) => s.id === serviceId)?.name ??
      visitContext?.service_name ??
      "visit";
    const slotIdx = slotTimes.findIndex((t) => t === selectedSlot);
    const timeLabel =
      slotIdx >= 0 && slotLabels[slotIdx]
        ? slotLabels[slotIdx]
        : selectedSlot.length >= 5
          ? selectedSlot.slice(0, 5)
          : selectedSlot;
    const provName =
      bookingOptions?.providers_by_service[String(serviceId)]?.find((p) => p.id === providerId)
        ?.provider_name ??
      visitContext?.provider_name ??
      "";
    if (confirmBeforeSubmit) {
      const ok = await confirmBeforeSubmit({
        patientLabel: source.patientLabel ?? visitContext?.patient_name ?? "Patient",
        serviceName: svcName,
        dateIso: date,
        timeLabel,
        providerName: provName,
      });
      if (!ok) return;
    }
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
            clinical_handoff_notes: nextHandoffNotes.trim(),
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
  }, [
    source,
    serviceId,
    providerId,
    date,
    selectedSlot,
    slotLabels,
    slotTimes,
    bookingOptions,
    visitContext,
    nextHandoffNotes,
    confirmBeforeSubmit,
    close,
    onBooked,
    runWithFeedback,
  ]);

  const providerName =
    bookingOptions?.providers_by_service[String(serviceId)]?.find((p) => p.id === providerId)
      ?.provider_name ??
    visitContext?.provider_name ??
    "";

  const selectedService = bookingOptions?.services.find((s) => s.id === serviceId);
  const visitDurationMin = Math.max(5, Number(selectedService?.duration_minutes) || 30);
  const serviceType = selectedService?.service_type;
  const serviceName = selectedService?.name ?? visitContext?.service_name ?? "Visit";
  const calendarSpanMin =
    serviceType === "massage" ? visitDurationMin + 15 : visitDurationMin;

  const canSubmit =
    !saving &&
    !optionsLoading &&
    !contextLoading &&
    !!serviceId &&
    !!providerId &&
    !!date &&
    !!selectedSlot &&
    !slotsLoading &&
    slotLabels.length > 0;

  return {
    isOpen: source !== null,
    patientLabel: source?.patientLabel ?? visitContext?.patient_name ?? "",
    source,
    visitContext,
    contextLoading,
    nextHandoffNotes,
    setNextHandoffNotes,
    open,
    close,
    submit,
    saving,
    optionsLoading,
    slotsLoading,
    dayLoading,
    bookingOptions,
    serviceId,
    providerId,
    setProviderId,
    onServiceChange,
    date,
    setDate: shiftDate,
    slotLabels,
    slotTimes,
    selectedSlot,
    setSelectedSlot: selectSlot,
    dayAppointments,
    rangeAppointments,
    rangeLoading,
    scheduleView,
    setScheduleView,
    providerName,
    visitDurationMin,
    calendarSpanMin,
    serviceName,
    serviceType,
    useDeskAvailability,
    canSubmit,
    todayMinIso,
  };
}

export type BookNextVisitController = ReturnType<typeof useBookNextVisit>;
