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

type InsuranceCompanyRow = {
  id: number;
  name: string;
  claim_email: string;
  phone: string;
  notes: string;
  default_plan_type: string;
  is_active: boolean;
};

const PLAN_OPTIONS = [
  { value: "group", label: "Group health plan" },
  { value: "medicare", label: "Medicare" },
  { value: "medicaid", label: "Medicaid" },
  { value: "tricare", label: "TRICARE" },
  { value: "champva", label: "CHAMPVA" },
  { value: "feca", label: "FECA" },
  { value: "other", label: "Other" },
];

const emptyForm = {
  name: "",
  claim_email: "",
  phone: "",
  notes: "",
  default_plan_type: "group",
  is_active: true,
};

const fieldLabel = "mb-1.5 block text-sm font-medium text-[#0d1f14]";
const inputClass =
  "w-full rounded-lg border border-[#d1e8d8] bg-[#f4fbf7] px-3.5 py-2.5 text-sm text-[#0d1f14] placeholder:text-[#5a7a62] focus:border-[#16a349]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16a349]/20";

export default function AdminInsuranceCompaniesPage() {
  const { runWithFeedback } = useAppFeedback();
  const [rows, setRows] = useState<InsuranceCompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InsuranceCompanyRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");
  const [deleteRow, setDeleteRow] = useState<InsuranceCompanyRow | null>(null);
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
      const data = await apiGetAuth<InsuranceCompanyRow[]>("/insurance-companies/");
      setRows((data || []).map((d) => ({ ...d, is_active: d.is_active !== false })));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load insurance companies.");
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
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.claim_email || "").toLowerCase().includes(q) ||
        (d.phone || "").toLowerCase().includes(q),
    );
  }, [rows, search, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (row: InsuranceCompanyRow) => {
    setEditing(row);
    setForm({
      name: row.name,
      claim_email: row.claim_email || "",
      phone: row.phone || "",
      notes: row.notes || "",
      default_plan_type: row.default_plan_type || "group",
      is_active: row.is_active,
    });
    setFormOpen(true);
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) return;
    setSaving(true);
    await runWithFeedback(
      async () => {
        const body = {
          name,
          claim_email: form.claim_email.trim(),
          phone: form.phone.trim(),
          notes: form.notes.trim(),
          default_plan_type: form.default_plan_type || "group",
          is_active: form.is_active,
        };
        if (editing) {
          await apiPatch(`/insurance-companies/${editing.id}/`, body);
        } else {
          await apiPost("/insurance-companies/", body);
        }
        setFormOpen(false);
        await load();
      },
      {
        loadingMessage: editing ? "Saving..." : "Adding company...",
        successMessage: editing ? "Insurance company updated." : "Insurance company added.",
        errorFallback: "Could not save insurance company.",
      },
    );
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    await runWithFeedback(
      async () => {
        await apiDelete(`/insurance-companies/${deleteRow.id}/`);
        setDeleteRow(null);
        await load();
      },
      {
        loadingMessage: "Deleting...",
        successMessage: "Insurance company removed.",
        errorFallback: "Could not delete.",
      },
    );
    setDeleting(false);
  };

  const toggleActive = async (row: InsuranceCompanyRow) => {
    setTogglingId(row.id);
    await runWithFeedback(
      async () => {
        await apiPatch(`/insurance-companies/${row.id}/`, { is_active: !row.is_active });
        await load();
      },
      {
        loadingMessage: "Updating...",
        successMessage: row.is_active ? "Marked inactive." : "Marked active.",
        errorFallback: "Could not update status.",
      },
    );
    setTogglingId(null);
  };

  const planLabel = (value: string) =>
    PLAN_OPTIONS.find((p) => p.value === value)?.label || value || "-";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#5a7a62]">
          {filtered.length} {filtered.length === 1 ? "payer" : "payers"}
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#13823d]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add company
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
              placeholder="Search name, email, or phone..."
              className="w-full rounded-lg border border-[#d1e8d8] bg-[#f4fbf7] py-2.5 pl-10 pr-3 text-sm text-[#0d1f14] placeholder:text-[#5a7a62] focus:border-[#16a349]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
              aria-label="Search insurance companies"
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
              <div className="min-w-[800px] shrink-0 border-b border-[#d1e8d8] bg-[#f8fdf9]">
                <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.6fr)_minmax(0,0.7fr)] gap-2 px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-[#5a7a62]">
                  <span>Company name</span>
                  <span>Claim email</span>
                  <span>Phone</span>
                  <span>Default plan</span>
                  <span>Status</span>
                  <span className="text-right">Actions</span>
                </div>
              </div>
              <div className="min-h-0 min-w-[800px] flex-1 overflow-auto">
                {filtered.length === 0 ? (
                  <p className="px-5 py-12 text-center text-sm text-[#5a7a62]">
                    {search.trim() || statusFilter === "all"
                      ? "No companies match."
                      : "No active companies yet. Add one to get started."}
                  </p>
                ) : (
                  <ul className="divide-y divide-[#d1e8d8]">
                    {filtered.map((row) => (
                      <li
                        key={row.id}
                        className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.6fr)_minmax(0,0.7fr)] gap-2 px-5 py-3.5 hover:bg-[#f8fdf9]"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-[#0d1f14]">{row.name}</p>
                          {row.notes ? (
                            <p className="mt-0.5 text-xs text-[#5a7a62]">{row.notes}</p>
                          ) : null}
                        </div>
                        <div className="min-w-0 truncate text-[#5a7a62]">{row.claim_email || "-"}</div>
                        <div className="min-w-0 text-[#5a7a62]">{row.phone || "-"}</div>
                        <div className="min-w-0 text-[#5a7a62]">{planLabel(row.default_plan_type)}</div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={row.is_active}
                            aria-label={row.is_active ? "Active" : "Inactive"}
                            disabled={togglingId === row.id}
                            onClick={() => void toggleActive(row)}
                            className={cn(
                              "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
                              row.is_active ? "bg-[#16a349]" : "bg-[#d1e8d8]",
                            )}
                          >
                            <span
                              className={cn(
                                "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                                row.is_active ? "left-[1.375rem]" : "left-0.5",
                              )}
                            />
                          </button>
                          <span className="text-xs text-[#5a7a62]">
                            {row.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <div className="flex justify-end">
                          <div
                            className="relative inline-flex"
                            ref={menuOpenId === row.id ? menuRef : undefined}
                          >
                            <button
                              type="button"
                              aria-haspopup="menu"
                              aria-expanded={menuOpenId === row.id}
                              aria-label={`Actions for ${row.name}`}
                              onClick={() =>
                                setMenuOpenId((id) => (id === row.id ? null : row.id))
                              }
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#d1e8d8] bg-white text-[#5a7a62] hover:bg-[#f8fdf9] hover:text-[#0d1f14]"
                            >
                              <IconMoreVertical className="h-4 w-4" />
                            </button>
                            {menuOpenId === row.id ? (
                              <div
                                role="menu"
                                className="absolute right-0 top-full z-20 mt-1.5 w-44 overflow-hidden rounded-xl border border-[#d1e8d8] bg-white py-1 shadow-lg"
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setMenuOpenId(null);
                                    openEdit(row);
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
                                    setDeleteRow(row);
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#0d1f14]">
              {editing ? "Edit insurance company" : "Add insurance company"}
            </DialogTitle>
            <DialogDescription className="text-[#5a7a62]">
              Patients can pick this company on their chart.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <label>
              <span className={fieldLabel}>Company name</span>
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Blue Cross Blue Shield"
              />
            </label>
            <label>
              <span className={fieldLabel}>Claim email</span>
              <input
                type="email"
                className={inputClass}
                value={form.claim_email}
                onChange={(e) => setForm((f) => ({ ...f, claim_email: e.target.value }))}
                placeholder="claims@example.com"
              />
            </label>
            <label>
              <span className={fieldLabel}>Phone</span>
              <input
                className={inputClass}
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="(555) 123-4567"
              />
            </label>
            <label>
              <span className={fieldLabel}>Default plan type</span>
              <select
                className={inputClass}
                value={form.default_plan_type}
                onChange={(e) => setForm((f) => ({ ...f, default_plan_type: e.target.value }))}
              >
                {PLAN_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={fieldLabel}>Notes</span>
              <input
                className={inputClass}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Internal note"
              />
            </label>
            <div className="flex items-center justify-between rounded-lg border border-[#d1e8d8] bg-[#f8fdf9] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-[#0d1f14]">Active</p>
                <p className="text-xs text-[#5a7a62]">Show in patient dropdown</p>
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
              disabled={saving || !form.name.trim()}
              onClick={() => void save()}
              className="bg-[#16a349] text-white hover:bg-[#13823d]"
            >
              {saving ? "Saving..." : editing ? "Save changes" : "Add company"}
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
                <DialogTitle className="text-[#0d1f14]">Delete {deleteRow.name}?</DialogTitle>
                <DialogDescription className="text-[#5a7a62]">
                  Patients assigned to it keep their typed payer name, but the link is cleared.
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
