"use client";

import { IconMoreVertical } from "@/components/icons";
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
import { ApiError, apiDelete, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type DiagnosisRow = {
  id: number;
  code: string;
  description: string;
  is_active: boolean;
};

const emptyForm = { code: "", description: "", is_active: true };

const fieldLabel = "mb-1.5 block text-sm font-medium text-[#0d1f14]";
const inputClass =
  "w-full rounded-lg border border-[#d1e8d8] bg-[#f4fbf7] px-3.5 py-2.5 text-sm text-[#0d1f14] placeholder:text-[#5a7a62] focus:border-[#16a349]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16a349]/20";

const GRID =
  "grid grid-cols-[minmax(0,0.7fr)_minmax(0,2fr)_minmax(0,0.7fr)_minmax(0,0.55fr)] gap-2";

export default function AdminDiagnosesPage() {
  const { runWithFeedback } = useAppFeedback();
  const [rows, setRows] = useState<DiagnosisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DiagnosisRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");
  const [deleteRow, setDeleteRow] = useState<DiagnosisRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (menuOpenId == null) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpenId(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpenId]);

  useEffect(() => {
    setMenuOpenId(null);
  }, [search, statusFilter]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = (await apiGetAuth<DiagnosisRow[]>("/diagnoses/")) as DiagnosisRow[];
      setRows(data.map((d) => ({ ...d, is_active: d.is_active !== false })));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load diagnoses.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter === "active") list = list.filter((d) => d.is_active);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (d) => d.code.toLowerCase().includes(q) || d.description.toLowerCase().includes(q),
    );
  }, [rows, search, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (d: DiagnosisRow) => {
    setEditing(d);
    setForm({ code: d.code, description: d.description, is_active: d.is_active });
    setFormOpen(true);
  };

  const save = async () => {
    const code = form.code.trim();
    const description = form.description.trim();
    if (!code || !description) return;
    setSaving(true);
    await runWithFeedback(
      async () => {
        const body = { code, description, is_active: form.is_active };
        if (editing) {
          await apiPatch(`/diagnoses/${editing.id}/`, body);
        } else {
          await apiPost("/diagnoses/", body);
        }
        setFormOpen(false);
        await load();
      },
      {
        loadingMessage: editing ? "Saving..." : "Adding diagnosis...",
        successMessage: editing ? "Diagnosis updated." : "Diagnosis added.",
        errorFallback: "Could not save diagnosis.",
      },
    );
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    await runWithFeedback(
      async () => {
        await apiDelete(`/diagnoses/${deleteRow.id}/`);
        setDeleteRow(null);
        await load();
      },
      {
        loadingMessage: "Deleting...",
        successMessage: "Diagnosis removed.",
        errorFallback: "Could not delete.",
      },
    );
    setDeleting(false);
  };

  const toggleActive = async (d: DiagnosisRow) => {
    setTogglingId(d.id);
    await runWithFeedback(
      async () => {
        await apiPatch(`/diagnoses/${d.id}/`, { is_active: !d.is_active });
        await load();
      },
      {
        loadingMessage: "Updating...",
        successMessage: d.is_active ? "Marked inactive." : "Marked active.",
        errorFallback: "Could not update status.",
      },
    );
    setTogglingId(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#5a7a62]">
          {filtered.length} {filtered.length === 1 ? "diagnosis" : "diagnoses"}
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#13823d]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add diagnosis
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
          {error}
        </p>
      ) : null}

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#d1e8d8] bg-white">
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-[#d1e8d8] px-5 py-3">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a7a62]"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code or description..."
              className="w-full rounded-lg border border-[#d1e8d8] bg-[#f4fbf7] py-2.5 pl-10 pr-3 text-sm text-[#0d1f14] placeholder:text-[#5a7a62] focus:border-[#16a349]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
              aria-label="Search diagnoses"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "active" | "all")}
            className="min-w-[9rem] rounded-lg border border-[#d1e8d8] bg-white px-3 py-2.5 text-sm font-medium text-[#0d1f14] focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
            aria-label="Status filter"
          >
            <option value="active">Active only</option>
            <option value="all">All statuses</option>
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="p-8">
              <Loader variant="page" label="Loading" />
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col overflow-x-auto">
              <div className="min-w-[640px] shrink-0 border-b border-[#d1e8d8] bg-[#f8fdf9]">
                <div className={cn(GRID, "px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-[#5a7a62]")}>
                  <span>Code</span>
                  <span>Description</span>
                  <span>Status</span>
                  <span className="text-right">Actions</span>
                </div>
              </div>

              <div className="min-h-0 min-w-[640px] flex-1 overflow-auto">
                {filtered.length === 0 ? (
                  <p className="px-5 py-12 text-center text-sm text-[#5a7a62]">
                    {search.trim() || statusFilter === "all"
                      ? "No diagnoses match."
                      : "No active diagnoses yet. Add one to get started."}
                  </p>
                ) : (
                  <ul className="divide-y divide-[#d1e8d8]">
                    {filtered.map((d) => (
                      <li key={d.id} className={cn(GRID, "items-center px-5 py-3.5 hover:bg-[#f8fdf9]")}>
                        <div className="min-w-0 font-mono font-semibold text-[#0d1f14]">{d.code}</div>
                        <div className="min-w-0 text-[#0d1f14]">{d.description}</div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={d.is_active}
                            aria-label={d.is_active ? "Active" : "Inactive"}
                            disabled={togglingId === d.id}
                            onClick={() => void toggleActive(d)}
                            className={cn(
                              "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
                              d.is_active ? "bg-[#16a349]" : "bg-[#d1e8d8]",
                            )}
                          >
                            <span
                              className={cn(
                                "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                                d.is_active ? "left-[1.375rem]" : "left-0.5",
                              )}
                            />
                          </button>
                          <span className="text-xs text-[#5a7a62]">
                            {d.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <div className="flex justify-end">
                          <div
                            className="relative inline-flex"
                            ref={menuOpenId === d.id ? menuRef : undefined}
                          >
                            <button
                              type="button"
                              aria-haspopup="menu"
                              aria-expanded={menuOpenId === d.id}
                              aria-label={`Actions for ${d.code}`}
                              onClick={() =>
                                setMenuOpenId((id) => (id === d.id ? null : d.id))
                              }
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#d1e8d8] bg-white text-[#5a7a62] hover:bg-[#f8fdf9] hover:text-[#0d1f14]"
                            >
                              <IconMoreVertical className="h-4 w-4" />
                            </button>
                            {menuOpenId === d.id ? (
                              <div
                                role="menu"
                                className="absolute right-0 top-full z-20 mt-1.5 w-44 overflow-hidden rounded-xl border border-[#d1e8d8] bg-white py-1 shadow-lg"
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setMenuOpenId(null);
                                    openEdit(d);
                                  }}
                                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium text-[#0d1f14] hover:bg-[#f8fdf9]"
                                >
                                  <Pencil className="h-4 w-4 text-[#5a7a62]" aria-hidden />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setMenuOpenId(null);
                                    setDeleteRow(d);
                                  }}
                                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium text-[#991b1b] hover:bg-[#fef2f2]"
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden />
                                  Delete
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#0d1f14]">
              {editing ? "Edit diagnosis" : "Add diagnosis"}
            </DialogTitle>
            <DialogDescription className="text-[#5a7a62]">
              Doctors pick active diagnoses during visits. Code and description print on the bill.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <label>
              <span className={fieldLabel}>Code</span>
              <input
                className={cn(inputClass, "font-mono")}
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="e.g. M54.5"
              />
            </label>
            <label>
              <span className={fieldLabel}>Description</span>
              <input
                className={inputClass}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Low back pain"
              />
            </label>
            <div className="flex items-center justify-between rounded-lg border border-[#d1e8d8] bg-[#f8fdf9] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-[#0d1f14]">Active</p>
                <p className="text-xs text-[#5a7a62]">Visible to doctors</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.is_active}
                onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors",
                  form.is_active ? "bg-[#16a349]" : "bg-[#d1e8d8]",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                    form.is_active ? "left-[1.375rem]" : "left-0.5",
                  )}
                />
              </button>
            </div>
          </div>
          <DialogFooter className="border-[#d1e8d8] bg-[#f8fdf9]">
            <Button
              type="button"
              variant="outline"
              onClick={() => setFormOpen(false)}
              className="border-[#d1e8d8]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || !form.code.trim() || !form.description.trim()}
              onClick={() => void save()}
              className="bg-[#16a349] text-white hover:bg-[#13823d]"
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteRow != null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteRow(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {deleteRow ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-[#0d1f14]">Delete {deleteRow.code}?</DialogTitle>
                <DialogDescription className="text-[#5a7a62]">
                  This cannot be undone. Old visits keep their saved diagnosis text.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="border-[#d1e8d8] bg-[#f8fdf9]">
                <Button
                  type="button"
                  variant="outline"
                  disabled={deleting}
                  onClick={() => setDeleteRow(null)}
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
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
