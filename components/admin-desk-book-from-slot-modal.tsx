"use client";

import { useAppFeedback } from "@/components/app-feedback";
import { minutesToLabel, parseTimeToMinutes } from "@/lib/admin-schedule-utils";
import { ApiError, apiGet, apiGetAuth, apiPost } from "@/lib/api";
import { formatWeekdayMonthDayYear } from "@/lib/format-date";
import { useEffect, useMemo, useState } from "react";

/** Seed from clicking an open region on the day schedule grid (15-minute snap). */
export type DeskBookSlotSeed = {
  providerId: number;
  providerName: string;
  dateIso: string;
  /** Minutes from midnight */
  startMinute: number;
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

/**
 * Front desk / doctor: after clicking an open slot on the schedule day grid, pick a patient and service
 * and confirm. Uses the same slot rules as online booking (`/appointments/book-from-desk/`).
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
        const first = opts.services[0]?.id ?? 0;
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
    if (!open || !options || !serviceId || !providerId || !dateIso) {
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
    });
    void apiGetAuth<{ available_slots?: string[]; slot_start_times?: string[] }>(`/booking-options/availability/?${q}`)
      .then((data) => {
        if (cancelled) return;
        const labels = data.available_slots ?? [];
        const times = data.slot_start_times ?? [];
        setSlotLabels(labels);
        const resolvedTimes = times.length ? times : labels.map(() => "");
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
            const cand = (t || "").trim() ? parseTimeToMinutes(t) : parseTimeToMinutes(labels[i] || "");
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
          if (cancelled) return;
          setPatientHits(normalizePatientListPayload(data));
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

  const submit = async () => {
    if (!seed || !patientId || !serviceId || !providerId || !dateIso || !selectedSlot) return;
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

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="desk-book-slot-title"
    >
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 id="desk-book-slot-title" className="text-lg font-bold text-slate-900">
          Book from schedule
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Open slot near <span className="font-semibold text-slate-800">{seedLabel}</span> ·{" "}
          <span className="font-semibold text-slate-800">{seed.providerName}</span> ·{" "}
          {formatWeekdayMonthDayYear(seed.dateIso)}
        </p>
        {optionsLoading ? (
          <p className="mt-4 text-sm text-slate-600">Loading visit types…</p>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-semibold text-slate-600">
              Patient search
              <input
                type="search"
                value={patientQuery}
                onChange={(e) => {
                  setPatientQuery(e.target.value);
                  setPatientId(null);
                }}
                placeholder="Type name or phone (2+ characters)"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                autoComplete="off"
              />
            </label>
            {patientLoading && <p className="text-xs text-slate-500">Searching…</p>}
            {!patientLoading && patientQuery.trim().length >= 2 && patientHits.length === 0 && (
              <p className="text-xs text-slate-500">No matches — try another spelling or phone fragment.</p>
            )}
            {patientHits.length > 0 && (
              <ul className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/80 text-sm">
                {patientHits.map((p) => {
                  const label = `${p.first_name} ${p.last_name}`.trim();
                  const sub = (p.phone || "").trim();
                  const active = patientId === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setPatientId(p.id)}
                        className={`w-full px-3 py-2 text-left transition hover:bg-white ${
                          active ? "bg-emerald-50 font-semibold text-emerald-950" : "text-slate-800"
                        }`}
                      >
                        {label}
                        {sub ? <span className="block text-xs font-normal text-slate-500">{sub}</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <label className="block text-xs font-semibold text-slate-600">
              Service
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
                disabled={!options?.services?.length}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {(options?.services ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-semibold text-slate-600">
              Provider
              <select
                value={providerId || ""}
                onChange={(e) => setProviderId(Number(e.target.value))}
                disabled={!serviceId || lockProvider}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
              >
                {(options?.providers_by_service[String(serviceId)] ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.provider_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-semibold text-slate-600">
              Date
              <input
                type="date"
                value={dateIso}
                min={todayMinIso}
                onChange={(e) => setDateIso(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>

            <label className="block text-xs font-semibold text-slate-600">
              Start time
              {slotsLoading ? (
                <span className="mt-1 block text-sm font-normal text-slate-500">Loading openings…</span>
              ) : (
                <select
                  value={selectedSlot}
                  onChange={(e) => setSelectedSlot(e.target.value)}
                  disabled={!slotLabels.length}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  {slotLabels.length === 0 ? (
                    <option value="">No openings — change date, service, or provider</option>
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
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={
              saving ||
              optionsLoading ||
              !patientId ||
              !serviceId ||
              !providerId ||
              !dateIso ||
              !selectedSlot ||
              slotsLoading ||
              !slotLabels.length
            }
            onClick={() => void submit()}
            className="rounded-xl bg-[#16a349] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
          >
            {saving ? "Booking…" : "Confirm booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
