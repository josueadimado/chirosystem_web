"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { useAppFeedback } from "@/components/app-feedback";
import { HelpTip } from "@/components/help-tip";
import { IconStethoscope } from "@/components/icons";
import { Loader } from "@/components/loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ApiError, apiDelete, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Provider = {
  id: number;
  username?: string;
  provider_name: string;
  /** Local edit for the name shown on schedules (maps to login profile full_name); cleared when the list reloads. */
  localDisplayName?: string;
  title: string;
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
  specialty: "",
  notification_phone: "",
  services: [] as number[],
};

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
  const [activeTogglingId, setActiveTogglingId] = useState<number | null>(null);
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [transferFrom, setTransferFrom] = useState<Provider | null>(null);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  /** Open “Edit provider” dialog for this id (null = closed). */
  const [editingProviderId, setEditingProviderId] = useState<number | null>(null);

  const bookableServices = useMemo(() => services.filter((s) => s.is_active), [services]);
  const bookableIds = useMemo(() => new Set(bookableServices.map((s) => s.id)), [bookableServices]);

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
          display_name: displayNameFor(provider).trim(),
        });
        await load("refresh");
      },
      {
        loadingMessage: "Saving this doctor’s row…",
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
        loadingMessage: "Moving appointments and visits to the other doctor…",
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
        loadingMessage: nextActive ? "Showing doctor on the public list…" : "Hiding doctor from booking…",
        successMessage: nextActive ? "Doctor is active for booking again." : "Doctor hidden from booking (still in the system).",
        errorFallback: "Could not update listing status.",
      },
    );
    setActiveTogglingId(null);
  };

  const removeProvider = async (provider: Provider) => {
    if (
      !window.confirm(
        `Remove doctor “${provider.provider_name}” and their login? This cannot be undone. If the server blocks this because of past appointments, use “Transfer visits…” first to move history to another doctor, then try again. You can also Deactivate to hide them from booking without deleting.`,
      )
    ) {
      return;
    }
    setDeletingId(provider.id);
    setError("");
    await runWithFeedback(
      async () => {
        await apiDelete(`/providers/${provider.id}/`);
        setProviders((prev) => prev.filter((p) => p.id !== provider.id));
      },
      {
        loadingMessage: "Removing doctor account…",
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
        loadingMessage: "Creating doctor login…",
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

  const serviceCountLabel = (p: Provider) => {
    const n = p.services.length;
    return `${n} visit type${n === 1 ? "" : "s"} on booking site`;
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

  return (
    <div className="space-y-6">
      <AdminPageIntro
        title="Providers & services"
        description="Manage doctor accounts and who shows on the public booking website. The clinic’s billable procedures live under Services & codes; during a visit, doctors build the printable patient bill from that full list on their dashboard—not from these checkboxes."
        pageHelp={
          <>
            <strong>Add doctor</strong> creates a new login (username + password). Use <strong>Edit provider</strong> for display name, SMS,
            and <strong>which visit types list this doctor on the website</strong> when patients book online.
            <br />
            <br />
            <strong>Patient bill:</strong> when a doctor is in an active visit, they add or remove procedures (CPT lines) from the{" "}
            <em>whole</em> active clinic catalog, then complete the visit to print the bill. That workflow is on the doctor dashboard, not
            here.
            <br />
            <br />
            <strong>Checkboxes here</strong> only control the online booking screen: for each visit type, which doctors patients can choose.
            They do <em>not</em> limit what can be charged on the bill.
            <br />
            <br />
            <strong>Alert SMS</strong> is the doctor&apos;s mobile for automated texts (Twilio on the server + Celery must be running).
          </>
        }
      />

      {!loading && services.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3 stagger-children">
          <div className="rounded-2xl border border-border/90 bg-gradient-to-br from-card to-primary/[0.06] px-4 py-3 shadow-sm ring-1 ring-primary/10">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Listed providers</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">{providers.length}</p>
            <p className="mt-1 text-xs text-slate-500">
              {providers.filter((p) => p.active).length} active · {providers.filter((p) => !p.active).length} inactive
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Active visit types</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">{bookableServices.length}</p>
            {services.length !== bookableServices.length && (
              <p className="mt-1 text-xs text-amber-700">
                {services.length - bookableServices.length} service(s) hidden (inactive) — turn them on or delete under Services & codes.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-2xl border border-slate-200/90 bg-slate-50/80 px-4 py-3 shadow-sm sm:col-span-1">
            <button
              type="button"
              onClick={() => {
                setError("");
                setAddForm({ ...emptyAddForm, services: [] });
                setAddOpen(true);
              }}
              className="text-sm font-semibold text-primary hover:text-primary/80"
            >
              Add doctor
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => void load("refresh")}
              disabled={refreshing}
              className="text-sm font-semibold text-muted-foreground hover:text-primary disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <span className="text-slate-300">·</span>
            <Link href="/admin/services" className="text-sm font-semibold text-muted-foreground hover:text-primary">
              Edit services
            </Link>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>
      )}

      {loading ? (
        <div className="admin-panel flex min-h-[240px] items-center justify-center py-12">
          <Loader variant="page" label="Loading providers" sublabel="Syncing doctors and services…" />
        </div>
      ) : services.length === 0 ? (
        <div className="admin-panel text-center">
          <div className="mx-auto flex max-w-md flex-col items-center py-10">
            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <IconStethoscope className="h-8 w-8" />
            </span>
            <p className="text-base font-semibold text-slate-800">No services yet</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Add at least one service before you can assign providers to bookable visit types.
            </p>
            <Link
              href="/admin/services"
              className={cn(
                buttonVariants({ variant: "default" }),
                "mt-6 inline-flex h-auto rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm",
              )}
            >
              Go to Services & codes
            </Link>
          </div>
        </div>
      ) : bookableServices.length === 0 ? (
        <div className="admin-panel text-center">
          <div className="mx-auto flex max-w-md flex-col items-center py-10">
            <p className="text-base font-semibold text-slate-800">No active visit types</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Every service is marked inactive, so there is nothing to assign yet. Turn visit types back on or delete ones you
              don&apos;t use under Services & codes. You can still add a doctor now and assign services later.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
              <Link
                href="/admin/services"
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "inline-flex h-auto rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm",
                )}
              >
                Go to Services & codes
              </Link>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setAddForm({ ...emptyAddForm, services: [] });
                  setAddOpen(true);
                }}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "inline-flex h-auto rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm",
                )}
              >
                Add doctor
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-200/30 ring-1 ring-slate-100/80">
            <div className="border-b border-border/90 bg-gradient-to-r from-muted/40 via-card to-primary/[0.05] px-5 py-4">
              <AdminSectionLabel help="Each card is one doctor. Edit opens a form for name, SMS, and which visit types show this doctor on the public booking site. Transfer and remove stay inside that form.">
                Providers
              </AdminSectionLabel>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className="flex flex-col rounded-2xl border border-border/90 bg-card p-4 shadow-sm ring-1 ring-foreground/[0.04] transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-base font-bold text-teal-800 shadow-inner">
                      {providerInitial(provider.provider_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">{provider.provider_name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{serviceCountLabel(provider)}</p>
                      {provider.username ? (
                        <p className="mt-1 font-mono text-[10px] text-slate-400">Login: {provider.username}</p>
                      ) : null}
                      {(provider.title || provider.specialty) && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                          {[provider.title, provider.specialty].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            provider.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {provider.active ? "On public list" : "Hidden from booking"}
                        </span>
                        {legacyServiceCount(provider) > 0 ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                            {legacyServiceCount(provider)} legacy type(s)
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    className="mt-4 h-auto w-full rounded-xl py-2.5 text-sm font-semibold shadow-sm"
                    onClick={() => {
                      setError("");
                      setEditingProviderId(provider.id);
                    }}
                  >
                    Edit provider
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Dialog open={editingProviderId !== null} onOpenChange={onEditDialogOpenChange}>
            <DialogContent
              showCloseButton={!editorProvider || savingId !== editorProvider.id}
              className={cn(
                "gap-0 border-slate-200 p-0 sm:max-w-2xl",
                "flex max-h-[min(90dvh,52rem)] flex-col overflow-hidden",
              )}
            >
              {editorProvider ? (
                <>
                  <div className="border-b border-emerald-100/70 bg-gradient-to-br from-[#ecfdf5]/50 via-white to-white px-5 py-4 sm:px-6">
                    <DialogHeader className="space-y-1 text-left">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#13823d]">Edit provider</p>
                      <DialogTitle className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                        {editorProvider.provider_name}
                      </DialogTitle>
                      <DialogDescription className="text-sm text-slate-600">
                        Update display name, SMS alerts, and which online visit types list this doctor when patients book. Login username is
                        not changed here. The in-room patient bill is built on the doctor dashboard from the full clinic service list.
                      </DialogDescription>
                      {editorProvider.username ? (
                        <p className="pt-1 font-mono text-xs text-slate-500">Username: {editorProvider.username}</p>
                      ) : null}
                    </DialogHeader>
                  </div>

                  <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
                    {legacyServiceCount(editorProvider) > 0 && (
                      <p className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs font-medium text-amber-900">
                        Still linked to {legacyServiceCount(editorProvider)} inactive visit type(s). Turn those services back on or clean up
                        under Services & codes.
                      </p>
                    )}

                    <div>
                      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Display name
                        <HelpTip label="Display name">
                          Shown on the admin schedule, patient booking, and printed materials. Does not change their login username.
                        </HelpTip>
                      </label>
                      <input
                        type="text"
                        className="admin-input py-2.5 text-sm"
                        value={displayNameFor(editorProvider)}
                        onChange={(e) => setProviderDisplayName(editorProvider, e.target.value)}
                        aria-label={`Display name for ${editorProvider.provider_name}`}
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Alert SMS
                        <HelpTip label="Alert SMS">
                          US 10 digits or +1… — Twilio sends check-in and schedule alerts to this number when configured on the server.
                        </HelpTip>
                      </label>
                      <input
                        type="tel"
                        value={editorProvider.notification_phone ?? ""}
                        onChange={(e) => setNotificationPhone(editorProvider, e.target.value)}
                        placeholder="+1 or 10 digits"
                        className="admin-input py-2.5 text-sm"
                        aria-label={`SMS alert for ${editorProvider.provider_name}`}
                      />
                    </div>

                    <div className="rounded-xl border border-sky-200/80 bg-sky-50/90 px-3 py-2.5 text-xs leading-relaxed text-sky-950">
                      <span className="font-semibold">Website booking only.</span> These choices decide when this doctor appears as an option
                      after a patient picks a visit type online. The printable patient bill is filled during the visit on the doctor
                      dashboard using every active procedure from Services & codes—not limited by this list.
                    </div>

                    <div>
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Show on booking site for these visit types
                        <HelpTip label="Online booking list">
                          The clinic defines all services under Services & codes. Check a box so this doctor is offered when a patient
                          books that visit type on the website. Unchecked means they won&apos;t appear for that type online—it does not
                          stop them from adding that procedure to the bill during a visit.
                        </HelpTip>
                      </p>
                      <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-200/90 bg-slate-50/60 p-3 sm:max-h-64">
                        {bookableServices.map((s) => (
                          <label
                            key={s.id}
                            className="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent bg-white px-3 py-2.5 shadow-sm transition hover:border-primary/25 hover:bg-primary/[0.03]"
                          >
                            <input
                              type="checkbox"
                              checked={editorProvider.services.includes(s.id)}
                              onChange={() => toggleService(editorProvider, s.id)}
                              className="h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-primary/40"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-800">{s.name}</p>
                              <p className="text-xs text-slate-500">
                                {s.duration_minutes} min · {formatPrice(s.price)}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Public booking list</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {editorProvider.active
                          ? "When active, this doctor can appear on the public booking flow (still only for visit types you checked above)."
                          : "Inactive doctors stay in the system but are hidden from the booking site until you activate them again."}
                      </p>
                      <button
                        type="button"
                        onClick={() => void toggleProviderActive(editorProvider)}
                        disabled={activeTogglingId === editorProvider.id}
                        className={cn(
                          "mt-3 inline-flex rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50",
                          editorProvider.active
                            ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            : "bg-slate-800 text-white hover:bg-slate-900",
                        )}
                      >
                        {activeTogglingId === editorProvider.id
                          ? "Updating…"
                          : editorProvider.active
                            ? "Deactivate (hide from booking)"
                            : "Activate (show on booking)"}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 border-t border-border/60 bg-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                      <button
                        type="button"
                        className="font-semibold text-primary underline-offset-2 hover:underline"
                        onClick={() => {
                          setEditingProviderId(null);
                          setError("");
                          setTransferTargetId("");
                          setTransferFrom(editorProvider);
                        }}
                      >
                        Transfer visit history…
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === editorProvider.id}
                        className="font-semibold text-rose-600 underline-offset-2 hover:underline disabled:opacity-50"
                        onClick={() => void removeProvider(editorProvider)}
                      >
                        {deletingId === editorProvider.id ? "Removing…" : "Remove doctor…"}
                      </button>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={savingId === editorProvider.id}
                        className="h-auto rounded-xl px-4 py-2.5 text-sm font-semibold"
                        onClick={() => setEditingProviderId(null)}
                      >
                        Close
                      </Button>
                      <Button
                        type="button"
                        disabled={savingId === editorProvider.id}
                        className="h-auto rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm"
                        onClick={() => void saveProvider(editorProvider)}
                      >
                        {savingId === editorProvider.id ? "Saving…" : "Save changes"}
                      </Button>
                    </div>
                  </div>
                </>
              ) : null}
            </DialogContent>
          </Dialog>
        </>
      )}

      <Dialog open={addOpen} onOpenChange={onAddDialogOpenChange}>
        <DialogContent showCloseButton={!addSubmitting} className="gap-0 border-slate-200">
          <DialogHeader>
            <DialogTitle id="add-doctor-title">Add doctor</DialogTitle>
            <DialogDescription>
              Creates a new staff login. They sign in with the username and password you set here.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Username</label>
                <input
                  type="text"
                  autoComplete="username"
                  value={addForm.new_username}
                  onChange={(e) => setAddForm((f) => ({ ...f, new_username: e.target.value }))}
                  className="admin-input w-full py-2.5 text-sm"
                  placeholder="e.g. dr.smith"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password (min 8 characters)</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={addForm.new_password}
                  onChange={(e) => setAddForm((f) => ({ ...f, new_password: e.target.value }))}
                  className="admin-input w-full py-2.5 text-sm"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Display name (optional)</label>
                <input
                  type="text"
                  value={addForm.new_full_name}
                  onChange={(e) => setAddForm((f) => ({ ...f, new_full_name: e.target.value }))}
                  className="admin-input w-full py-2.5 text-sm"
                  placeholder="Dr. Jane Smith"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email (optional)</label>
                <input
                  type="email"
                  value={addForm.new_email}
                  onChange={(e) => setAddForm((f) => ({ ...f, new_email: e.target.value }))}
                  className="admin-input w-full py-2.5 text-sm"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Title (optional)</label>
                  <input
                    type="text"
                    value={addForm.title}
                    onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))}
                    className="admin-input w-full py-2.5 text-sm"
                    placeholder="DC"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Specialty (optional)</label>
                  <input
                    type="text"
                    value={addForm.specialty}
                    onChange={(e) => setAddForm((f) => ({ ...f, specialty: e.target.value }))}
                    className="admin-input w-full py-2.5 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Alert SMS (optional)</label>
                <input
                  type="tel"
                  value={addForm.notification_phone}
                  onChange={(e) => setAddForm((f) => ({ ...f, notification_phone: e.target.value }))}
                  className="admin-input w-full py-2.5 text-sm"
                  placeholder="+1 or 10 digits"
                />
              </div>
              {bookableServices.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    List on booking site for these visit types
                  </p>
                  <p className="mb-2 text-[11px] leading-snug text-slate-500">
                    Optional. Patients only see this doctor for checked types when booking online. Does not affect the in-room patient bill.
                  </p>
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-slate-200/90 bg-slate-50/50 p-3">
                    {bookableServices.map((s) => (
                      <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={addForm.services.includes(s.id)}
                          onChange={() => toggleAddFormService(s.id)}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
                        />
                        <span className="text-slate-800">{s.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={addSubmitting}
              onClick={() => setAddOpen(false)}
              className="h-auto rounded-xl px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={addSubmitting}
              onClick={() => void submitAddDoctor()}
              className="h-auto rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm"
            >
              {addSubmitting ? "Adding…" : "Create doctor"}
            </Button>
          </div>
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
        <DialogContent showCloseButton={!transferSubmitting} className="gap-0 border-slate-200">
          <DialogHeader>
            <DialogTitle>Transfer visit history</DialogTitle>
            <DialogDescription>
              Moves every appointment and visit record from{" "}
              <span className="font-semibold text-slate-800">{transferFrom?.provider_name ?? "this doctor"}</span> to the doctor you pick
              below. Use this when you need to remove someone but the system says they still have history on file. This does not merge
              accounts—it only reassigns past rows in the database.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Move all history to</label>
              {providers.filter((p) => p.id !== transferFrom?.id).length === 0 ? (
                <p className="text-sm text-amber-800">Add another doctor first, then you can transfer history to them.</p>
              ) : (
                <select
                  className="admin-input w-full py-2.5 text-sm"
                  value={transferTargetId}
                  onChange={(e) => setTransferTargetId(e.target.value)}
                  aria-label="Target doctor for transferred history"
                >
                  <option value="">Choose a doctor…</option>
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
            </div>
          </div>
          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={transferSubmitting}
              onClick={() => {
                setTransferFrom(null);
                setTransferTargetId("");
              }}
              className="h-auto rounded-xl px-4 py-2.5 text-sm font-semibold"
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
              className="h-auto rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm"
            >
              {transferSubmitting ? "Transferring…" : "Transfer all history"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
