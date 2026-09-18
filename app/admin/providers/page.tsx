"use client";

import { IconMoreVertical } from "@/components/icons";
import { useAppFeedback } from "@/components/app-feedback";
import { Loader } from "@/components/loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ApiError, apiDelete, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ArrowRightLeft, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Provider = {
  id: number;
  username?: string;
  provider_name: string;
  /** Local edit for the name shown on schedules (maps to login profile full_name); cleared when the list reloads. */
  localDisplayName?: string;
  title: string;
  credential: string;
  billing_provider_id?: string;
  specialty: string;
  active: boolean;
  notification_phone: string;
  services: number[];
};

type Service = { id: number; name: string; duration_minutes: number; price: string; is_active: boolean };

const emptyAddForm = {
  new_username: "",
  new_password: "",
  new_full_name: "",
  new_email: "",
  title: "",
  credential: "",
  specialty: "",
  notification_phone: "",
  services: [] as number[],
};

const fieldLabel = "mb-1.5 block text-sm font-medium text-[#0d1f14]";
const inputClass =
  "w-full rounded-lg border border-[#d1e8d8] bg-[#f4fbf7] px-3.5 py-2.5 text-sm text-[#0d1f14] placeholder:text-[#5a7a62] focus:border-[#16a349]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16a349]/20";

const GRID =
  "grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,0.85fr)_minmax(0,0.55fr)] gap-2";

function formatPrice(p: string): string {
  const n = parseFloat(p);
  if (Number.isNaN(n)) return p;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function providerInitial(name: string): string {
  const c = name.trim().charAt(0);
  return c ? c.toUpperCase() : "?";
}

export default function AdminProvidersPage() {
  const { runWithFeedback, toast } = useAppFeedback();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null);
  const [activeTogglingId, setActiveTogglingId] = useState<number | null>(null);
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [transferFrom, setTransferFrom] = useState<Provider | null>(null);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  /** Open "Edit provider" dialog for this id (null = closed). */
  const [editingProviderId, setEditingProviderId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("all");
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const bookableServices = useMemo(() => services.filter((s) => s.is_active), [services]);
  const bookableIds = useMemo(() => new Set(bookableServices.map((s) => s.id)), [bookableServices]);

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

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [provData, svcData] = await Promise.all([
        apiGetAuth<Provider[]>("/providers/"),
        apiGetAuth<Service[]>("/services/"),
      ]);
      setProviders(
        (provData as Provider[]).map((p) => ({
          ...p,
          notification_phone: p.notification_phone ?? "",
        })),
      );
      setServices(
        (svcData as Service[]).map((s) => ({
          ...s,
          is_active: s.is_active !== false,
        })),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load.");
      setProviders([]);
      setServices([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load("initial");
  }, [load]);

  const toggleService = (provider: Provider, serviceId: number) => {
    const has = provider.services.includes(serviceId);
    const next = has ? provider.services.filter((s) => s !== serviceId) : [...provider.services, serviceId];
    setProviders((prev) => prev.map((p) => (p.id === provider.id ? { ...p, services: next } : p)));
  };

  const setNotificationPhone = (provider: Provider, value: string) => {
    setProviders((prev) => prev.map((p) => (p.id === provider.id ? { ...p, notification_phone: value } : p)));
  };

  const setProviderDisplayName = (provider: Provider, value: string) => {
    setProviders((prev) => prev.map((p) => (p.id === provider.id ? { ...p, localDisplayName: value } : p)));
  };

  const displayNameFor = (p: Provider) => p.localDisplayName ?? p.provider_name;

  const saveProvider = async (provider: Provider) => {
    setSavingId(provider.id);
    setError("");
    await runWithFeedback(
      async () => {
        await apiPatch(`/providers/${provider.id}/`, {
          services: provider.services,
          notification_phone: provider.notification_phone?.trim() ?? "",
          credential: provider.credential?.trim() ?? "",
          billing_provider_id: provider.billing_provider_id?.trim() ?? "",
          display_name: displayNameFor(provider).trim(),
        });
        await load("refresh");
      },
      {
        loadingMessage: "Saving this doctor's row...",
        successMessage: "Provider details saved.",
        errorFallback: "Could not save this row.",
      },
    );
    setSavingId(null);
  };

  const submitTransferHistory = async () => {
    if (!transferFrom || !transferTargetId) return;
    setTransferSubmitting(true);
    setError("");
    await runWithFeedback(
      async () => {
        const res = await apiPost<{ detail: string }>(`/providers/${transferFrom.id}/reassign-history/`, {
          target_provider_id: Number(transferTargetId),
        });
        setTransferFrom(null);
        setTransferTargetId("");
        await load("refresh");
        return res;
      },
      {
        loadingMessage: "Moving appointments and visits to the other doctor...",
        successMessage: (r) => r.detail,
        errorFallback: "Could not transfer history.",
      },
    );
    setTransferSubmitting(false);
  };

  const toggleProviderActive = async (provider: Provider) => {
    setActiveTogglingId(provider.id);
    setError("");
    const nextActive = !provider.active;
    await runWithFeedback(
      async () => {
        await apiPatch(`/providers/${provider.id}/`, { active: nextActive });
        setProviders((prev) => prev.map((p) => (p.id === provider.id ? { ...p, active: nextActive } : p)));
      },
      {
        loadingMessage: nextActive ? "Showing doctor on the public list..." : "Hiding doctor from booking...",
        successMessage: nextActive
          ? "Doctor is active for booking again."
          : "Doctor hidden from booking (still in the system).",
        errorFallback: "Could not update listing status.",
      },
    );
    setActiveTogglingId(null);
  };

  const confirmRemoveProvider = async () => {
    if (!deleteTarget) return;
    const provider = deleteTarget;
    setDeletingId(provider.id);
    setError("");
    await runWithFeedback(
      async () => {
        await apiDelete(`/providers/${provider.id}/`);
        setProviders((prev) => prev.filter((p) => p.id !== provider.id));
        setDeleteTarget(null);
        if (editingProviderId === provider.id) setEditingProviderId(null);
      },
      {
        loadingMessage: "Removing doctor account...",
        successMessage: "Doctor and login removed.",
        errorFallback: "Could not remove this provider.",
      },
    );
    setDeletingId(null);
  };

  const toggleAddFormService = (serviceId: number) => {
    setAddForm((f) => {
      const has = f.services.includes(serviceId);
      return {
        ...f,
        services: has ? f.services.filter((id) => id !== serviceId) : [...f.services, serviceId],
      };
    });
  };

  const submitAddDoctor = async () => {
    const u = addForm.new_username.trim();
    const pw = addForm.new_password;
    if (!u || pw.length < 8) {
      toast.error("Choose a username and password with at least 8 characters.");
      return;
    }
    setAddSubmitting(true);
    setError("");
    const ok = await runWithFeedback(
      async () => {
        await apiPost("/providers/", {
          new_username: u,
          new_password: pw,
          new_full_name: addForm.new_full_name.trim() || undefined,
          new_email: addForm.new_email.trim() || undefined,
          title: addForm.title.trim() || undefined,
          credential: addForm.credential.trim() || undefined,
          specialty: addForm.specialty.trim() || undefined,
          notification_phone: addForm.notification_phone.trim() || undefined,
          services: addForm.services,
          active: true,
        });
        setAddOpen(false);
        setAddForm(emptyAddForm);
        await load("refresh");
      },
      {
        loadingMessage: "Creating doctor login...",
        successMessage: "New doctor added. They can sign in with the username you chose.",
        errorFallback: "Could not add this doctor.",
      },
    );
    if (!ok) {
      /* error toast already shown */
    }
    setAddSubmitting(false);
  };

  const onAddDialogOpenChange = (next: boolean) => {
    if (!next && addSubmitting) return;
    setAddOpen(next);
  };

  const legacyServiceCount = (p: Provider) => p.services.filter((id) => !bookableIds.has(id)).length;

  const bookingServiceNames = (p: Provider) =>
    p.services
      .filter((id) => bookableIds.has(id))
      .map((id) => bookableServices.find((s) => s.id === id)?.name)
      .filter((name): name is string => Boolean(name));

  const filteredProviders = useMemo(() => {
    let list = providers;
    if (statusFilter === "active") list = list.filter((p) => p.active);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.provider_name.toLowerCase().includes(q) ||
        (p.username || "").toLowerCase().includes(q) ||
        (p.specialty || "").toLowerCase().includes(q) ||
        (p.title || "").toLowerCase().includes(q) ||
        (p.credential || "").toLowerCase().includes(q),
    );
  }, [providers, search, statusFilter]);

  const openAddDoctor = () => {
    setError("");
    setAddForm({ ...emptyAddForm, services: [] });
    setAddOpen(true);
  };

  const editorProvider = useMemo(
    () => (editingProviderId != null ? providers.find((p) => p.id === editingProviderId) ?? null : null),
    [editingProviderId, providers],
  );

  useEffect(() => {
    if (editingProviderId != null && !providers.some((p) => p.id === editingProviderId)) {
      setEditingProviderId(null);
    }
  }, [editingProviderId, providers]);

  const onEditDialogOpenChange = (open: boolean) => {
    if (!open) {
      if (savingId !== null) return;
      setEditingProviderId(null);
    }
  };

  const openEdit = (provider: Provider) => {
    setError("");
    setEditingProviderId(provider.id);
  };

  const openTransfer = (provider: Provider) => {
    setError("");
    setTransferTargetId("");
    setTransferFrom(provider);
  };

  const openDelete = (provider: Provider) => {
    setDeleteTarget(provider);
  };

  const credentialLine = (p: Provider) =>
    [p.credential, p.title, p.specialty].filter(Boolean).join(" - ");

  const showListChrome = !loading && services.length > 0 && bookableServices.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-[#5a7a62]">
            {providers.length} {providers.length === 1 ? "doctor" : "doctors"}
            {refreshing ? " (refreshing...)" : ""}
          </p>
          <Link href="/admin/services" className="text-sm font-semibold text-[#16a349] hover:underline">
            Services & codes
          </Link>
        </div>
        <button
          type="button"
          onClick={openAddDoctor}
          className="inline-flex items-center gap-2 rounded-lg bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#13823d]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add doctor
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
          {error}
        </p>
      ) : null}

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#d1e8d8] bg-white">
        {showListChrome ? (
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
                placeholder="Search name, username..."
                className="w-full rounded-lg border border-[#d1e8d8] bg-[#f4fbf7] py-2.5 pl-10 pr-3 text-sm text-[#0d1f14] placeholder:text-[#5a7a62] focus:border-[#16a349]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
                aria-label="Search doctors"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "active" | "all")}
              className="min-w-[9rem] rounded-lg border border-[#d1e8d8] bg-white px-3 py-2.5 text-sm font-medium text-[#0d1f14] focus:border-[#16a349]/40 focus:outline-none focus:ring-2 focus:ring-[#16a349]/20"
              aria-label="Booking filter"
            >
              <option value="all">All</option>
              <option value="active">Active only</option>
            </select>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="p-8">
              <Loader variant="page" label="Loading providers" sublabel="Syncing doctors and services..." />
            </div>
          ) : services.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <p className="text-sm font-semibold text-[#0d1f14]">No services yet</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-[#5a7a62]">
                Add at least one service before assigning visit types to doctors.
              </p>
              <Link
                href="/admin/services"
                className="mt-5 inline-flex rounded-lg bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#13823d]"
              >
                Go to Services & codes
              </Link>
            </div>
          ) : bookableServices.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <p className="text-sm font-semibold text-[#0d1f14]">No active visit types</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-[#5a7a62]">
                Turn visit types on under Services & codes. You can still add a doctor now.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/admin/services"
                  className="inline-flex rounded-lg bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#13823d]"
                >
                  Go to Services & codes
                </Link>
                <button
                  type="button"
                  onClick={openAddDoctor}
                  className="inline-flex rounded-lg border border-[#d1e8d8] bg-white px-4 py-2.5 text-sm font-semibold text-[#0d1f14] hover:bg-[#f8fdf9]"
                >
                  Add doctor
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col overflow-x-auto">
              <div className="min-w-[720px] shrink-0 border-b border-[#d1e8d8] bg-[#f8fdf9]">
                <div className={cn(GRID, "px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-[#5a7a62]")}>
                  <span>Provider</span>
                  <span>Visit types</span>
                  <span>Booking</span>
                  <span className="text-right">Actions</span>
                </div>
              </div>

              <div className="min-h-0 min-w-[720px] flex-1 overflow-auto">
                {providers.length === 0 ? (
                  <div className="px-5 py-12 text-center">
                    <p className="text-sm font-semibold text-[#0d1f14]">No doctors yet</p>
                    <p className="mt-2 text-sm text-[#5a7a62]">
                      Create a doctor login, then assign visit types for online booking.
                    </p>
                    <button
                      type="button"
                      onClick={openAddDoctor}
                      className="mt-5 inline-flex rounded-lg bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#13823d]"
                    >
                      Add doctor
                    </button>
                  </div>
                ) : filteredProviders.length === 0 ? (
                  <p className="px-5 py-12 text-center text-sm text-[#5a7a62]">
                    {search.trim() || statusFilter === "active"
                      ? "No doctors match."
                      : "No doctors yet."}
                  </p>
                ) : (
                  <ul className="divide-y divide-[#d1e8d8]">
                    {filteredProviders.map((provider) => {
                      const names = bookingServiceNames(provider);
                      const shown = names.slice(0, 3);
                      const extra = names.length - shown.length;
                      const meta = credentialLine(provider);
                      return (
                        <li key={provider.id} className={cn(GRID, "items-center px-5 py-3.5 hover:bg-[#f8fdf9]")}>
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ecfdf5] text-sm font-bold text-[#0d5c2e] ring-1 ring-[#d1e8d8]">
                              {providerInitial(provider.provider_name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-[#0d1f14]">{provider.provider_name}</p>
                              {provider.username ? (
                                <p className="mt-0.5 truncate font-mono text-[11px] text-[#5a7a62]">
                                  @{provider.username}
                                </p>
                              ) : null}
                              {meta ? (
                                <p className="mt-0.5 truncate text-xs text-[#5a7a62]">{meta}</p>
                              ) : null}
                            </div>
                          </div>

                          <div className="min-w-0">
                            {names.length === 0 ? (
                              <span className="text-sm text-[#5a7a62]">None assigned</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {shown.map((name) => (
                                  <span
                                    key={name}
                                    className="inline-flex max-w-full truncate rounded-full bg-[#f0fdf4] px-2.5 py-0.5 text-xs font-medium text-[#166534]"
                                  >
                                    {name}
                                  </span>
                                ))}
                                {extra > 0 ? (
                                  <span className="inline-flex rounded-full bg-[#f8fdf9] px-2.5 py-0.5 text-xs font-medium text-[#5a7a62]">
                                    +{extra} more
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={provider.active}
                              aria-label={provider.active ? "Booking on" : "Booking off"}
                              disabled={activeTogglingId === provider.id}
                              onClick={() => void toggleProviderActive(provider)}
                              className={cn(
                                "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
                                provider.active ? "bg-[#16a349]" : "bg-[#d1e8d8]",
                              )}
                            >
                              <span
                                className={cn(
                                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                                  provider.active ? "left-[1.375rem]" : "left-0.5",
                                )}
                              />
                            </button>
                            <span className="text-xs text-[#5a7a62]">
                              {provider.active ? "On" : "Off"}
                            </span>
                          </div>

                          <div className="flex justify-end">
                            <div
                              className="relative inline-flex"
                              ref={menuOpenId === provider.id ? menuRef : undefined}
                            >
                              <button
                                type="button"
                                aria-haspopup="menu"
                                aria-expanded={menuOpenId === provider.id}
                                aria-label={`Actions for ${provider.provider_name}`}
                                onClick={() =>
                                  setMenuOpenId((id) => (id === provider.id ? null : provider.id))
                                }
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#d1e8d8] bg-white text-[#5a7a62] hover:bg-[#f8fdf9] hover:text-[#0d1f14]"
                              >
                                <IconMoreVertical className="h-4 w-4" />
                              </button>
                              {menuOpenId === provider.id ? (
                                <div
                                  role="menu"
                                  className="absolute right-0 top-full z-20 mt-1.5 w-48 overflow-hidden rounded-xl border border-[#d1e8d8] bg-white py-1 shadow-lg"
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setMenuOpenId(null);
                                      openEdit(provider);
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
                                      openTransfer(provider);
                                    }}
                                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium text-[#0d1f14] hover:bg-[#f8fdf9]"
                                  >
                                    <ArrowRightLeft className="h-4 w-4 text-[#5a7a62]" aria-hidden />
                                    Transfer history
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setMenuOpenId(null);
                                      openDelete(provider);
                                    }}
                                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium text-[#991b1b] hover:bg-[#fef2f2]"
                                  >
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                    Remove
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
            </div>
          )}
        </div>
      </section>

      <Dialog open={editingProviderId !== null} onOpenChange={onEditDialogOpenChange}>
        <DialogContent
          showCloseButton={!editorProvider || savingId !== editorProvider.id}
          className={cn(
            "gap-0 border-[#d1e8d8] p-0 sm:max-w-2xl",
            "flex max-h-[min(90dvh,52rem)] flex-col overflow-hidden",
          )}
        >
          {editorProvider ? (
            <>
              <div className="border-b border-[#d1e8d8] bg-[#f8fdf9] px-5 py-4 sm:px-6">
                <DialogHeader className="space-y-1 text-left">
                  <DialogTitle className="text-xl font-bold tracking-tight text-[#0d1f14]">
                    Edit provider
                  </DialogTitle>
                  <DialogDescription className="text-sm text-[#5a7a62]">
                    Update display name, SMS, credentials, and visit types. Username cannot change here.
                  </DialogDescription>
                  {editorProvider.username ? (
                    <p className="pt-1 font-mono text-xs text-[#5a7a62]">
                      {editorProvider.provider_name} (@{editorProvider.username})
                    </p>
                  ) : (
                    <p className="pt-1 text-xs text-[#5a7a62]">{editorProvider.provider_name}</p>
                  )}
                </DialogHeader>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
                {legacyServiceCount(editorProvider) > 0 ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                    Still linked to {legacyServiceCount(editorProvider)} inactive visit type(s). Manage under
                    Services & codes.
                  </p>
                ) : null}

                <label>
                  <span className={fieldLabel}>Display name</span>
                  <input
                    type="text"
                    className={inputClass}
                    value={displayNameFor(editorProvider)}
                    onChange={(e) => setProviderDisplayName(editorProvider, e.target.value)}
                    aria-label={`Display name for ${editorProvider.provider_name}`}
                  />
                </label>

                <label>
                  <span className={fieldLabel}>Credential</span>
                  <input
                    type="text"
                    value={editorProvider.credential ?? ""}
                    onChange={(e) =>
                      setProviders((prev) =>
                        prev.map((p) => (p.id === editorProvider.id ? { ...p, credential: e.target.value } : p)),
                      )
                    }
                    placeholder="e.g. DC"
                    className={inputClass}
                    aria-label={`Credential for ${editorProvider.provider_name}`}
                  />
                </label>

                <label>
                  <span className={fieldLabel}>NPI (on bills)</span>
                  <input
                    type="text"
                    value={editorProvider.billing_provider_id ?? ""}
                    onChange={(e) =>
                      setProviders((prev) =>
                        prev.map((p) =>
                          p.id === editorProvider.id ? { ...p, billing_provider_id: e.target.value } : p,
                        ),
                      )
                    }
                    placeholder="e.g. 1700186277"
                    className={cn(inputClass, "max-w-[14rem] font-mono")}
                    aria-label={`NPI for ${editorProvider.provider_name}`}
                  />
                </label>

                <label>
                  <span className={fieldLabel}>Alert SMS</span>
                  <input
                    type="tel"
                    value={editorProvider.notification_phone ?? ""}
                    onChange={(e) => setNotificationPhone(editorProvider, e.target.value)}
                    placeholder="+1 or 10 digits"
                    className={inputClass}
                    aria-label={`SMS alert for ${editorProvider.provider_name}`}
                  />
                </label>

                <div>
                  <p className={fieldLabel}>Online booking visit types</p>
                  <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-[#d1e8d8] bg-[#f8fdf9] p-3 sm:max-h-64">
                    {bookableServices.map((s) => (
                      <label
                        key={s.id}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border border-transparent bg-white px-3 py-2.5 hover:border-[#d1e8d8]"
                      >
                        <input
                          type="checkbox"
                          checked={editorProvider.services.includes(s.id)}
                          onChange={() => toggleService(editorProvider, s.id)}
                          className="h-4 w-4 shrink-0 rounded border-[#d1e8d8] text-[#16a349] focus:ring-[#16a349]/40"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[#0d1f14]">{s.name}</p>
                          <p className="text-xs text-[#5a7a62]">
                            {s.duration_minutes} min - {formatPrice(s.price)}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-[#d1e8d8] bg-[#f8fdf9] px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-[#0d1f14]">Public booking list</p>
                    <p className="text-xs text-[#5a7a62]">
                      {editorProvider.active
                        ? "Shown on booking for checked visit types."
                        : "Hidden from booking until activated."}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={editorProvider.active}
                    disabled={activeTogglingId === editorProvider.id}
                    onClick={() => void toggleProviderActive(editorProvider)}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
                      editorProvider.active ? "bg-[#16a349]" : "bg-[#d1e8d8]",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                        editorProvider.active ? "left-[1.375rem]" : "left-0.5",
                      )}
                    />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-[#d1e8d8] bg-[#f8fdf9] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  <button
                    type="button"
                    className="font-semibold text-[#16a349] underline-offset-2 hover:underline"
                    onClick={() => {
                      setEditingProviderId(null);
                      openTransfer(editorProvider);
                    }}
                  >
                    Transfer visit history...
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === editorProvider.id}
                    className="font-semibold text-[#991b1b] underline-offset-2 hover:underline disabled:opacity-50"
                    onClick={() => openDelete(editorProvider)}
                  >
                    Remove doctor...
                  </button>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={savingId === editorProvider.id}
                    className="border-[#d1e8d8]"
                    onClick={() => setEditingProviderId(null)}
                  >
                    Close
                  </Button>
                  <Button
                    type="button"
                    disabled={savingId === editorProvider.id}
                    className="bg-[#16a349] text-white hover:bg-[#13823d]"
                    onClick={() => void saveProvider(editorProvider)}
                  >
                    {savingId === editorProvider.id ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={onAddDialogOpenChange}>
        <DialogContent
          showCloseButton={!addSubmitting}
          className="gap-0 overflow-hidden border-[#d1e8d8] p-0 sm:max-w-lg"
        >
          <DialogHeader className="border-b border-[#d1e8d8] bg-[#f8fdf9] px-5 py-4 pr-12">
            <DialogTitle id="add-doctor-title" className="text-xl font-bold text-[#0d1f14]">
              Add doctor
            </DialogTitle>
            <DialogDescription className="text-sm text-[#5a7a62]">
              Creates a login for the doctor portal. Assign visit types below if ready.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[min(60dvh,28rem)] space-y-4 overflow-y-auto px-5 py-5">
            <label>
              <span className={fieldLabel}>Username</span>
              <input
                type="text"
                autoComplete="username"
                value={addForm.new_username}
                onChange={(e) => setAddForm((f) => ({ ...f, new_username: e.target.value }))}
                className={inputClass}
                placeholder="e.g. dr.smith"
              />
            </label>
            <label>
              <span className={fieldLabel}>Password (min 8 characters)</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={addForm.new_password}
                onChange={(e) => setAddForm((f) => ({ ...f, new_password: e.target.value }))}
                className={inputClass}
                placeholder="********"
              />
            </label>
            <label>
              <span className={fieldLabel}>Display name (optional)</span>
              <input
                type="text"
                value={addForm.new_full_name}
                onChange={(e) => setAddForm((f) => ({ ...f, new_full_name: e.target.value }))}
                className={inputClass}
                placeholder="Dr. Jane Smith"
              />
            </label>
            <label>
              <span className={fieldLabel}>Email (optional)</span>
              <input
                type="email"
                value={addForm.new_email}
                onChange={(e) => setAddForm((f) => ({ ...f, new_email: e.target.value }))}
                className={inputClass}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className={fieldLabel}>Title (optional)</span>
                <input
                  type="text"
                  value={addForm.title}
                  onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))}
                  className={inputClass}
                  placeholder="DC"
                />
              </label>
              <label>
                <span className={fieldLabel}>Credential (optional)</span>
                <input
                  type="text"
                  value={addForm.credential}
                  onChange={(e) => setAddForm((f) => ({ ...f, credential: e.target.value }))}
                  className={inputClass}
                  placeholder="e.g. DC"
                />
              </label>
              <label>
                <span className={fieldLabel}>Specialty (optional)</span>
                <input
                  type="text"
                  value={addForm.specialty}
                  onChange={(e) => setAddForm((f) => ({ ...f, specialty: e.target.value }))}
                  className={inputClass}
                />
              </label>
            </div>
            <label>
              <span className={fieldLabel}>Alert SMS (optional)</span>
              <input
                type="tel"
                value={addForm.notification_phone}
                onChange={(e) => setAddForm((f) => ({ ...f, notification_phone: e.target.value }))}
                className={inputClass}
                placeholder="+1 or 10 digits"
              />
            </label>
            {bookableServices.length > 0 ? (
              <div>
                <p className={fieldLabel}>Online booking visit types (optional)</p>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-[#d1e8d8] bg-[#f8fdf9] p-3">
                  {bookableServices.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={addForm.services.includes(s.id)}
                        onChange={() => toggleAddFormService(s.id)}
                        className="h-4 w-4 rounded border-[#d1e8d8] text-[#16a349] focus:ring-[#16a349]/40"
                      />
                      <span className="text-[#0d1f14]">{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="border-[#d1e8d8] bg-[#f8fdf9] px-5 py-4">
            <Button
              type="button"
              variant="outline"
              disabled={addSubmitting}
              onClick={() => setAddOpen(false)}
              className="border-[#d1e8d8]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={addSubmitting}
              onClick={() => void submitAddDoctor()}
              className="bg-[#16a349] text-white hover:bg-[#13823d]"
            >
              {addSubmitting ? "Adding..." : "Create doctor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={transferFrom !== null}
        onOpenChange={(open) => {
          if (!open && !transferSubmitting) {
            setTransferFrom(null);
            setTransferTargetId("");
          }
        }}
      >
        <DialogContent showCloseButton={!transferSubmitting} className="border-[#d1e8d8] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#0d1f14]">Transfer visit history</DialogTitle>
            <DialogDescription className="text-[#5a7a62]">
              Moves all appointments and visits from{" "}
              <span className="font-semibold text-[#0d1f14]">
                {transferFrom?.provider_name ?? "this doctor"}
              </span>{" "}
              to another doctor. Use before removing someone with history on file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <label>
              <span className={fieldLabel}>Move all history to</span>
              {providers.filter((p) => p.id !== transferFrom?.id).length === 0 ? (
                <p className="text-sm text-amber-800">Add another doctor first, then transfer history.</p>
              ) : (
                <select
                  className={inputClass}
                  value={transferTargetId}
                  onChange={(e) => setTransferTargetId(e.target.value)}
                  aria-label="Target doctor for transferred history"
                >
                  <option value="">Choose a doctor...</option>
                  {providers
                    .filter((p) => p.id !== transferFrom?.id)
                    .map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.provider_name}
                        {!p.active ? " (inactive)" : ""}
                      </option>
                    ))}
                </select>
              )}
            </label>
          </div>
          <DialogFooter className="border-[#d1e8d8] bg-[#f8fdf9]">
            <Button
              type="button"
              variant="outline"
              disabled={transferSubmitting}
              onClick={() => {
                setTransferFrom(null);
                setTransferTargetId("");
              }}
              className="border-[#d1e8d8]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                transferSubmitting ||
                !transferTargetId ||
                providers.filter((p) => p.id !== transferFrom?.id).length === 0
              }
              onClick={() => void submitTransferHistory()}
              className="bg-[#16a349] text-white hover:bg-[#13823d]"
            >
              {transferSubmitting ? "Transferring..." : "Transfer all history"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open && deletingId == null) setDeleteTarget(null);
        }}
      >
        <DialogContent className="border-[#d1e8d8] sm:max-w-md">
          {deleteTarget ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-[#0d1f14]">
                  Remove {deleteTarget.provider_name}?
                </DialogTitle>
                <DialogDescription className="text-[#5a7a62]">
                  Removes this doctor and their login. This cannot be undone. If the server blocks
                  removal because of past appointments, transfer history first. You can also turn
                  booking off instead of deleting.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="border-[#d1e8d8] bg-[#f8fdf9]">
                <Button
                  type="button"
                  variant="outline"
                  disabled={deletingId === deleteTarget.id}
                  onClick={() => setDeleteTarget(null)}
                  className="border-[#d1e8d8]"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={deletingId === deleteTarget.id}
                  onClick={() => void confirmRemoveProvider()}
                  className="bg-[#991b1b] text-white hover:bg-[#7f1d1d]"
                >
                  {deletingId === deleteTarget.id ? "Removing..." : "Remove"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
