"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { HelpTip } from "@/components/help-tip";
import { IconStethoscope } from "@/components/icons";
import { Loader } from "@/components/loader";
import { ApiError, apiDelete, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Provider = {
  id: number;
  username?: string;
  provider_name: string;
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
  const [providers, setProviders] = useState<Provider[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addModalPortalReady, setAddModalPortalReady] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [activeTogglingId, setActiveTogglingId] = useState<number | null>(null);
  const [addForm, setAddForm] = useState(emptyAddForm);

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

  useEffect(() => {
    setAddModalPortalReady(true);
  }, []);

  const toggleService = (provider: Provider, serviceId: number) => {
    const has = provider.services.includes(serviceId);
    const next = has ? provider.services.filter((s) => s !== serviceId) : [...provider.services, serviceId];
    setProviders((prev) => prev.map((p) => (p.id === provider.id ? { ...p, services: next } : p)));
  };

  const setNotificationPhone = (provider: Provider, value: string) => {
    setProviders((prev) => prev.map((p) => (p.id === provider.id ? { ...p, notification_phone: value } : p)));
  };

  const saveProvider = async (provider: Provider) => {
    setSavingId(provider.id);
    setError("");
    try {
      await apiPatch(`/providers/${provider.id}/`, {
        services: provider.services,
        notification_phone: provider.notification_phone?.trim() ?? "",
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save.");
    } finally {
      setSavingId(null);
    }
  };

  const toggleProviderActive = async (provider: Provider) => {
    setActiveTogglingId(provider.id);
    setError("");
    try {
      await apiPatch(`/providers/${provider.id}/`, { active: !provider.active });
      setProviders((prev) => prev.map((p) => (p.id === provider.id ? { ...p, active: !p.active } : p)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update listing status.");
    } finally {
      setActiveTogglingId(null);
    }
  };

  const removeProvider = async (provider: Provider) => {
    if (
      !window.confirm(
        `Remove doctor “${provider.provider_name}” and their login? This cannot be undone. If they have appointments or visit history on file, the server will block this — use Deactivate instead.`,
      )
    ) {
      return;
    }
    setDeletingId(provider.id);
    setError("");
    try {
      await apiDelete(`/providers/${provider.id}/`);
      setProviders((prev) => prev.filter((p) => p.id !== provider.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not remove this provider.");
    } finally {
      setDeletingId(null);
    }
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
      setError("Choose a username and password with at least 8 characters.");
      return;
    }
    setAddSubmitting(true);
    setError("");
    try {
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
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add this doctor.");
    } finally {
      setAddSubmitting(false);
    }
  };

  const legacyServiceCount = (p: Provider) => p.services.filter((id) => !bookableIds.has(id)).length;

  const serviceCountLabel = (p: Provider) => {
    const n = p.services.length;
    return `${n} service${n === 1 ? "" : "s"}`;
  };

  return (
    <div className="space-y-6">
      <AdminPageIntro
        title="Providers & services"
        description="Add or remove doctors, turn a doctor off the public list without deleting them, and choose which active visit types each doctor can be booked for. Clean up old visit types under Services & codes."
        pageHelp={
          <>
            <strong>Add doctor</strong> creates a new login (username + password). <strong>Deactivate</strong> hides them from booking;{" "}
            <strong>Remove</strong> deletes their login only if they have no appointments on file.
            <br />
            <br />
            <strong>Service checkboxes</strong> only list active services. Patients only see providers who offer the service they pick.
            <br />
            <br />
            <strong>Alert SMS</strong> is the doctor&apos;s mobile number for automated texts (Twilio on the server + Celery must be
            running).
          </>
        }
      />

      {!loading && services.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3 stagger-children">
          <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white to-[#ecfdf5]/40 px-4 py-3 shadow-sm ring-1 ring-[#16a349]/10">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#13823d]">Listed providers</p>
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
              className="text-sm font-semibold text-[#16a349] hover:text-[#13823d]"
            >
              Add doctor
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => void load("refresh")}
              disabled={refreshing}
              className="text-sm font-semibold text-slate-600 hover:text-[#0d5c2e] disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <span className="text-slate-300">·</span>
            <Link href="/admin/services" className="text-sm font-semibold text-slate-600 hover:text-[#0d5c2e]">
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
              className="mt-6 inline-flex rounded-xl bg-[#16a349] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d]"
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
              Every service is marked inactive, so there is nothing to assign in the grid. Turn visit types back on or delete ones you
              don&apos;t use under Services & codes. You can still add a doctor now and assign services later.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
              <Link
                href="/admin/services"
                className="inline-flex rounded-xl bg-[#16a349] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d]"
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
                className="inline-flex rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Add doctor
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop: wide assignment table */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-200/40 ring-1 ring-slate-100/80 lg:block">
            <div className="border-b border-slate-200/90 bg-gradient-to-r from-slate-50/90 via-white to-[#ecfdf5]/30 px-5 py-4">
              <AdminSectionLabel help="One row per doctor. Only active visit types appear as columns. Save writes that row; Deactivate hides the doctor from booking; Remove deletes their account if allowed.">
                Assignment grid
              </AdminSectionLabel>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/95 text-left text-slate-600">
                    <th className="sticky left-0 z-10 min-w-[11rem] bg-slate-50/95 px-4 py-3 pl-5 text-xs font-bold uppercase tracking-wide text-slate-500 backdrop-blur-sm">
                      Provider
                    </th>
                    <th className="min-w-[10rem] whitespace-nowrap px-3 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        Alert SMS
                        <HelpTip label="What is Alert SMS?">
                          Phone number (US 10 digits or +1…) where this doctor receives SMS when a patient checks in at the kiosk or an
                          appointment on their calendar is created or updated.
                        </HelpTip>
                      </span>
                    </th>
                    {bookableServices.map((s) => (
                      <th key={s.id} className="min-w-[5.5rem] px-2 py-3 text-center">
                        <span className="mx-auto flex max-w-[7rem] flex-col items-center gap-0.5">
                          <span className="text-xs font-bold leading-tight text-slate-800">{s.name}</span>
                          <span className="text-[10px] font-medium text-slate-400">
                            {s.duration_minutes} min · {formatPrice(s.price)}
                          </span>
                        </span>
                      </th>
                    ))}
                    <th className="w-32 min-w-[8rem] px-2 py-3 text-center text-xs font-bold uppercase tracking-wide text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        Listing
                        <HelpTip label="Active listing">
                          Active doctors can be booked (if they offer the service). Inactive stays in the system but is hidden from
                          patients.
                        </HelpTip>
                      </span>
                    </th>
                    <th className="w-28 min-w-[7rem] px-3 py-3 text-right">
                      <span className="inline-flex items-center justify-end gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                        Save
                        <HelpTip label="What does Save do?">
                          Writes this row&apos;s service list and alert number to the database. Other rows are unchanged until you save
                          them too.
                        </HelpTip>
                      </span>
                    </th>
                    <th className="w-24 min-w-[5.5rem] px-3 py-3 pr-5 text-right text-xs font-bold uppercase tracking-wide text-rose-700/90">
                      Remove
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {providers.map((provider, rowIdx) => (
                    <tr
                      key={provider.id}
                      className={`transition-colors ${rowIdx % 2 === 0 ? "bg-white" : "bg-slate-50/40"} hover:bg-[#16a349]/[0.04]`}
                    >
                      <td
                        className={`sticky left-0 z-10 border-r border-slate-100 px-4 py-4 pl-5 backdrop-blur-sm ${
                          rowIdx % 2 === 0 ? "bg-white/98" : "bg-slate-50/90"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#16a349]/15 text-sm font-bold text-[#0d5c2e] shadow-inner">
                            {providerInitial(provider.provider_name)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">{provider.provider_name}</p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2">
                              <span className="text-xs text-slate-500">{serviceCountLabel(provider)}</span>
                              {!provider.active && (
                                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                                  Inactive
                                </span>
                              )}
                            </div>
                            {provider.username && (
                              <p className="mt-0.5 font-mono text-[10px] text-slate-400">Login: {provider.username}</p>
                            )}
                            {legacyServiceCount(provider) > 0 && (
                              <p className="mt-1 text-[10px] font-medium text-amber-800">
                                Still linked to {legacyServiceCount(provider)} inactive visit type(s) — clean up under Edit services.
                              </p>
                            )}
                            {(provider.title || provider.specialty) && (
                              <p className="mt-1 line-clamp-1 text-xs text-slate-400">
                                {[provider.title, provider.specialty].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="align-top px-3 py-4">
                        <input
                          type="tel"
                          value={provider.notification_phone ?? ""}
                          onChange={(e) => setNotificationPhone(provider, e.target.value)}
                          placeholder="+1 or 10 digits"
                          className="admin-input w-full min-w-[9rem] max-w-[11rem] py-2 text-xs"
                          aria-label={`SMS alert number for ${provider.provider_name}`}
                        />
                      </td>
                      {bookableServices.map((s) => (
                        <td key={s.id} className="px-1 py-4 text-center align-middle">
                          <label className="inline-flex cursor-pointer items-center justify-center rounded-lg p-1.5 transition hover:bg-[#16a349]/10">
                            <input
                              type="checkbox"
                              checked={provider.services.includes(s.id)}
                              onChange={() => toggleService(provider, s.id)}
                              className="h-4 w-4 rounded border-slate-300 text-[#16a349] focus:ring-[#16a349]"
                            />
                            <span className="sr-only">
                              {provider.provider_name} offers {s.name}
                            </span>
                          </label>
                        </td>
                      ))}
                      <td className="px-2 py-4 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => void toggleProviderActive(provider)}
                          disabled={activeTogglingId === provider.id}
                          className={`inline-flex rounded-lg px-3 py-1.5 text-[11px] font-semibold transition disabled:opacity-50 ${
                            provider.active
                              ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                              : "bg-slate-700 text-white hover:bg-slate-800"
                          }`}
                        >
                          {activeTogglingId === provider.id ? "…" : provider.active ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                      <td className="px-3 py-4 text-right align-middle">
                        <button
                          type="button"
                          onClick={() => saveProvider(provider)}
                          disabled={savingId === provider.id}
                          className="inline-flex rounded-xl bg-[#16a349] px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-emerald-900/10 transition hover:bg-[#13823d] disabled:opacity-50"
                        >
                          {savingId === provider.id ? "Saving…" : "Save row"}
                        </button>
                      </td>
                      <td className="px-3 py-4 pr-5 text-right align-middle">
                        <button
                          type="button"
                          onClick={() => void removeProvider(provider)}
                          disabled={deletingId === provider.id}
                          className="text-xs font-semibold text-rose-600 underline-offset-2 hover:underline disabled:opacity-50"
                        >
                          {deletingId === provider.id ? "…" : "Remove…"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile / tablet: one card per provider */}
          <div className="space-y-4 lg:hidden">
            <AdminSectionLabel help="Same data as the desktop grid—optimized for small screens.">
              Providers
            </AdminSectionLabel>
            {providers.map((provider) => (
              <div
                key={provider.id}
                className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100/80"
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-[#ecfdf5]/50 to-white px-4 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#16a349]/15 text-base font-bold text-[#0d5c2e]">
                      {providerInitial(provider.provider_name)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900">{provider.provider_name}</p>
                      <p className="text-xs text-slate-500">{serviceCountLabel(provider)}</p>
                      {provider.username && (
                        <p className="mt-0.5 font-mono text-[10px] text-slate-400">Login: {provider.username}</p>
                      )}
                      {!provider.active && (
                        <span className="mt-1 inline-block rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                          Inactive
                        </span>
                      )}
                      {legacyServiceCount(provider) > 0 && (
                        <p className="mt-1 text-[10px] font-medium text-amber-800">
                          Linked to {legacyServiceCount(provider)} inactive visit type(s).
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <button
                      type="button"
                      onClick={() => saveProvider(provider)}
                      disabled={savingId === provider.id}
                      className="rounded-xl bg-[#16a349] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
                    >
                      {savingId === provider.id ? "…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleProviderActive(provider)}
                      disabled={activeTogglingId === provider.id}
                      className="text-xs font-semibold text-slate-600 underline-offset-2 hover:underline disabled:opacity-50"
                    >
                      {provider.active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeProvider(provider)}
                      disabled={deletingId === provider.id}
                      className="text-xs font-semibold text-rose-600 underline-offset-2 hover:underline disabled:opacity-50"
                    >
                      Remove…
                    </button>
                  </div>
                </div>
                <div className="space-y-3 px-4 py-4">
                  <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Alert SMS
                      <HelpTip label="Alert SMS" align="center">
                        Mobile number for Twilio alerts (check-in and schedule changes).
                      </HelpTip>
                    </label>
                    <input
                      type="tel"
                      value={provider.notification_phone ?? ""}
                      onChange={(e) => setNotificationPhone(provider, e.target.value)}
                      placeholder="+1 or 10 digits"
                      className="admin-input py-2.5 text-sm"
                      aria-label={`SMS for ${provider.provider_name}`}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Services offered</p>
                    <div className="flex flex-col gap-2">
                      {bookableServices.map((s) => (
                        <label
                          key={s.id}
                          className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200/90 bg-slate-50/50 px-3 py-2.5 transition hover:border-[#16a349]/30 hover:bg-[#16a349]/5"
                        >
                          <input
                            type="checkbox"
                            checked={provider.services.includes(s.id)}
                            onChange={() => toggleService(provider, s.id)}
                            className="h-4 w-4 shrink-0 rounded border-slate-300 text-[#16a349] focus:ring-[#16a349]"
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
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {addModalPortalReady &&
        addOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] overflow-y-auto overscroll-contain bg-slate-900/40"
            role="presentation"
            onClick={() => {
              if (!addSubmitting) setAddOpen(false);
            }}
          >
            <div className="flex min-h-full items-center justify-center px-4 pb-10 pt-[max(5.5rem,env(safe-area-inset-top,0px)+4.5rem)] sm:pb-12 sm:pt-24">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-doctor-title"
                className="w-full max-w-lg max-h-[min(calc(100dvh-7rem),42rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
            <h2 id="add-doctor-title" className="text-lg font-bold text-slate-900">
              Add doctor
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Creates a new staff login. They sign in with the username and password you set here.
            </p>

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
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Bookable visit types now</p>
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-slate-200/90 bg-slate-50/50 p-3">
                    {bookableServices.map((s) => (
                      <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={addForm.services.includes(s.id)}
                          onChange={() => toggleAddFormService(s.id)}
                          className="h-4 w-4 rounded border-slate-300 text-[#16a349]"
                        />
                        <span className="text-slate-800">{s.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={addSubmitting}
                onClick={() => setAddOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={addSubmitting}
                onClick={() => void submitAddDoctor()}
                className="rounded-xl bg-[#16a349] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
              >
                {addSubmitting ? "Adding…" : "Create doctor"}
              </button>
            </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
