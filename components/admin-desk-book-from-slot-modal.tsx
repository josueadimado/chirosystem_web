"use client";

import { useAppFeedback } from "@/components/app-feedback";
import {
  minutesToLabel,
  parseTimeToMinutes,
  slotStartIsInPastForClinic,
} from "@/lib/admin-schedule-utils";
import { ApiError, apiGet, apiGetAuth, apiPost } from "@/lib/api";
import { formatWeekdayMonthDayYear } from "@/lib/format-date";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

/** Above admin/doctor sticky header (`z-30`); portaling to `body` avoids `main` stacking so the dimmer covers chrome. */
const DESK_BOOK_MODAL_Z = "z-[400]";

/** Post-massage calendar hold — matches API `public_online_booking_calendar_span_minutes`. */
const MASSAGE_DESK_BOOK_TAIL_MINUTES = 15;

function deskCalendarSpanMinutes(s: { service_type?: string; duration_minutes: number }): number {
  const d = Math.max(5, Number(s.duration_minutes) || 30);
  return s.service_type === "massage" ? d + MASSAGE_DESK_BOOK_TAIL_MINUTES : d;
}

/** Seed from clicking an open region on the day schedule grid (15-minute snap + gap bounds). */
export type DeskBookSlotSeed = {
  providerId: number;
  providerName: string;
  dateIso: string;
  /** Minutes from midnight (snapped click) */
  startMinute: number;
  /** Contiguous free window on the admin grid (minutes from midnight) */
  gapStartMin: number;
  gapEndMin: number;
};

type BookingOptionsResponse = {
  services: Array<{
    id: number;
    name: string;
    duration_minutes: number;
    price: string;
    service_type: string;
  }>;
  providers_by_service: Record<string, Array<{ id: number; provider_name: string }>>;
};

type PatientSearchRow = {
  id: number;
  first_name: string;
  last_name: string;
  phone?: string;
};

function minutesToHHMMSS(totalMin: number): string {
  const h24 = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function normalizePatientListPayload(data: unknown): PatientSearchRow[] {
  if (Array.isArray(data)) return data as PatientSearchRow[];
  if (data && typeof data === "object" && "results" in data && Array.isArray((data as { results: unknown }).results)) {
    return (data as { results: PatientSearchRow[] }).results;
  }
  return [];
}

function startMinutesForSlotRow(
  label: string,
  timeVal: string,
): number {
  const t = (timeVal || "").trim();
  if (t) return parseTimeToMinutes(t);
  return parseTimeToMinutes(label);
}

/**
 * Front desk / doctor: after clicking an open slot on the schedule day grid, pick a patient and service
 * and confirm. Staff may book through 9:00 PM (`desk=1` availability); patients still use public closing rules.
 * When still on the same date/provider as the clicked strip, start times are limited so the full
 * calendar block (visit + massage tail) fits inside that free window.
 */
export function AdminDeskBookFromSlotModal({
  open,
  onClose,
  seed,
  lockProvider,
  todayMinIso,
  onBooked,
}: {
  open: boolean;
  onClose: () => void;
  seed: DeskBookSlotSeed | null;
  /** When true, provider is fixed (doctor’s own column). */
  lockProvider?: boolean;
  todayMinIso: string;
  onBooked: () => void | Promise<void>;
}) {
  const { runWithFeedback } = useAppFeedback();
  const [options, setOptions] = useState<BookingOptionsResponse | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [serviceId, setServiceId] = useState(0);
  const [providerId, setProviderId] = useState(0);
  const [dateIso, setDateIso] = useState("");
  const [slotLabels, setSlotLabels] = useState<string[]>([]);
  const [slotTimes, setSlotTimes] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientHits, setPatientHits] = useState<PatientSearchRow[]>([]);
  const [patientLoading, setPatientLoading] = useState(false);
  const [patientId, setPatientId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const seedLabel = useMemo(() => (seed ? minutesToLabel(seed.startMinute) : ""), [seed]);
  const gapStripLabel = useMemo(() => {
    if (!seed) return "";
    return `${minutesToLabel(seed.gapStartMin)} – ${minutesToLabel(seed.gapEndMin)}`;
  }, [seed]);

  const bookableServices = useMemo(() => {
    const all = options?.services ?? [];
    if (!lockProvider || !providerId) return all;
    return all.filter((s) =>
      (options?.providers_by_service[String(s.id)] ?? []).some((p) => p.id === providerId),
    );
  }, [options, lockProvider, providerId]);

  const selectedService = useMemo(
    () => bookableServices.find((s) => s.id === serviceId) ?? null,
    [bookableServices, serviceId],
  );

  const gapContextActive = useMemo(() => {
    if (!seed) return false;
    return dateIso === seed.dateIso && providerId === seed.providerId;
  }, [seed, dateIso, providerId]);

  const selectedStartMinutes = useMemo(() => {
    if (!selectedSlot) return null;
    const idx = slotTimes.findIndex((t) => t === selectedSlot);
    if (idx >= 0 && slotLabels[idx]) return startMinutesForSlotRow(slotLabels[idx], slotTimes[idx] || "");
    if (selectedSlot.includes(":")) return parseTimeToMinutes(selectedSlot);
    return null;
  }, [selectedSlot, slotLabels, slotTimes]);

  const scheduleEndMinutes = useMemo(() => {
    if (selectedStartMinutes == null || !selectedService) return null;
    return selectedStartMinutes + deskCalendarSpanMinutes(selectedService);
  }, [selectedStartMinutes, selectedService]);

  const selectedStartIsPast = useMemo(() => {
    if (selectedStartMinutes == null || !dateIso) return false;
    return slotStartIsInPastForClinic(dateIso, selectedStartMinutes, todayMinIso);
  }, [selectedStartMinutes, dateIso, todayMinIso]);

  const fitsInClickedStrip = useMemo(() => {
    if (!seed || !gapContextActive || selectedStartMinutes == null || !selectedService) return true;
    const span = deskCalendarSpanMinutes(selectedService);
    const end = selectedStartMinutes + span;
    return selectedStartMinutes >= seed.gapStartMin && end <= seed.gapEndMin;
  }, [seed, gapContextActive, selectedStartMinutes, selectedService]);

  useEffect(() => {
    if (!open || !seed) return;
    setDateIso(seed.dateIso);
    setProviderId(seed.providerId);
    setPatientQuery("");
    setPatientHits([]);
    setPatientId(null);
    setSelectedSlot("");
    setSlotLabels([]);
    setSlotTimes([]);
    let cancelled = false;
    setOptionsLoading(true);
    void apiGet<BookingOptionsResponse>("/booking-options/")
      .then((opts) => {
        if (cancelled) return;
        setOptions(opts);
        const forProvider = lockProvider
          ? opts.services.filter((s) =>
              (opts.providers_by_service[String(s.id)] ?? []).some((p) => p.id === seed.providerId),
            )
          : opts.services;
        const first = forProvider[0]?.id ?? opts.services[0]?.id ?? 0;
        setServiceId(first);
        const provs = opts.providers_by_service[String(first)] ?? [];
        const pid = lockProvider
          ? seed.providerId
          : provs.some((p) => p.id === seed.providerId)
            ? seed.providerId
            : provs[0]?.id ?? seed.providerId;
        setProviderId(pid);
      })
      .catch(() => {
        if (!cancelled) setOptions(null);
      })
      .finally(() => {
        if (!cancelled) setOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, seed, lockProvider]);

  useEffect(() => {
    if (!open || bookableServices.length === 0) return;
    if (!bookableServices.some((s) => s.id === serviceId)) {
      setServiceId(bookableServices[0].id);
    }
  }, [open, bookableServices, serviceId]);

  useEffect(() => {
    if (!open || !options || !serviceId || !providerId || !dateIso) {
      setSlotLabels([]);
      setSlotTimes([]);
      setSelectedSlot("");
      return;
    }
    const svc = options.services.find((s) => s.id === serviceId);
    if (!svc) {
      setSlotLabels([]);
      setSlotTimes([]);
      setSelectedSlot("");
      return;
    }

    let cancelled = false;
    setSlotsLoading(true);
    const q = new URLSearchParams({
      date: dateIso,
      provider_id: String(providerId),
      service_id: String(serviceId),
      desk: "1",
    });
    void apiGetAuth<{ available_slots?: string[]; slot_start_times?: string[] }>(`/booking-options/availability/?${q}`)
      .then((data) => {
        if (cancelled) return;
        let labels = data.available_slots ?? [];
        const timesRaw = data.slot_start_times ?? [];
        let resolvedTimes = timesRaw.length ? timesRaw : labels.map(() => "");

        const strip =
          seed && dateIso === seed.dateIso && providerId === seed.providerId ? seed : null;
        if (strip) {
          const span = deskCalendarSpanMinutes(svc);
          const keptLabels: string[] = [];
          const keptTimes: string[] = [];
          labels.forEach((lab, i) => {
            const tStr = (resolvedTimes[i] || "").trim();
            const st = startMinutesForSlotRow(lab, tStr);
            if (slotStartIsInPastForClinic(dateIso, st, todayMinIso)) return;
            if (st >= strip.gapStartMin && st + span <= strip.gapEndMin) {
              keptLabels.push(lab);
              keptTimes.push(tStr || minutesToHHMMSS(st));
            }
          });
          labels = keptLabels;
          resolvedTimes = keptTimes;
        } else {
          const keptLabels: string[] = [];
          const keptTimes: string[] = [];
          labels.forEach((lab, i) => {
            const tStr = (resolvedTimes[i] || "").trim();
            const st = startMinutesForSlotRow(lab, tStr);
            if (slotStartIsInPastForClinic(dateIso, st, todayMinIso)) return;
            keptLabels.push(lab);
            keptTimes.push(tStr || minutesToHHMMSS(st));
          });
          labels = keptLabels;
          resolvedTimes = keptTimes;
        }

        setSlotLabels(labels);
        setSlotTimes(resolvedTimes);
        if (labels.length === 0) {
          setSelectedSlot("");
          return;
        }
        const want = seed?.dateIso === dateIso && seed?.providerId === providerId ? seed.startMinute : null;
        let pickIdx = 0;
        if (want != null) {
          let best = Infinity;
          resolvedTimes.forEach((t, i) => {
            const cand = startMinutesForSlotRow(labels[i] || "", t);
            const d = Math.abs(cand - want);
            if (d < best) {
              best = d;
              pickIdx = i;
            }
          });
        }
        const tPick = (resolvedTimes[pickIdx] || "").trim();
        const lab = labels[pickIdx] || "";
        setSelectedSlot(tPick || minutesToHHMMSS(lab ? parseTimeToMinutes(lab) : seed?.startMinute ?? 0));
      })
      .catch(() => {
        if (!cancelled) {
          setSlotLabels([]);
          setSlotTimes([]);
          setSelectedSlot("");
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, options, serviceId, providerId, dateIso, seed]);

  useEffect(() => {
    if (!open) return;
    const q = patientQuery.trim();
    if (q.length < 2) {
      setPatientHits([]);
      return;
    }
    let cancelled = false;
    setPatientLoading(true);
    const t = window.setTimeout(() => {
      void apiGetAuth<unknown>(`/patients/?search=${encodeURIComponent(q)}&page_size=40`)
        .then((data) => {
          if (!cancelled) setPatientHits(normalizePatientListPayload(data));
        })
        .catch(() => {
          if (!cancelled) setPatientHits([]);
        })
        .finally(() => {
          if (!cancelled) setPatientLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, patientQuery]);

  const canSubmit =
    !saving &&
    !optionsLoading &&
    Boolean(patientId) &&
    Boolean(serviceId) &&
    Boolean(providerId) &&
    Boolean(dateIso) &&
    Boolean(selectedSlot) &&
    !slotsLoading &&
    slotLabels.length > 0 &&
    fitsInClickedStrip &&
    !selectedStartIsPast;

  const submit = async () => {
    if (!seed || !canSubmit) return;
    setSaving(true);
    try {
      await runWithFeedback(
        async () => {
          await apiPost(`/appointments/book-from-desk/`, {
            patient_id: patientId,
            service_id: serviceId,
            provider_id: providerId,
            appointment_date: dateIso,
            start_time: selectedSlot,
          });
          onClose();
          await onBooked();
        },
        {
          loadingMessage: "Booking…",
          successMessage: "Appointment booked",
          errorFallback: "Could not book that slot (rules, intake, or conflict).",
        },
      );
    } catch (e) {
      if (e instanceof ApiError) {
        /* runWithFeedback already surfaced */
      }
    } finally {
      setSaving(false);
    }
  };

  if (!open || !seed) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${DESK_BOOK_MODAL_Z} flex items-center justify-center bg-black/40 p-4`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="desk-book-slot-title"
    >
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <h2 id="desk-book-slot-title" className="text-2xl font-bold text-slate-900">
          Book from schedule
        </h2>
        <p className="mt-2 text-base text-slate-600">
          Near <span className="font-semibold text-slate-800">{seedLabel}</span> ·{" "}
          <span className="font-semibold text-slate-800">{seed.providerName}</span> ·{" "}
          {formatWeekdayMonthDayYear(seed.dateIso)}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Open strip on calendar: <span className="font-medium text-slate-700">{gapStripLabel}</span>
          {gapContextActive ? (
            <span className="block pt-1">
              Staff may schedule past public online closing (through 9:00 PM). The visit must still fit inside
              this open strip (visit length
              {selectedService?.service_type === "massage"
                ? ` plus ${MASSAGE_DESK_BOOK_TAIL_MINUTES} min schedule cleanup for massage`
                : ""}
              ).
            </span>
          ) : null}
        </p>

        {optionsLoading ? (
          <p className="mt-6 text-base text-slate-600">Loading visit types…</p>
        ) : (
          <div className="mt-6 space-y-5">
            <label className="block text-sm font-semibold text-slate-700">
              Patient search
              <input
                type="search"
                value={patientQuery}
                onChange={(e) => {
                  setPatientQuery(e.target.value);
                  setPatientId(null);
                }}
                placeholder="Type name or phone (2+ characters)"
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-base"
                autoComplete="off"
              />
            </label>
            {patientLoading && <p className="text-sm text-slate-500">Searching…</p>}
            {!patientLoading && patientQuery.trim().length >= 2 && patientHits.length === 0 && (
              <p className="text-sm text-slate-500">No matches — try another spelling or phone fragment.</p>
            )}
            {patientHits.length > 0 && (
              <ul className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/80 text-base">
                {patientHits.map((p) => {
                  const label = `${p.first_name} ${p.last_name}`.trim();
                  const sub = (p.phone || "").trim();
                  const active = patientId === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setPatientId(p.id)}
                        className={`w-full px-4 py-3 text-left transition hover:bg-white ${
                          active ? "bg-emerald-50 font-semibold text-emerald-950" : "text-slate-800"
                        }`}
                      >
                        {label}
                        {sub ? <span className="block text-sm font-normal text-slate-500">{sub}</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <label className="block text-sm font-semibold text-slate-700">
              Service <span className="font-normal text-slate-500">(length shown)</span>
              <select
                value={serviceId || ""}
                onChange={(e) => {
                  const sid = Number(e.target.value);
                  setServiceId(sid);
                  const provs = options?.providers_by_service[String(sid)] ?? [];
                  const pid = lockProvider
                    ? seed.providerId
                    : provs.some((p) => p.id === seed.providerId)
                      ? seed.providerId
                      : provs[0]?.id ?? seed.providerId;
                  setProviderId(pid);
                }}
                disabled={!bookableServices.length}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-base"
              >
                {bookableServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.duration_minutes} min
                    {s.service_type === "massage" ? ` (+${MASSAGE_DESK_BOOK_TAIL_MINUTES} min on schedule)` : ""}
                  </option>
                ))}
              </select>
            </label>

            {selectedService ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-base leading-relaxed text-slate-800">
                <p>
                  <span className="font-semibold text-slate-900">Patient visit:</span>{" "}
                  {selectedService.duration_minutes} minutes
                </p>
                {selectedService.service_type === "massage" ? (
                  <p className="mt-1 text-sm text-slate-600">
                    The schedule also reserves {MASSAGE_DESK_BOOK_TAIL_MINUTES} minutes after for room cleanup (same as
                    online booking). Your booking must fit the open strip including that block.
                  </p>
                ) : null}
                {selectedStartMinutes != null && scheduleEndMinutes != null ? (
                  <p className="mt-3 border-t border-slate-200 pt-3 font-medium text-slate-900">
                    With the start time below: <span className="text-[#0d5c2e]">{minutesToLabel(selectedStartMinutes)}</span>{" "}
                    → block ends on schedule at{" "}
                    <span className="text-[#0d5c2e]">{minutesToLabel(scheduleEndMinutes)}</span>
                  </p>
                ) : null}
                {gapContextActive && !fitsInClickedStrip && selectedService && selectedStartMinutes != null ? (
                  <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-900">
                    This service is too long for the open strip you clicked (or the start time is too late). Choose a
                    shorter service, switch to a time that still appears in the list, or click a wider open area on the
                    calendar.
                  </p>
                ) : null}
                {gapContextActive && !slotsLoading && slotLabels.length === 0 && selectedService ? (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950">
                    No start times fit in this open strip for this service. Pick another service or close and choose a
                    larger open block.
                  </p>
                ) : null}
              </div>
            ) : null}

            <label className="block text-sm font-semibold text-slate-700">
              Provider
              <select
                value={providerId || ""}
                onChange={(e) => setProviderId(Number(e.target.value))}
                disabled={!serviceId || lockProvider}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-base disabled:bg-slate-50"
              >
                {(options?.providers_by_service[String(serviceId)] ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.provider_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              Date
              <input
                type="date"
                value={dateIso}
                min={todayMinIso}
                onChange={(e) => setDateIso(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-base"
              />
            </label>

            {selectedStartIsPast ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                That start time has already passed. Pick a later time today or choose a future date.
              </p>
            ) : null}
            <label className="block text-sm font-semibold text-slate-700">
              Start time
              {slotsLoading ? (
                <span className="mt-2 block text-base font-normal text-slate-500">Loading openings…</span>
              ) : (
                <select
                  value={selectedSlot}
                  onChange={(e) => setSelectedSlot(e.target.value)}
                  disabled={!slotLabels.length || selectedStartIsPast}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-base"
                >
                  {slotLabels.length === 0 ? (
                    <option value="">
                      {dateIso === todayMinIso
                        ? "No future times left today for this strip — try another date"
                        : "No times fit this strip + service — adjust above"}
                    </option>
                  ) : (
                    slotLabels.map((label, i) => (
                      <option key={`${label}-${i}`} value={slotTimes[i] || minutesToHHMMSS(parseTimeToMinutes(label))}>
                        {label}
                      </option>
                    ))
                  )}
                </select>
              )}
            </label>
          </div>
        )}
        <div className="mt-8 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 px-5 py-3 text-base font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
            className="rounded-xl bg-[#16a349] px-5 py-3 text-base font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
          >
            {saving ? "Booking…" : "Confirm booking"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
