"use client";

import { formatMonthDayYear } from "@/lib/format-date";
import type { RescheduleVisitSlotsController } from "@/hooks/use-reschedule-visit-slots";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Reschedule popup that picks a new date/time from real openings (doctor workflow). */
export function RescheduleVisitSlotsModal({
  reschedule,
  titleId = "reschedule-visit-slots-title",
  zIndexClass = "z-50",
}: {
  reschedule: RescheduleVisitSlotsController;
  titleId?: string;
  zIndexClass?: string;
}) {
  const [portalReady, setPortalReady] = useState(false);
  const src = reschedule.source;

  useEffect(() => {
    setPortalReady(true);
  }, []);

  if (!reschedule.isOpen || !src || !portalReady || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/40 p-4`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 id={titleId} className="text-lg font-bold text-slate-900">
          Reschedule visit
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Pick a new opening from the same rules as online booking. Visit length stays with the booked service.
        </p>
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-800">
          <p className="font-semibold text-slate-900">{src.patientLabel}</p>
          <p className="mt-1 text-slate-700">
            <span className="font-medium text-slate-600">Currently scheduled:</span>{" "}
            {formatMonthDayYear(src.appointmentDate)} · {src.startTimeDisplay}
            {src.endTimeDisplay ? ` – ${src.endTimeDisplay}` : ""}
          </p>
          {src.serviceLabel ? (
            <p className="mt-1 text-slate-700">
              <span className="font-medium text-slate-600">Service:</span> {src.serviceLabel}
            </p>
          ) : null}
        </div>
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-semibold text-slate-600">
            New date
            <input
              type="date"
              value={reschedule.date}
              min={reschedule.todayMinIso}
              onChange={(e) => reschedule.setDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            New time
            {reschedule.slotsLoading ? (
              <span className="mt-1 block text-sm font-normal text-slate-500">Loading openings…</span>
            ) : (
              <select
                value={reschedule.selectedSlot}
                onChange={(e) => reschedule.setSelectedSlot(e.target.value)}
                disabled={!reschedule.slotLabels.length}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {reschedule.slotLabels.length === 0 ? (
                  <option value="">No openings — pick another date</option>
                ) : (
                  reschedule.slotLabels.map((label, i) => (
                    <option key={`${label}-${i}`} value={reschedule.slotTimes[i] || label}>
                      {label}
                    </option>
                  ))
                )}
              </select>
            )}
          </label>
          {!src.bookedServiceId ? (
            <p className="text-sm text-amber-800">This visit has no booked service — contact the front desk to reschedule.</p>
          ) : null}
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={reschedule.close}
            disabled={reschedule.saving}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Close
          </button>
          <button
            type="button"
            disabled={!reschedule.canSubmit}
            onClick={() => void reschedule.submit()}
            className="rounded-xl bg-[#16a349] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
          >
            {reschedule.saving ? "Saving…" : "Confirm reschedule"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
