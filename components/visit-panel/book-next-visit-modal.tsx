"use client";

import { ChartNoteReader } from "@/components/chart-note-document";
import { VisitDiagnosisDisplay } from "@/components/visit-diagnosis-display";
import { BookNextSchedulePanel } from "@/components/visit-panel/book-next-schedule-panel";
import type { BookNextVisitController } from "@/hooks/use-book-next-visit";
import { formatWeekdayMonthDayYear } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Book a follow-up visit with day/week/month schedule + prior visit context (admin + doctor). */
export function BookNextVisitModal({
  bookNext,
  titleId = "book-next-visit-title",
  zIndexClass = "z-[400]",
  showDeskHoursHint = true,
}: {
  bookNext: BookNextVisitController;
  titleId?: string;
  zIndexClass?: string;
  showDeskHoursHint?: boolean;
}) {
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  if (!bookNext.isOpen || !portalReady || typeof document === "undefined") return null;

  const ctx = bookNext.visitContext;
  const loading = bookNext.optionsLoading || bookNext.contextLoading;
  const expanded = bookNext.scheduleExpanded;

  return createPortal(
    <div
      className={cn("fixed inset-0 flex items-center justify-center bg-black/50 p-2 sm:p-4", zIndexClass)}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className={cn(
          "flex max-h-[min(96dvh,960px)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl",
          expanded ? "max-w-[min(96vw,1280px)]" : "max-w-[min(96vw,1100px)]",
        )}
      >
        <div className="shrink-0 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
          <h2 id={titleId} className="text-lg font-bold text-slate-900 sm:text-xl">
            Book next visit
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Schedule a follow-up for{" "}
            <span className="font-semibold text-slate-800">{bookNext.patientLabel}</span>. Use{" "}
            <strong>Day / Week / Month</strong> on the schedule, tap <strong>Larger</strong> for more room, then confirm.
            {showDeskHoursHint ? (
              <> Open times match the front desk schedule (through 9:00 PM).</>
            ) : null}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
          {loading ? (
            <p className="text-sm text-slate-600">Loading visit details and schedule…</p>
          ) : (
            <div
              className={cn(
                "grid gap-4 lg:gap-5",
                expanded ? "lg:grid-cols-1" : "lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]",
              )}
            >
              {!expanded ? (
                <div className="space-y-4 lg:max-h-[min(72dvh,680px)] lg:overflow-y-auto lg:pr-1">
                  {ctx ? (
                    <section className="rounded-xl border border-violet-200/90 bg-violet-50/50 px-3 py-3 sm:px-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-violet-900">
                        Last completed visit
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {formatWeekdayMonthDayYear(ctx.appointment_date)} at {ctx.start_time_display}
                      </p>
                      <p className="text-xs text-slate-600">
                        {ctx.service_name} · {ctx.provider_name}
                      </p>
                      {(ctx.diagnoses?.length ?? 0) > 0 || ctx.diagnosis?.trim() ? (
                        <div className="mt-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            Diagnosis from that visit
                          </p>
                          <div className="mt-1.5 rounded-lg border border-violet-200/60 bg-white/90 p-2.5">
                            <VisitDiagnosisDisplay
                              diagnosis={ctx.diagnosis}
                              diagnoses={ctx.diagnoses}
                              className="text-xs leading-relaxed text-slate-800"
                            />
                          </div>
                        </div>
                      ) : null}
                      {ctx.clinical_notes?.trim() ? (
                        <div className="mt-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            Consultation notes (SOAP)
                          </p>
                          <div className="mt-1 max-h-28 overflow-y-auto rounded-lg border border-violet-200/60 bg-white/80 p-2">
                            <ChartNoteReader text={ctx.clinical_notes} className="text-xs" />
                          </div>
                        </div>
                      ) : null}
                      {ctx.handoff_notes?.trim() ? (
                        <div className="mt-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            Reminders from that visit
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                            {ctx.handoff_notes}
                          </p>
                        </div>
                      ) : null}
                      {!ctx.diagnosis?.trim() &&
                      !(ctx.diagnoses?.length ?? 0) &&
                      !ctx.clinical_notes?.trim() &&
                      !ctx.handoff_notes?.trim() ? (
                        <p className="mt-2 text-xs text-slate-500">No chart notes were saved on that visit.</p>
                      ) : null}
                    </section>
                  ) : null}

                  <section className="rounded-xl border border-sky-200/80 bg-sky-50/40 px-3 py-3 sm:px-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-sky-900">
                      Reminders for the next visit
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-sky-950/85">
                      Saved on the new appointment — visible when you open that visit (not on the patient bill).
                    </p>
                    <textarea
                      value={bookNext.nextHandoffNotes}
                      onChange={(e) => bookNext.setNextHandoffNotes(e.target.value)}
                      rows={3}
                      placeholder="e.g. Recheck low back · follow up on home exercises"
                      className="mt-2 w-full resize-y rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15"
                    />
                  </section>

                  <div className="grid gap-3 sm:grid-cols-2">
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
                        {(bookNext.bookingOptions?.providers_by_service[String(bookNext.serviceId)] ?? []).map(
                          (p) => (
                            <option key={p.id} value={p.id}>
                              {p.provider_name}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  </div>
                </div>
              ) : null}

              <BookNextSchedulePanel
                dateIso={bookNext.date}
                todayMinIso={bookNext.todayMinIso}
                providerName={bookNext.providerName}
                onDateChange={bookNext.setDate}
                viewMode={bookNext.scheduleView}
                onViewModeChange={bookNext.setScheduleView}
                expanded={expanded}
                onExpandedChange={bookNext.setScheduleExpanded}
                dayLoading={bookNext.dayLoading}
                rangeLoading={bookNext.rangeLoading}
                dayAppointments={bookNext.dayAppointments}
                rangeAppointments={bookNext.rangeAppointments}
                slotLabels={bookNext.slotLabels}
                slotTimes={bookNext.slotTimes}
                selectedSlot={bookNext.selectedSlot}
                onSelectSlot={(time) => bookNext.setSelectedSlot(time)}
                slotsLoading={bookNext.slotsLoading}
                deskHours={bookNext.useDeskAvailability}
              />

              {expanded ? (
                <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block text-xs font-semibold text-slate-600 sm:col-span-1">
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
                  <label className="block text-xs font-semibold text-slate-600 sm:col-span-1">
                    Provider
                    <select
                      value={bookNext.providerId || ""}
                      onChange={(e) => bookNext.setProviderId(Number(e.target.value))}
                      disabled={!bookNext.serviceId}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      {(bookNext.bookingOptions?.providers_by_service[String(bookNext.serviceId)] ?? []).map(
                        (p) => (
                          <option key={p.id} value={p.id}>
                            {p.provider_name}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
                    Reminders for next visit
                    <textarea
                      value={bookNext.nextHandoffNotes}
                      onChange={(e) => bookNext.setNextHandoffNotes(e.target.value)}
                      rows={2}
                      className="mt-1 w-full resize-y rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-6 sm:py-4">
          <p className="text-xs text-slate-600">
            {bookNext.selectedSlot && bookNext.date ? (
              <>
                Booking:{" "}
                <span className="font-semibold text-slate-800">
                  {formatWeekdayMonthDayYear(bookNext.date)}
                  {(() => {
                    const i = bookNext.slotTimes.indexOf(bookNext.selectedSlot);
                    const lbl = i >= 0 ? bookNext.slotLabels[i] : "";
                    return lbl ? ` · ${lbl}` : "";
                  })()}
                </span>
              </>
            ) : (
              "Select an open time on the schedule."
            )}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={bookNext.close}
              disabled={bookNext.saving}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white disabled:opacity-50"
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
      </div>
    </div>,
    document.body,
  );
}
