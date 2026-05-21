"use client";

import { visitStatusBadgeClass, visitStatusLabel } from "@/lib/visit-status-utils";

/** Shared header for appointment visit panels (admin schedule sheet, etc.). */
export function VisitSummaryHeader({
  patientName,
  serviceName,
  dateTimeLabel,
  durationLabel,
  providerName,
  providerColor,
  status,
  estimatedPrice,
  appointmentId,
}: {
  patientName: string;
  serviceName?: string;
  dateTimeLabel: string;
  durationLabel?: string;
  providerName: string;
  providerColor: string;
  status: string;
  estimatedPrice?: string;
  appointmentId: number;
}) {
  return (
    <div className="shrink-0 border-b border-slate-100 px-5 pb-4 pt-14">
      <h2 className="text-xl font-bold tracking-tight text-slate-900">{patientName}</h2>
      <p className="mt-1 text-sm font-medium text-slate-600">{serviceName || "—"}</p>
      <p className="mt-3 text-sm text-slate-800">{dateTimeLabel}</p>
      {durationLabel ? <p className="mt-1 text-sm text-slate-600">Duration · {durationLabel}</p> : null}
      <div className="mt-4 flex items-center gap-2">
        <span
          className="h-3 w-3 shrink-0 rounded-full shadow-sm ring-2 ring-white"
          style={{ backgroundColor: providerColor }}
          aria-hidden
        />
        <span className="text-sm font-semibold text-slate-800">{providerName}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${visitStatusBadgeClass(status)}`}
        >
          {visitStatusLabel(status)}
        </span>
      </div>
      {estimatedPrice != null ? (
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-100 pt-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Estimated price</span>
          <span className="text-sm font-semibold tabular-nums text-slate-900">{estimatedPrice}</span>
        </div>
      ) : null}
      <p className="mt-3 font-mono text-[11px] text-slate-500">Appointment #{String(appointmentId).padStart(5, "0")}</p>
    </div>
  );
}
