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
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type ServiceType = "chiropractic" | "massage";

type Service = {
  id: number;
  name: string;
  public_booking_name?: string;
  description: string;
  duration_minutes: number;
  price: string;
  billing_code: string;
  is_active: boolean;
  show_in_public_booking?: boolean;
  visible_to_chiropractic_staff?: boolean;
  visible_to_massage_staff?: boolean;
  service_type?: ServiceType;
  is_new_client_intake?: boolean;
  charges_patient?: boolean;
};

function formatPrice(p: string): string {
  const n = parseFloat(p);
  if (Number.isNaN(n)) return p;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

const emptyForm = {
  name: "",
  public_booking_name: "",
  billing_code: "",
  duration_minutes: 30,
  price: "0",
  description: "",
  is_active: true,
  show_in_public_booking: true,
  visible_to_chiropractic_staff: true,
  visible_to_massage_staff: true,
  service_type: "chiropractic" as ServiceType,
  is_new_client_intake: false,
  charges_patient: true,
};

const fieldLabel = "mb-1.5 block text-sm font-medium text-[#0d1f14]";
const inputClass =
  "w-full rounded-lg border border-[#d1e8d8] bg-[#f4fbf7] px-3.5 py-2.5 text-sm text-[#0d1f14] placeholder:text-[#5a7a62] focus:border-[#16a349]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16a349]/20";

const SERVICES_PAGE_SIZE = 12;

type QuickFilter = "all" | "active" | "inactive" | "chiropractic" | "massage";

const GRID =
  "grid grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.7fr)] gap-2";

export default function AdminServicesPage() {
  const { runWithFeedback } = useAppFeedback();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [listPage, setListPage] = useState(0);
  const [deleteId, setDeleteId] = useState<number | null>(null);
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

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = (await apiGetAuth<Service[]>("/services/")) as Service[];
      setServices(
        data.map((s) => ({
          ...s,
          show_in_public_booking: s.show_in_public_booking !== false,
          visible_to_chiropractic_staff: s.visible_to_chiropractic_staff !== false,
          visible_to_massage_staff: s.visible_to_massage_staff !== false,
          is_new_client_intake: s.is_new_client_intake === true,
          charges_patient: s.charges_patient !== false,
        })),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load services.");
      setServices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    let list = services;
    if (quickFilter === "active") list = list.filter((s) => s.is_active !== false);
    else if (quickFilter === "inactive") list = list.filter((s) => s.is_active === false);
    else if (quickFilter === "chiropractic") list = list.filter((s) => s.service_type !== "massage");
    else if (quickFilter === "massage") list = list.filter((s) => s.service_type === "massage");

    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.public_booking_name || "").toLowerCase().includes(q) ||
        (s.billing_code || "").toLowerCase().includes(q) ||
        (s.description || "").toLowerCase().includes(q),
    );
  }, [services, search, quickFilter]);

  const listPageCount = Math.max(1, Math.ceil(filtered.length / SERVICES_PAGE_SIZE));
  const pagedFiltered = useMemo(() => {
    const start = listPage * SERVICES_PAGE_SIZE;
    return filtered.slice(start, start + SERVICES_PAGE_SIZE);
  }, [filtered, listPage]);

  useEffect(() => {
    setListPage(0);
    setMenuOpenId(null);
  }, [search, quickFilter]);

  useEffect(() => {
    if (listPage >= listPageCount) setListPage(Math.max(0, listPageCount - 1));
  }, [listPage, listPageCount]);

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setForm({ ...emptyForm });
    setError("");
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setError("");
    setFormOpen(true);
  };

  const openEdit = (s: Service) => {
    setEditing(s);
    setForm({
      name: s.name,
      public_booking_name: (s.public_booking_name || "").trim(),
      billing_code: s.billing_code || "",
      duration_minutes: s.duration_minutes,
      price: String(s.price),
      description: s.description || "",
      is_active: s.is_active !== false,
      show_in_public_booking: s.show_in_public_booking !== false,
      visible_to_chiropractic_staff: s.visible_to_chiropractic_staff !== false,
      visible_to_massage_staff: s.visible_to_massage_staff !== false,
      service_type: s.service_type === "massage" ? "massage" : "chiropractic",
      is_new_client_intake: s.service_type === "massage" ? false : s.is_new_client_intake === true,
      charges_patient: s.charges_patient !== false,
    });
    setError("");
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError("Service name is required.");
      return;
    }
    setIsSaving(true);
    setError("");
    const isEdit = Boolean(editing);
    await runWithFeedback(
      async () => {
        const payload = {
          name: form.name.trim(),
          public_booking_name: form.public_booking_name.trim(),
          billing_code: form.billing_code.trim(),
          duration_minutes: Number(form.duration_minutes) || 30,
          price: form.price,
          description: form.description.trim(),
          is_active: form.is_active,
          show_in_public_booking: form.show_in_public_booking,
          visible_to_chiropractic_staff: form.visible_to_chiropractic_staff,
          visible_to_massage_staff: form.visible_to_massage_staff,
          service_type: form.service_type,
          is_new_client_intake: form.service_type === "chiropractic" && form.is_new_client_intake,
          charges_patient: form.charges_patient,
        };
        if (editing) {
          await apiPatch(`/services/${editing.id}/`, payload);
        } else {
          await apiPost("/services/", payload);
        }
        await load();
        closeForm();
      },
      {
        loadingMessage: isEdit ? "Updating..." : "Adding...",
        successMessage: isEdit ? "Service updated." : "Service added.",
        errorFallback: "Could not save this service.",
      },
    );
    setIsSaving(false);
  };

  const confirmDelete = async () => {
    if (deleteId == null) return;
    setDeleting(true);
    await runWithFeedback(
      async () => {
        await apiDelete(`/services/${deleteId}/`);
        await load();
        if (editing?.id === deleteId) closeForm();
        setDeleteId(null);
      },
      {
        loadingMessage: "Removing...",
        successMessage: "Service removed.",
        errorFallback: "Could not delete this service.",
      },
    );
    setDeleting(false);
  };

  const toggleActive = async (s: Service) => {
    setTogglingId(s.id);
    await runWithFeedback(
      async () => {
        await apiPatch(`/services/${s.id}/`, { is_active: !(s.is_active !== false) });
        await load();
      },
      {
        loadingMessage: "Updating...",
        successMessage: s.is_active !== false ? "Marked inactive." : "Marked active.",
        errorFallback: "Could not update status.",
      },
    );
    setTogglingId(null);
  };

  const rangeStart = filtered.length === 0 ? 0 : listPage * SERVICES_PAGE_SIZE + 1;
  const rangeEnd = Math.min((listPage + 1) * SERVICES_PAGE_SIZE, filtered.length);
  const isNew = editing === null;
  const deleteName = services.find((s) => s.id === deleteId)?.name;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm text-[#5a7a62]">
          <span>
            {filtered.length} {filtered.length === 1 ? "service" : "services"}
          </span>
          <Link href="/admin/providers" className="font-semibold text-[#16a349] hover:underline">
            Assign to providers
          </Link>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#13823d]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add service
        </button>
      </div>

      {error && !formOpen ? (
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
              placeholder="Search name or code..."
              className="w-full rounded-lg border border-[#d1e8d8] bg-[#f4fbf7] py-2.5 pl-10 pr-3 text-sm text-[#0d1f14] placeholder:text-[#5a7a62] focus:border-[#16a349]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
              aria-label="Search services"
            />
          </div>
          <select
            value={quickFilter}
            onChange={(e) => setQuickFilter(e.target.value as QuickFilter)}
            className="min-w-[10rem] rounded-lg border border-[#d1e8d8] bg-white px-3 py-2.5 text-sm font-medium text-[#0d1f14] focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
            aria-label="Filter services"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="chiropractic">Chiropractic</option>
            <option value="massage">Massage</option>
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="p-8">
              <Loader variant="page" label="Loading" />
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col overflow-x-auto">
              <div className="min-w-[920px] shrink-0 border-b border-[#d1e8d8] bg-[#f8fdf9]">
                <div className={cn(GRID, "px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-[#5a7a62]")}>
                  <span>Service name</span>
                  <span>Category</span>
                  <span>Duration</span>
                  <span>Price</span>
                  <span>Code</span>
                  <span>Status</span>
                  <span className="text-right">Actions</span>
                </div>
              </div>

              <div className="min-h-0 min-w-[920px] flex-1 overflow-auto">
                {services.length === 0 ? (
                  <div className="px-5 py-12 text-center">
                    <p className="text-sm text-[#5a7a62]">No services yet.</p>
                    <button
                      type="button"
                      onClick={openCreate}
                      className="mt-3 text-sm font-semibold text-[#16a349] hover:underline"
                    >
                      Add service
                    </button>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="px-5 py-12 text-center">
                    <p className="text-sm text-[#5a7a62]">No services match.</p>
                    <button
                      type="button"
                      className="mt-3 text-sm font-semibold text-[#16a349] hover:underline"
                      onClick={() => {
                        setSearch("");
                        setQuickFilter("all");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <ul className="divide-y divide-[#d1e8d8]">
                    {pagedFiltered.map((s) => {
                      const active = s.is_active !== false;
                      const category = s.service_type === "massage" ? "Massage" : "Chiropractic";
                      return (
                        <li key={s.id} className={cn(GRID, "items-center px-5 py-3.5 hover:bg-[#f8fdf9]")}>
                          <div className="min-w-0">
                            <p className="font-semibold text-[#0d1f14]">{s.name}</p>
                            {(s.public_booking_name || "").trim() ? (
                              <p className="mt-0.5 truncate text-xs text-[#5a7a62]">
                                Patients see: {(s.public_booking_name || "").trim()}
                              </p>
                            ) : null}
                            <div className="mt-1 flex flex-wrap gap-1">
                              {s.service_type !== "massage" && s.is_new_client_intake ? (
                                <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-[#fef3c7] text-[#92400e]">
                                  Intake
                                </span>
                              ) : null}
                              {active && s.show_in_public_booking === false ? (
                                <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-[#dbeafe] text-[#1d4ed8]">
                                  Bill-only
                                </span>
                              ) : null}
                              {active && s.charges_patient === false ? (
                                <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-[#ede9fe] text-[#5b21b6]">
                                  No patient charge
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div>
                            <span className="inline-flex rounded-full bg-[#ecfdf5] px-2.5 py-1 text-xs font-medium text-[#0d5c2e]">
                              {category}
                            </span>
                          </div>
                          <div className="tabular-nums text-[#0d1f14]">{s.duration_minutes} min</div>
                          <div className="font-semibold tabular-nums text-[#0d1f14]">
                            {formatPrice(String(s.price))}
                          </div>
                          <div className="font-mono text-xs text-[#5a7a62]">{s.billing_code || "-"}</div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={active}
                              aria-label={active ? "Active" : "Inactive"}
                              disabled={togglingId === s.id}
                              onClick={() => void toggleActive(s)}
                              className={cn(
                                "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
                                active ? "bg-[#16a349]" : "bg-[#d1e8d8]",
                              )}
                            >
                              <span
                                className={cn(
                                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                                  active ? "left-[1.375rem]" : "left-0.5",
                                )}
                              />
                            </button>
                            <span className="text-xs text-[#5a7a62]">{active ? "Active" : "Inactive"}</span>
                          </div>
                          <div className="flex justify-end">
                            <div
                              className="relative inline-flex"
                              ref={menuOpenId === s.id ? menuRef : undefined}
                            >
                              <button
                                type="button"
                                aria-haspopup="menu"
                                aria-expanded={menuOpenId === s.id}
                                aria-label={`Actions for ${s.name}`}
                                onClick={() =>
                                  setMenuOpenId((id) => (id === s.id ? null : s.id))
                                }
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#d1e8d8] bg-white text-[#5a7a62] hover:bg-[#f8fdf9] hover:text-[#0d1f14]"
                              >
                                <IconMoreVertical className="h-4 w-4" />
                              </button>
                              {menuOpenId === s.id ? (
                                <div
                                  role="menu"
                                  className="absolute right-0 top-full z-20 mt-1.5 w-44 overflow-hidden rounded-xl border border-[#d1e8d8] bg-white py-1 shadow-lg"
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setMenuOpenId(null);
                                      openEdit(s);
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
                                      setDeleteId(s.id);
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
                      );
                    })}
                  </ul>
                )}
              </div>

              {filtered.length > 0 ? (
                <div className="flex shrink-0 flex-col gap-2 border-t border-[#d1e8d8] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-[#5a7a62]">
                    <span className="tabular-nums text-[#0d1f14]">
                      {rangeStart}-{rangeEnd}
                    </span>{" "}
                    of <span className="tabular-nums text-[#0d1f14]">{filtered.length}</span>
                  </p>
                  {listPageCount > 1 ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={listPage === 0}
                        onClick={() => setListPage((p) => Math.max(0, p - 1))}
                        className="rounded-lg border border-[#d1e8d8] bg-white px-3 py-1.5 text-xs font-semibold text-[#0d1f14] hover:bg-[#f8fdf9] disabled:opacity-40"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        disabled={listPage >= listPageCount - 1}
                        onClick={() => setListPage((p) => Math.min(listPageCount - 1, p + 1))}
                        className="rounded-lg border border-[#d1e8d8] bg-white px-3 py-1.5 text-xs font-semibold text-[#0d1f14] hover:bg-[#f8fdf9] disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <Dialog open={formOpen} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="flex max-h-[min(92dvh,52rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b border-[#d1e8d8] bg-[#f8fdf9] px-6 py-4 pr-12">
            <DialogTitle className="text-[#0d1f14]">
              {isNew ? "Add service" : "Edit service"}
            </DialogTitle>
            <DialogDescription className="text-[#5a7a62]">
              {isNew ? "Create a visit type for booking and billing." : editing?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {error && formOpen ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p>
            ) : null}

            <label>
              <span className={fieldLabel}>
                Service name <span className="text-[#991b1b]">*</span>
              </span>
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Follow-up Adjustment"
              />
            </label>

            <label>
              <span className={fieldLabel}>Patient-facing name</span>
              <input
                className={inputClass}
                value={form.public_booking_name}
                onChange={(e) => setForm((f) => ({ ...f, public_booking_name: e.target.value }))}
                placeholder="Optional label for the booking site"
              />
            </label>

            <label>
              <span className={fieldLabel}>Description</span>
              <textarea
                className={cn(inputClass, "min-h-[4.5rem] resize-y")}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional"
                rows={3}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className={fieldLabel}>Duration (minutes)</span>
                <input
                  type="number"
                  min={5}
                  step={5}
                  className={inputClass}
                  value={form.duration_minutes}
                  onChange={(e) => setForm((f) => ({ ...f, duration_minutes: Number(e.target.value) || 0 }))}
                />
              </label>
              <label>
                <span className={fieldLabel}>Price (USD)</span>
                <input
                  inputMode="decimal"
                  className={inputClass}
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="0.00"
                />
              </label>
            </div>

            <label>
              <span className={fieldLabel}>Billing / procedure code</span>
              <input
                className={cn(inputClass, "font-mono")}
                value={form.billing_code}
                onChange={(e) => setForm((f) => ({ ...f, billing_code: e.target.value }))}
                placeholder="e.g. 98941"
              />
            </label>

            <label>
              <span className={fieldLabel}>Category</span>
              <select
                className={inputClass}
                value={form.service_type}
                onChange={(e) => {
                  const service_type = e.target.value as ServiceType;
                  setForm((f) => ({
                    ...f,
                    service_type,
                    ...(service_type === "massage" ? { is_new_client_intake: false } : {}),
                  }));
                }}
              >
                <option value="chiropractic">Chiropractic</option>
                <option value="massage">Massage</option>
              </select>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d1e8d8] bg-[#f8fdf9] p-3">
              <input
                type="checkbox"
                checked={form.charges_patient}
                onChange={(e) => setForm((f) => ({ ...f, charges_patient: e.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-[#d1e8d8] text-[#16a349] focus:ring-[#16a349]"
              />
              <span>
                <span className="block text-sm font-medium text-[#0d1f14]">Count toward patient invoice</span>
                <span className="mt-0.5 block text-xs text-[#5a7a62]">
                  Uncheck for insurance-only lines that should not increase what the patient owes.
                </span>
              </span>
            </label>

            {form.service_type === "chiropractic" ? (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d1e8d8] bg-[#f8fdf9] p-3">
                <input
                  type="checkbox"
                  checked={form.is_new_client_intake}
                  onChange={(e) => setForm((f) => ({ ...f, is_new_client_intake: e.target.checked }))}
                  className="mt-1 h-4 w-4 rounded border-[#d1e8d8] text-[#16a349] focus:ring-[#16a349]"
                />
                <span>
                  <span className="block text-sm font-medium text-[#0d1f14]">New patient / reactivation visit</span>
                  <span className="mt-0.5 block text-xs text-[#5a7a62]">
                    For returning patients with a long gap since their last chiropractic visit.
                  </span>
                </span>
              </label>
            ) : null}

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d1e8d8] bg-[#f8fdf9] p-3">
              <input
                type="checkbox"
                checked={form.show_in_public_booking}
                onChange={(e) => setForm((f) => ({ ...f, show_in_public_booking: e.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-[#d1e8d8] text-[#16a349] focus:ring-[#16a349]"
              />
              <span>
                <span className="block text-sm font-medium text-[#0d1f14]">Show on public booking</span>
                <span className="mt-0.5 block text-xs text-[#5a7a62]">
                  Uncheck for bill-only codes doctors add in-room.
                </span>
              </span>
            </label>

            <div className="rounded-lg border border-[#d1e8d8] bg-[#f8fdf9] p-3">
              <p className="text-sm font-medium text-[#0d1f14]">Who sees this on the in-room bill?</p>
              <div className="mt-3 space-y-2">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.visible_to_chiropractic_staff}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, visible_to_chiropractic_staff: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-[#d1e8d8] text-[#16a349] focus:ring-[#16a349]"
                  />
                  <span className="text-sm text-[#0d1f14]">Chiropractic doctors</span>
                </label>
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.visible_to_massage_staff}
                    onChange={(e) => setForm((f) => ({ ...f, visible_to_massage_staff: e.target.checked }))}
                    className="h-4 w-4 rounded border-[#d1e8d8] text-[#16a349] focus:ring-[#16a349]"
                  />
                  <span className="text-sm text-[#0d1f14]">Massage doctors</span>
                </label>
              </div>
              {!form.visible_to_chiropractic_staff && !form.visible_to_massage_staff ? (
                <p className="mt-2 text-xs font-medium text-[#92400e]">
                  Warning: no doctor role will see this line.
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[#d1e8d8] bg-[#f8fdf9] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-[#0d1f14]">Active</p>
                <p className="text-xs text-[#5a7a62]">Usable for booking and billing</p>
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

          <DialogFooter className="shrink-0 border-[#d1e8d8] bg-[#f8fdf9] px-6 py-4">
            <Button type="button" variant="outline" disabled={isSaving} onClick={closeForm} className="border-[#d1e8d8]">
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isSaving || !form.name.trim()}
              onClick={() => void save()}
              className="bg-[#16a349] text-white hover:bg-[#13823d]"
            >
              {isSaving ? "Saving..." : isNew ? "Create service" : "Save changes"}
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
            <DialogTitle className="text-[#0d1f14]">Delete {deleteName || "service"}?</DialogTitle>
            <DialogDescription className="text-[#5a7a62]">
              It will no longer appear in booking options.
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
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
