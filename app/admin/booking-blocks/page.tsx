"use client";

import { useAppFeedback } from "@/components/app-feedback";
import { Loader } from "@/components/loader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, apiDelete, apiGetAuth, apiPost } from "@/lib/api";
import { formatMonthDayYear } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";
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

const fieldLabel = "mb-1.5 block text-sm font-medium text-[#0d1f14]";
const inputClass =
  "w-full rounded-lg border border-[#d1e8d8] bg-[#f4fbf7] px-3.5 py-2.5 text-sm text-[#0d1f14] placeholder:text-[#5a7a62] focus:border-[#16a349]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16a349]/20";

const GRID = "grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-3";

function formatBlockLabel(b: BlockRow): string {
  if (b.all_day) return "All day";
  const s = b.start_time?.slice(0, 5) ?? "";
  const e = b.end_time?.slice(0, 5) ?? "";
  return `${s} - ${e}`;
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
  const [formOpen, setFormOpen] = useState(false);

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
  const [weekdaysOnly, setWeekdaysOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    apiGetAuth<Provider[]>("/providers/")
      .then((list) =>
        setProviders(
          (list as { id: number; provider_name?: string }[]).map((p) => ({
            id: p.id,
            provider_name: (p.provider_name || `Provider ${p.id}`).trim(),
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

  const openAddForm = () => {
    if (!providerId) {
      toast.error("Choose a provider first.");
      return;
    }
    setFormDateFrom(today);
    setFormDateTo(today);
    setAllDay(true);
    setStartTime("09:00");
    setEndTime("12:00");
    setWeekdaysOnly(false);
    setFormOpen(true);
  };

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
      toast.error("Until time must be after From time.");
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
        setFormOpen(false);
        await loadBlocks();
        return result;
      },
      {
        loadingMessage: "Saving blocks...",
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

  const confirmDelete = async () => {
    if (deleteId == null) return;
    setDeleting(true);
    await runWithFeedback(
      async () => {
        await apiDelete(`/provider-unavailability/${deleteId}/`);
        setDeleteId(null);
        await loadBlocks();
      },
      {
        loadingMessage: "Removing...",
        successMessage: "Block removed.",
        errorFallback: "Could not remove block.",
      },
    );
    setDeleting(false);
  };

  const rangeDayCount = inclusiveDayCount(formDateFrom, formDateTo);
  const selectedProvider = providers.find((p) => String(p.id) === providerId);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#5a7a62]">
          {providerId
            ? `${blocks.length} ${blocks.length === 1 ? "block" : "blocks"}`
            : "Choose a provider"}
        </p>
        <button
          type="button"
          onClick={openAddForm}
          disabled={!providerId}
          className="inline-flex items-center gap-2 rounded-lg bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#13823d] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add block
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="alert">
          {error}
        </p>
      ) : null}

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#d1e8d8] bg-white">
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-[#d1e8d8] px-5 py-3">
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="min-w-[14rem] flex-1 rounded-lg border border-[#d1e8d8] bg-white px-3 py-2.5 text-sm font-medium text-[#0d1f14] focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/20 sm:max-w-xs"
            aria-label="Provider"
          >
            <option value="">Select a provider...</option>
            {providers.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.provider_name}
              </option>
            ))}
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {!providerId ? (
            <p className="px-5 py-12 text-center text-sm text-[#5a7a62]">
              Select a provider to view or add online booking blocks.
            </p>
          ) : loadingList ? (
            <div className="p-8">
              <Loader variant="page" label="Loading" />
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-[#d1e8d8] bg-[#f8fdf9]">
                <div
                  className={cn(
                    GRID,
                    "px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-[#5a7a62]",
                  )}
                >
                  <span>Date</span>
                  <span>Hours</span>
                  <span className="text-right">Actions</span>
                </div>
              </div>

              {blocks.length === 0 ? (
                <p className="px-5 py-12 text-center text-sm text-[#5a7a62]">
                  No blocks for {selectedProvider?.provider_name ?? "this provider"}. Online booking follows normal open
                  slots.
                </p>
              ) : (
                <div className="min-h-0 flex-1 overflow-auto">
                  <ul className="divide-y divide-[#d1e8d8]">
                    {blocks.map((b) => (
                      <li key={b.id} className={cn(GRID, "items-center px-5 py-3.5 hover:bg-[#f8fdf9]")}>
                        <div className="min-w-0">
                          <p className="truncate font-semibold tabular-nums text-[#0d1f14]">
                            {formatMonthDayYear(b.block_date)}
                          </p>
                          <p className="mt-0.5 font-mono text-xs text-[#5a7a62]">{b.block_date}</p>
                        </div>
                        <div className="min-w-0">
                          <span
                            className={cn(
                              "inline-flex max-w-full truncate rounded-full px-2.5 py-1 text-xs font-medium",
                              b.all_day
                                ? "bg-[#fef3c7] text-[#92400e]"
                                : "bg-[#ecfdf5] text-[#0d5c2e]",
                            )}
                          >
                            {formatBlockLabel(b)}
                          </span>
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setDeleteId(b.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#d1e8d8] bg-white px-3 py-1.5 text-xs font-semibold text-[#991b1b] hover:bg-[#fef2f2]"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <Dialog open={formOpen} onOpenChange={(open) => !adding && setFormOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#0d1f14]">Add booking block</DialogTitle>
            <DialogDescription className="text-[#5a7a62]">
              Hide online booking times for {selectedProvider?.provider_name ?? "this provider"}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className={fieldLabel}>From date</span>
                <input
                  type="date"
                  value={formDateFrom}
                  onChange={(e) => setFormDateFrom(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label>
                <span className={fieldLabel}>To date</span>
                <input
                  type="date"
                  value={formDateTo}
                  min={formDateFrom}
                  onChange={(e) => setFormDateTo(e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
            {formDateFrom <= formDateTo ? (
              <p className="text-xs text-[#5a7a62]">
                {rangeDayCount} calendar day{rangeDayCount === 1 ? "" : "s"}
                {formDateFrom !== formDateTo ? " (same hours each day)" : ""}
              </p>
            ) : null}

            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#d1e8d8] bg-[#f8fdf9] px-4 py-3">
              <input
                type="checkbox"
                checked={weekdaysOnly}
                onChange={(e) => setWeekdaysOnly(e.target.checked)}
                className="h-4 w-4 rounded border-[#d1e8d8] text-[#16a349] focus:ring-[#16a349]"
              />
              <span className="text-sm font-medium text-[#0d1f14]">Weekdays only (Mon-Fri)</span>
            </label>

            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#d1e8d8] bg-[#f8fdf9] px-4 py-3">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-4 w-4 rounded border-[#d1e8d8] text-[#16a349] focus:ring-[#16a349]"
              />
              <span className="text-sm font-medium text-[#0d1f14]">Block entire day</span>
            </label>

            {!allDay ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className={fieldLabel}>From (time)</span>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label>
                  <span className={fieldLabel}>Until (time)</span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
            ) : null}
          </div>
          <DialogFooter className="border-[#d1e8d8] bg-[#f8fdf9]">
            <Button
              type="button"
              variant="outline"
              disabled={adding}
              onClick={() => setFormOpen(false)}
              className="border-[#d1e8d8]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={adding}
              onClick={() => void addBlock()}
              className="bg-[#16a349] text-white hover:bg-[#13823d]"
            >
              {adding ? "Saving..." : formDateFrom === formDateTo ? "Add block" : "Add blocks"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteId != null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#0d1f14]">Remove this block?</DialogTitle>
            <DialogDescription className="text-[#5a7a62]">
              Patients will be able to book those times online again (if not already taken).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-[#d1e8d8] bg-[#f8fdf9]">
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteId(null)}
              className="border-[#d1e8d8]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={deleting}
              onClick={() => void confirmDelete()}
              className="bg-[#991b1b] text-white hover:bg-[#7f1d1d]"
            >
              {deleting ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
