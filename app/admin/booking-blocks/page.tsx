"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { useAppFeedback } from "@/components/app-feedback";
import { HelpTip } from "@/components/help-tip";
import { Loader } from "@/components/loader";
import { ApiError, apiDelete, apiGetAuth, apiPost } from "@/lib/api";
import { useCallback, useEffect, useMemo, useState } from "react";

type Provider = { id: number; provider_name: string };

type BlockRow = {
  id: number;
  provider: number;
  provider_name: string;
  block_date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
};

function formatBlockLabel(b: BlockRow): string {
  if (b.all_day) return "All day (no online booking)";
  const s = b.start_time?.slice(0, 5) ?? "";
  const e = b.end_time?.slice(0, 5) ?? "";
  return `${s} – ${e}`;
}

/** Inclusive day count from YYYY-MM-DD to YYYY-MM-DD (same day = 1). */
function inclusiveDayCount(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T12:00:00`);
  const b = new Date(`${toIso}T12:00:00`);
  if (b < a) return 0;
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

export default function AdminBookingBlocksPage() {
  const { runWithFeedback, toast } = useAppFeedback();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerId, setProviderId] = useState("");
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState("");

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const dateTo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 365);
    return d.toISOString().slice(0, 10);
  }, []);

  const [formDateFrom, setFormDateFrom] = useState(today);
  const [formDateTo, setFormDateTo] = useState(today);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  /** When adding a range, skip Saturday & Sunday (useful for “every weekday this month”). */
  const [weekdaysOnly, setWeekdaysOnly] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    apiGetAuth<Provider[]>("/providers/")
      .then((list) =>
        setProviders(
          (list as { id: number; provider_name?: string }[]).map((p) => ({
            id: p.id,
            provider_name: p.provider_name || `Provider ${p.id}`,
          })),
        ),
      )
      .catch(() => setProviders([]));
  }, []);

  const loadBlocks = useCallback(async () => {
    if (!providerId) {
      setBlocks([]);
      return;
    }
    setLoadingList(true);
    setError("");
    try {
      const list = await apiGetAuth<BlockRow[]>(
        `/provider-unavailability/?provider_id=${providerId}&date_from=${today}&date_to=${dateTo}`,
      );
      setBlocks(Array.isArray(list) ? list : []);
    } catch (e) {
      setBlocks([]);
      setError(e instanceof ApiError ? e.message : "Could not load blocks.");
    } finally {
      setLoadingList(false);
    }
  }, [providerId, today, dateTo]);

  useEffect(() => {
    void loadBlocks();
  }, [loadBlocks]);

  const addBlock = async () => {
    if (!providerId) {
      toast.error("Choose a provider first.");
      return;
    }
    if (formDateFrom > formDateTo) {
      toast.error("End date must be on or after the start date.");
      return;
    }
    if (!allDay && startTime >= endTime) {
      toast.error("“Until” time must be after “From” time.");
      return;
    }
    setAdding(true);
    await runWithFeedback(
      async () => {
        const pad = (t: string) => (t.length === 5 ? `${t}:00` : t);
        const body: Record<string, unknown> = {
          provider: Number(providerId),
          date_from: formDateFrom,
          date_to: formDateTo,
          all_day: allDay,
          weekdays_only: weekdaysOnly,
        };
        if (!allDay) {
          body.start_time = pad(startTime);
          body.end_time = pad(endTime);
        }
        const result = await apiPost<{ created?: number }>("/provider-unavailability/bulk/", body);
        await loadBlocks();
        return result;
      },
      {
        loadingMessage: "Saving blocks…",
        successMessage: (result) => {
          const n = result && typeof result.created === "number" ? result.created : 0;
          if (n === 0) {
            return "No days matched (e.g. weekdays-only over a weekend-only range). Nothing was added.";
          }
          if (formDateFrom === formDateTo) {
            return n === 1 ? "Online booking updated for that date." : `Added ${n} block(s) for that date.`;
          }
          return `Added ${n} block(s) for the date range.`;
        },
        errorFallback: "Could not add blocks (owner or staff only).",
      },
    );
    setAdding(false);
  };

  const removeBlock = async (id: number) => {
    if (!window.confirm("Remove this block? Patients will be able to book those times again online (if not taken).")) {
      return;
    }
    await runWithFeedback(
      async () => {
        await apiDelete(`/provider-unavailability/${id}/`);
        await loadBlocks();
      },
      {
        loadingMessage: "Removing…",
        successMessage: "Block removed.",
        errorFallback: "Could not remove block.",
      },
    );
  };

  const rangeDayCount = inclusiveDayCount(formDateFrom, formDateTo);

  return (
    <div className="space-y-6">
      <AdminPageIntro
        title="Online booking blocks"
        description="By default every provider can be booked on the public site whenever a slot is free. Add blocks here to mark specific dates or hours as unavailable for online booking—patients will only see open times."
        pageHelp={
          <>
            <strong>Date range:</strong> set <em>From</em> and <em>To</em> to the same day for a single block, or spread
            across weeks to repeat the same window every day (e.g. lunch 9:00–9:30 for a month). Use{" "}
            <strong>Weekdays only</strong> to skip Saturdays and Sundays.
            <br />
            <br />
            <strong>Whole day off:</strong> check “Block entire day” so no standard times show for that doctor on each
            date in the range.
            <br />
            <br />
            <strong>Part of the day:</strong> uncheck and set start/end times (desk appointments can still be added from
            the schedule if your workflow allows).
            <br />
            <br />
            Only <strong>owner</strong> and <strong>staff</strong> accounts can change this list.
          </>
        }
      />

      <div className="admin-panel space-y-5">
        <AdminSectionLabel help="Pick the doctor you are blocking for the public booking website.">
          Provider
        </AdminSectionLabel>
        <select
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
          className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
        >
          <option value="">Select a provider…</option>
          {providers.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.provider_name}
            </option>
          ))}
        </select>

        {error && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{error}</p>
        )}

        {providerId ? (
          <>
            <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4">
              <p className="text-sm font-semibold text-slate-800">Add a block (single day or date range)</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    From date
                  </span>
                  <input
                    type="date"
                    value={formDateFrom}
                    onChange={(e) => setFormDateFrom(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    To date
                  </span>
                  <input
                    type="date"
                    value={formDateTo}
                    min={formDateFrom}
                    onChange={(e) => setFormDateTo(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                </label>
                <p className="text-xs text-slate-500 sm:col-span-2">
                  Same start and end = one day. Different dates = one identical block per calendar day (max 400 days).
                  {formDateFrom <= formDateTo ? (
                    <span className="ml-1 font-medium text-slate-700">
                      Selected span: {rangeDayCount} calendar day{rangeDayCount === 1 ? "" : "s"}.
                    </span>
                  ) : null}
                </p>
                <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={weekdaysOnly}
                    onChange={(e) => setWeekdaysOnly(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#16a349]"
                  />
                  <span className="text-sm font-medium text-slate-800">Weekdays only (Mon–Fri)</span>
                  <HelpTip label="Weekdays only">
                    Skips Saturday and Sunday in the range. Handy for “every weekday for a month” without weekend rows.
                  </HelpTip>
                </label>
                <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(e) => setAllDay(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#16a349]"
                  />
                  <span className="text-sm font-medium text-slate-800">Block entire day for online booking</span>
                  <HelpTip label="All day">
                    Hides every standard booking time for this provider on each calendar date in the range.
                  </HelpTip>
                </label>
                {!allDay && (
                  <>
                    <label>
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        From (time)
                      </span>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label>
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Until (time)
                      </span>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  </>
                )}
              </div>
              <button
                type="button"
                disabled={adding}
                onClick={() => void addBlock()}
                className="mt-4 rounded-xl bg-[#16a349] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
              >
                {adding ? "Saving…" : formDateFrom === formDateTo ? "Add block" : "Add blocks for date range"}
              </button>
            </div>

            <AdminSectionLabel help="Upcoming blocks in the next year for the selected provider.">
              Active blocks
            </AdminSectionLabel>
            {loadingList ? (
              <Loader variant="page" label="Loading blocks" />
            ) : blocks.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                No blocks — this provider follows normal online availability (open slots only when nothing else is booked).
              </p>
            ) : (
              <ul className="space-y-2">
                {blocks.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm"
                  >
                    <div>
                      <p className="font-semibold tabular-nums text-slate-900">{b.block_date}</p>
                      <p className="text-sm text-slate-600">{formatBlockLabel(b)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeBlock(b.id)}
                      className="text-sm font-semibold text-rose-600 hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">Select a provider to view or add booking blocks.</p>
        )}
      </div>
    </div>
  );
}
