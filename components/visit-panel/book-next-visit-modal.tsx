"use client";

import type { BookNextVisitController } from "@/hooks/use-book-next-visit";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Modal to book a follow-up visit after a completed appointment (admin + doctor). */
export function BookNextVisitModal({
  bookNext,
  titleId = "book-next-visit-title",
  zIndexClass = "z-[400]",
  showOnlineRulesHint = true,
}: {
  bookNext: BookNextVisitController;
  titleId?: string;
  zIndexClass?: string;
  showOnlineRulesHint?: boolean;
}) {
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  if (!bookNext.isOpen || !portalReady || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/40 p-4`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 id={titleId} className="text-lg font-bold text-slate-900">
          Book next visit
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Schedule a new appointment for{" "}
          <span className="font-semibold text-slate-800">{bookNext.patientLabel}</span>.
          {showOnlineRulesHint ? (
            <> Only times that match online booking rules are shown.</>
          ) : null}
        </p>
        {bookNext.optionsLoading ? (
          <p className="mt-4 text-sm text-slate-600">Loading visit types…</p>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-semibold text-slate-600">
              Service
              <select
                value={bookNext.serviceId || ""}
                onChange={(e) => bookNext.onServiceChange(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {(bookNext.bookingOptions?.services ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Provider
              <select
                value={bookNext.providerId || ""}
                onChange={(e) => bookNext.setProviderId(Number(e.target.value))}
                disabled={!bookNext.serviceId}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {(bookNext.bookingOptions?.providers_by_service[String(bookNext.serviceId)] ?? []).map((p) => (
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
                value={bookNext.date}
                min={bookNext.todayMinIso}
                onChange={(e) => bookNext.setDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Time
              {bookNext.slotsLoading ? (
                <span className="mt-1 block text-sm font-normal text-slate-500">Loading openings…</span>
              ) : (
                <select
                  value={bookNext.selectedSlot}
                  onChange={(e) => bookNext.setSelectedSlot(e.target.value)}
                  disabled={!bookNext.slotLabels.length}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  {bookNext.slotLabels.length === 0 ? (
                    <option value="">No openings — adjust date, service, or provider</option>
                  ) : (
                    bookNext.slotLabels.map((label, i) => (
                      <option key={`${label}-bn-${i}`} value={bookNext.slotTimes[i] || label}>
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
            onClick={bookNext.close}
            disabled={bookNext.saving}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Close
          </button>
          <button
            type="button"
            disabled={!bookNext.canSubmit}
            onClick={() => void bookNext.submit()}
            className="rounded-xl bg-[#16a349] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
          >
            {bookNext.saving ? "Booking…" : "Confirm booking"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
