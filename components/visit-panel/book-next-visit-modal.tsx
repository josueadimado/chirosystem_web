"use client";

import { ChartNoteReaderPanel, type ChartNoteMeta } from "@/components/chart-note-document";
import { VisitDiagnosisDisplay } from "@/components/visit-diagnosis-display";
import { BookNextSchedulePanel } from "@/components/visit-panel/book-next-schedule-panel";
import type { BookNextVisitController } from "@/hooks/use-book-next-visit";
import { formatWeekdayMonthDayYear } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Book a follow-up visit — large time picker + optional calendar browsing (admin + doctor). */
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
  const soapMeta: ChartNoteMeta | undefined = ctx
    ? {
        dateLabel: `${formatWeekdayMonthDayYear(ctx.appointment_date)} at ${ctx.start_time_display}`,
        provider: ctx.provider_name,
        service: ctx.service_name,
      }
    : undefined;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 flex items-stretch justify-center bg-black/50 p-0 sm:items-center sm:p-4",
        zIndexClass,
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="flex h-[100dvh] w-full max-w-[min(100vw,1200px)] flex-col overflow-hidden bg-white shadow-2xl sm:h-[min(94dvh,880px)] sm:rounded-2xl sm:border sm:border-slate-200">
        <div className="shrink-0 border-b border-slate-100 px-4 py-4 sm:px-6">
          <h2 id={titleId} className="text-xl font-bold text-slate-900 sm:text-2xl">
            Book next visit
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600 sm:text-base">
            Schedule a follow-up for{" "}
            <span className="font-semibold text-slate-900">{bookNext.patientLabel}</span>. Use the same day view as
            your main schedule. <strong>Day</strong> shows one day in detail; <strong>Week</strong> shows the whole week
            like the main calendar (gray = booked, green = open). Tap to pick a start time.
            {showDeskHoursHint ? (
              <> Hours run 7:00 AM–9:00 PM (front desk schedule).</>
            ) : null}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {loading ? (
            <p className="text-base text-slate-600">Loading visit details and open times…</p>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-700">
                  Service
                  <select
                    value={bookNext.serviceId || ""}
                    onChange={(e) => bookNext.onServiceChange(Number(e.target.value))}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-base"
                  >
                    {(bookNext.bookingOptions?.services ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Provider
                  <select
                    value={bookNext.providerId || ""}
                    onChange={(e) => bookNext.setProviderId(Number(e.target.value))}
                    disabled={!bookNext.serviceId}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-base disabled:bg-slate-50"
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

              {ctx ? (
                <details className="rounded-xl border border-violet-200/90 bg-violet-50/40">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-violet-950 marker:content-none [&::-webkit-details-marker]:hidden">
                    Last visit notes & reminders for next visit
                  </summary>
                  <div className="space-y-4 border-t border-violet-200/60 px-4 pb-4 pt-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-violet-900">
                        Last completed visit
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {formatWeekdayMonthDayYear(ctx.appointment_date)} at {ctx.start_time_display}
                      </p>
                      <p className="text-sm text-slate-600">
                        {ctx.service_name} · {ctx.provider_name}
                      </p>
                      {(ctx.diagnoses?.length ?? 0) > 0 || ctx.diagnosis?.trim() ? (
                        <div className="mt-3 rounded-lg border border-violet-200/60 bg-white/90 p-3">
                          <p className="text-xs font-bold uppercase text-slate-500">Diagnosis</p>
                          <VisitDiagnosisDisplay
                            diagnosis={ctx.diagnosis}
                            diagnoses={ctx.diagnoses}
                            className="mt-1 text-sm leading-relaxed text-slate-800"
                          />
                        </div>
                      ) : null}
                      {ctx.clinical_notes?.trim() ? (
                        <div className="mt-3 rounded-lg border border-violet-200/60 bg-white/90 p-3">
                          <p className="text-xs font-bold uppercase text-slate-500">SOAP notes</p>
                          <ChartNoteReaderPanel
                            text={ctx.clinical_notes}
                            meta={soapMeta}
                            title="SOAP notes — last visit"
                            className="mt-2 max-h-40 overflow-y-auto text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                    <label className="block text-sm font-semibold text-sky-900">
                      Reminders for the new appointment
                      <textarea
                        value={bookNext.nextHandoffNotes}
                        onChange={(e) => bookNext.setNextHandoffNotes(e.target.value)}
                        rows={3}
                        placeholder="e.g. Recheck low back · follow up on home exercises"
                        className="mt-2 w-full resize-y rounded-xl border border-sky-200 bg-white px-4 py-3 text-base text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15"
                      />
                    </label>
                  </div>
                </details>
              ) : (
                <label className="block rounded-xl border border-sky-200/80 bg-sky-50/40 px-4 py-3 text-sm font-semibold text-sky-900">
                  Reminders for the new appointment
                  <textarea
                    value={bookNext.nextHandoffNotes}
                    onChange={(e) => bookNext.setNextHandoffNotes(e.target.value)}
                    rows={3}
                    placeholder="e.g. Recheck low back · follow up on home exercises"
                    className="mt-2 w-full resize-y rounded-xl border border-sky-200 bg-white px-4 py-3 text-base"
                  />
                </label>
              )}

              <BookNextSchedulePanel
                dateIso={bookNext.date}
                todayMinIso={bookNext.todayMinIso}
                providerName={bookNext.providerName}
                onDateChange={bookNext.setDate}
                viewMode={bookNext.scheduleView}
                onViewModeChange={bookNext.setScheduleView}
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
                visitDurationMin={bookNext.visitDurationMin}
                calendarSpanMin={bookNext.calendarSpanMin}
                serviceName={bookNext.serviceName}
                serviceType={bookNext.serviceType}
                onPickDayAndStartMinute={bookNext.pickDayAndStartMinute}
              />
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-slate-700 sm:text-base">
            {bookNext.selectedSlot && bookNext.date ? (
              <>
                Selected:{" "}
                <span className="font-bold text-slate-900">
                  {formatWeekdayMonthDayYear(bookNext.date)}
                  {(() => {
                    const i = bookNext.slotTimes.indexOf(bookNext.selectedSlot);
                    const lbl = i >= 0 ? bookNext.slotLabels[i] : "";
                    return lbl ? ` at ${lbl}` : "";
                  })()}
                </span>
              </>
            ) : (
              <span className="font-medium text-amber-800">Tap an open time above to continue.</span>
            )}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={bookNext.close}
              disabled={bookNext.saving}
              className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-base font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:flex-none"
            >
              Close
            </button>
            <button
              type="button"
              disabled={!bookNext.canSubmit}
              onClick={() => void bookNext.submit()}
              className="min-h-11 flex-1 rounded-xl bg-[#16a349] px-6 py-2.5 text-base font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50 sm:flex-none sm:min-w-[12rem]"
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
