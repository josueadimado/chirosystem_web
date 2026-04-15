"use client";

import { DoctorPageIntro, DoctorSectionLabel } from "@/components/doctor-shell";
import { HelpTip } from "@/components/help-tip";
import { PatientDetailModal } from "@/components/patient-detail-modal";
import { appointmentStatusPillClass } from "@/components/status-chip";
import { IconFilter, IconMoreVertical, IconSearch } from "@/components/icons";
import { ApiError, apiGetAuth } from "@/lib/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PatientRow = {
  id: number;
  name: string;
  phone: string;
  email: string;
  /** ISO date (YYYY-MM-DD) — last completed visit with you, else last appointment date */
  last_visit: string | null;
  /** e.g. "2025-03-22 9:00 AM" */
  next_appt: string | null;
  next_appointment_status?: string | null;
  has_upcoming?: boolean;
  /** Unpaid invoice (issued or overdue) for a visit with this doctor */
  has_open_invoice?: boolean;
  /** Completed visit with this doctor in the last 30 days */
  seen_last_30_days?: boolean;
};

type ShowFilter = "all" | "upcoming" | "no_upcoming" | "open_invoice" | "seen_30d";
type SortKey = "recent" | "name_asc" | "name_desc" | "next_appt";

const APPT_STATUS_LABEL: Record<string, string> = {
  booked: "Booked",
  checked_in: "Checked in",
  in_consultation: "In visit",
  awaiting_payment: "Awaiting payment",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

function formatDisplayDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function parseNextApptSortKey(nextAppt: string | null): number {
  if (!nextAppt) return Number.POSITIVE_INFINITY;
  const m = nextAppt.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return Number.POSITIVE_INFINITY;
  const t = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`).getTime();
  const timePart = nextAppt.slice(11).trim();
  let extra = 0;
  const ampm = timePart.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const min = parseInt(ampm[2], 10);
    const pm = ampm[3].toUpperCase() === "PM";
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
    extra = h * 3600000 + min * 60000;
  }
  return t + extra;
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function matchesSearch(p: PatientRow, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const name = (p.name || "").toLowerCase();
  const email = (p.email || "").toLowerCase();
  const phone = p.phone || "";
  if (name.includes(t) || email.includes(t)) return true;
  const qd = digitsOnly(q);
  if (qd.length >= 3 && digitsOnly(phone).includes(qd)) return true;
  return false;
}

function statusBadge(p: PatientRow): { label: string; className: string } {
  if (p.has_upcoming && p.next_appointment_status) {
    const raw = p.next_appointment_status;
    const label = APPT_STATUS_LABEL[raw] || raw.replace(/_/g, " ");
    return {
      label,
      className: appointmentStatusPillClass(raw),
    };
  }
  if (p.has_upcoming) {
    return { label: "Scheduled", className: appointmentStatusPillClass("booked") };
  }
  if (p.last_visit) {
    return { label: "No upcoming", className: "bg-slate-100 text-slate-600" };
  }
  return { label: "—", className: "bg-slate-50 text-slate-400" };
}

export default function DoctorPatientsPage() {
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [showFilter, setShowFilter] = useState<ShowFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [detailPatientId, setDetailPatientId] = useState<number | null>(null);
  const filterWrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    apiGetAuth<PatientRow[]>("/doctor/patients/")
      .then((rows) => setPatients(Array.isArray(rows) ? rows : []))
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : "Failed to load patients.");
        setPatients([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!filterOpen) return;
    const close = (e: MouseEvent) => {
      if (!filterWrapRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [filterOpen]);

  const filtered = useMemo(() => {
    return patients.filter((p) => matchesSearch(p, search)).filter((p) => {
      if (showFilter === "upcoming") return p.has_upcoming === true;
      if (showFilter === "no_upcoming") return !p.has_upcoming;
      if (showFilter === "open_invoice") return p.has_open_invoice === true;
      if (showFilter === "seen_30d") return p.seen_last_30_days === true;
      return true;
    });
  }, [patients, search, showFilter]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    if (sort === "name_asc") {
      out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    } else if (sort === "name_desc") {
      out.sort((a, b) => b.name.localeCompare(a.name, undefined, { sensitivity: "base" }));
    } else if (sort === "next_appt") {
      out.sort((a, b) => parseNextApptSortKey(a.next_appt) - parseNextApptSortKey(b.next_appt));
    } else {
      out.sort((a, b) => {
        const la = a.last_visit || "";
        const lb = b.last_visit || "";
        if (lb !== la) return lb.localeCompare(la);
        return parseNextApptSortKey(a.next_appt) - parseNextApptSortKey(b.next_appt);
      });
    }
    return out;
  }, [filtered, sort]);

  const filterLabel =
    showFilter === "upcoming"
      ? "Upcoming only"
      : showFilter === "no_upcoming"
        ? "No upcoming"
        : showFilter === "open_invoice"
          ? "Open invoice"
          : showFilter === "seen_30d"
            ? "Seen in 30 days"
            : "All patients";

  const initial = (name: string) => {
    const c = name.trim().charAt(0);
    return c ? c.toUpperCase() : "?";
  };

  return (
    <div className="space-y-6">
      <DoctorPageIntro
        eyebrow="Your practice"
        title="Patient directory"
        description="Everyone you share care with in this system. Narrow the list with filters, search by contact info, and open a row for the full chart."
        pageHelp={
          <>
            Unlike the admin patient list, this view is <strong>scoped to you</strong>: upcoming visits, balances, and “last seen”
            reflect your appointments and invoices. Click any row for details.
          </>
        }
      />
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>}

      <div className="doctor-panel">
        <DoctorSectionLabel help="Search runs on the loaded list. Filters combine with search—e.g. upcoming + name search.">
          Find & filter
        </DoctorSectionLabel>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2 lg:min-w-[240px]">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <IconSearch className="h-5 w-5" />
              </span>
              <input
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm shadow-sm focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15"
                placeholder="Search by name, email, or phone"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search patients"
              />
            </div>
            <HelpTip label="Search" align="center" tone="emerald">
              Matches name and email as you type. For phone, type digits—partial numbers work.
            </HelpTip>
          </div>

          <div className="flex flex-wrap items-center gap-2" ref={filterWrapRef}>
            <div className="relative flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFilterOpen((o) => !o)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium shadow-sm transition-colors ${
                  showFilter === "all"
                    ? "border-slate-200 text-slate-700 hover:bg-slate-50"
                    : "border-[#16a349]/40 bg-emerald-50 text-emerald-900"
                }`}
                aria-expanded={filterOpen}
                aria-haspopup="true"
              >
                <IconFilter className="h-5 w-5 shrink-0" />
                <span className="whitespace-nowrap">{filterLabel}</span>
              </button>
              <HelpTip label="Patient filters" tone="emerald">
                Limit rows to people with an upcoming visit, no future visit, an unpaid invoice tied to you, or a completed visit in the
                last 30 days.
              </HelpTip>
              {filterOpen && (
                <div
                  className="absolute left-0 z-20 mt-1 min-w-[18rem] rounded-xl border border-slate-200/90 bg-white p-2 shadow-xl shadow-slate-200/50"
                  role="menu"
                >
                  <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Show</p>
                  {(
                    [
                      ["all", "All patients"],
                      ["upcoming", "Has upcoming appointment"],
                      ["no_upcoming", "No upcoming appointment"],
                      ["open_invoice", "Has open invoice (unpaid)"],
                      ["seen_30d", "Seen in last 30 days"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowFilter(key);
                        setFilterOpen(false);
                      }}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                        showFilter === key ? "bg-emerald-50 font-medium text-emerald-900" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="patient-sort" className="flex items-center gap-1.5 text-sm text-slate-500 whitespace-nowrap">
                Sort
                <HelpTip label="Sort order" tone="emerald">
                  Recent activity uses last visit date. Next appointment puts soonest future visits first. Name sorts alphabetically.
                </HelpTip>
              </label>
              <select
                id="patient-sort"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/15"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
              >
                <option value="recent">Recent activity</option>
                <option value="next_appt">Next appointment (soonest)</option>
                <option value="name_asc">Name A–Z</option>
                <option value="name_desc">Name Z–A</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Refresh
              </button>
              <HelpTip label="Refresh" align="center" tone="emerald">
                Reloads the directory from the server so you see new patients or updated visits without leaving the page.
              </HelpTip>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-slate-500">Loading…</p>
        ) : sorted.length === 0 ? (
          <p className="text-slate-500">
            {patients.length === 0
              ? "No patients yet. When patients book with you or you have appointments, they appear here."
              : "No patients match your search or filters."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white">
            <DoctorSectionLabel help="Click a row to open the patient. The ⋮ button does the same without relying on row click.">
              Results
            </DoctorSectionLabel>
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-slate-200/90 bg-slate-50/90 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-3 font-semibold">Patient</th>
                  <th className="px-3 py-3 font-semibold">Contact</th>
                  <th className="px-3 py-3 font-semibold whitespace-nowrap">Last visit</th>
                  <th className="px-3 py-3 font-semibold whitespace-nowrap">Next appointment</th>
                  <th className="px-3 py-3 font-semibold">
                    <span className="inline-flex items-center gap-1">
                      Status
                      <HelpTip label="Status column" tone="emerald">
                        Shows their next-visit state when they have one booked, or “No upcoming” after a past visit. Unpaid invoice
                        appears as an extra tag when you have an open balance for them.
                      </HelpTip>
                    </span>
                  </th>
                  <th className="w-10 px-1 py-3" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const badge = statusBadge(p);
                  return (
                    <tr
                      key={p.id}
                      className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50/80"
                      onClick={() => setDetailPatientId(p.id)}
                    >
                      <td className="px-3 py-3 align-top">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#16a349]/15 text-sm font-semibold text-[#16a349]">
                            {initial(p.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900">{p.name}</p>
                            <p className="text-xs text-slate-500">ID #{p.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="font-medium text-slate-800">{p.phone || "—"}</div>
                        {p.email ? <div className="mt-0.5 break-all text-slate-500">{p.email}</div> : null}
                      </td>
                      <td className="px-3 py-3 align-top whitespace-nowrap text-slate-700">
                        {formatDisplayDate(p.last_visit)}
                      </td>
                      <td className="px-3 py-3 align-top text-slate-700">
                        {p.next_appt ? (
                          <>
                            <div className="whitespace-nowrap">{p.next_appt.split(" ").slice(0, 1).join(" ")}</div>
                            <div className="text-slate-500">{p.next_appt.split(" ").slice(1).join(" ")}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-col gap-1.5">
                          <span
                            className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                          {p.has_open_invoice ? (
                            <span className="inline-flex w-fit rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                              Unpaid invoice
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-1 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setDetailPatientId(p.id)}
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          aria-label="Open patient"
                        >
                          <IconMoreVertical className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && sorted.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            Showing {sorted.length} of {patients.length} patient{patients.length === 1 ? "" : "s"}
            {(search.trim() || showFilter !== "all") ? " (filtered)" : ""}
          </p>
        )}
      </div>

      {detailPatientId && (
        <PatientDetailModal patientId={detailPatientId} onClose={() => setDetailPatientId(null)} />
      )}
    </div>
  );
}
