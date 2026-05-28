"use client";

import { ChartNoteReader } from "@/components/chart-note-document";
import { apiGetAuth } from "@/lib/api";
import { formatWeekdayMonthDayYear } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export type PriorChartVisitRow = {
  appointment_id: number;
  appointment_date: string;
  start_time: string;
  provider_name: string;
  service_name: string;
  status: string;
  handoff_notes: string;
  clinical_notes: string;
};

/** Notes from earlier visits — shown before documenting the current appointment. */
export function VisitPriorChartNotes({
  appointmentId,
  className,
}: {
  appointmentId: number;
  className?: string;
}) {
  const [rows, setRows] = useState<PriorChartVisitRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void apiGetAuth<{ prior_visits?: PriorChartVisitRow[] }>(
      `/appointments/${appointmentId}/prior_chart_notes/`,
    )
      .then((data) => {
        if (!cancelled) setRows(Array.isArray(data.prior_visits) ? data.prior_visits : []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appointmentId]);

  if (loading) {
    return (
      <p className={cn("text-xs text-slate-500", className)}>Loading notes from prior visits…</p>
    );
  }
  if (!rows?.length) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-violet-200/90 bg-violet-50/50 px-3 py-3",
        className,
      )}
    >
      <p className="text-[11px] font-bold uppercase tracking-wide text-violet-900">
        Notes from prior visits
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-violet-950/85">
        Reference what was saved before — <span className="font-medium">reminders/handoff</span> are separate from{" "}
        <span className="font-medium">consultation (SOAP)</span> notes.
      </p>
      <ul className="mt-3 max-h-[min(42vh,320px)] space-y-3 overflow-y-auto pr-1">
        {rows.map((row) => (
          <li
            key={row.appointment_id}
            className="rounded-lg border border-violet-200/80 bg-white/90 px-3 py-2.5 text-sm shadow-sm"
          >
            <p className="font-semibold text-slate-900">
              {formatWeekdayMonthDayYear(row.appointment_date)} · {row.start_time}
            </p>
            <p className="text-xs text-slate-600">
              {row.provider_name}
              {row.service_name ? ` · ${row.service_name}` : ""}
            </p>
            {row.handoff_notes ? (
              <div className="mt-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Reminders & handoff
                </p>
                <div className="mt-1">
                  <ChartNoteReader text={row.handoff_notes} />
                </div>
              </div>
            ) : null}
            {row.clinical_notes ? (
              <div className={row.handoff_notes ? "mt-2" : "mt-2"}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Consultation notes (SOAP)
                </p>
                <div className="mt-1">
                  <ChartNoteReader text={row.clinical_notes} />
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
