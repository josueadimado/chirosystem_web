"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { useAppFeedback } from "@/components/app-feedback";
import { HelpTip } from "@/components/help-tip";
import { Loader } from "@/components/loader";
import { ApiError, apiDelete, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ServiceType = "chiropractic" | "massage";

type Service = {
  id: number;
  name: string;
  description: string;
  duration_minutes: number;
  price: string;
  billing_code: string;
  is_active: boolean;
  /** If false: doctor can still bill it; patients never see it on the booking site. */
  show_in_public_booking?: boolean;
  service_type?: ServiceType;
};

function formatPrice(p: string): string {
  const n = parseFloat(p);
  if (Number.isNaN(n)) return p;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

const emptyForm = {
  name: "",
  billing_code: "",
  duration_minutes: 30,
  price: "0",
  description: "",
  is_active: true,
  show_in_public_booking: true,
  service_type: "chiropractic" as ServiceType,
};

const fieldLabel =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500";
const inputWrap = "rounded-xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100/80 transition focus-within:border-[#16a349]/35 focus-within:ring-2 focus-within:ring-[#16a349]/12";

export default function AdminServicesPage() {
  const { runWithFeedback } = useAppFeedback();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = (await apiGetAuth<Service[]>("/services/")) as Service[];
      setServices(
        data.map((s) => ({
          ...s,
          show_in_public_booking: s.show_in_public_booking !== false,
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
    load();
  }, []);

  const activeCount = useMemo(() => services.filter((s) => s.is_active !== false).length, [services]);
  const inactiveCount = services.length - activeCount;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return services;
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.billing_code || "").toLowerCase().includes(q) ||
        (s.description || "").toLowerCase().includes(q),
    );
  }, [services, search]);

  const startNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setError("");
  };

  const startEdit = (s: Service) => {
    setEditing(s);
    setForm({
      name: s.name,
      billing_code: s.billing_code || "",
      duration_minutes: s.duration_minutes,
      price: String(s.price),
      description: s.description || "",
      is_active: s.is_active !== false,
      show_in_public_booking: s.show_in_public_booking !== false,
      service_type: s.service_type === "massage" ? "massage" : "chiropractic",
    });
    setError("");
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
          billing_code: form.billing_code.trim(),
          duration_minutes: Number(form.duration_minutes) || 30,
          price: form.price,
          description: form.description.trim(),
          is_active: form.is_active,
          show_in_public_booking: form.show_in_public_booking,
          service_type: form.service_type,
        };
        if (editing) {
          await apiPatch(`/services/${editing.id}/`, payload);
        } else {
          await apiPost("/services/", payload);
        }
        await load();
        startNew();
      },
      {
        loadingMessage: isEdit ? "Updating visit type…" : "Adding visit type…",
        successMessage: isEdit ? "Visit type updated." : "New visit type added.",
        errorFallback: "Could not save this service.",
      },
    );
    setIsSaving(false);
  };

  const remove = async (id: number) => {
    if (!confirm("Remove this service? It will no longer appear in booking options.")) return;
    await runWithFeedback(
      async () => {
        await apiDelete(`/services/${id}/`);
        await load();
        if (editing?.id === id) startNew();
      },
      {
        loadingMessage: "Removing visit type…",
        successMessage: "Visit type removed.",
        errorFallback: "Could not delete this service.",
      },
    );
  };

  const formDirty =
    editing !== null &&
    (form.name !== editing.name ||
      (form.billing_code || "") !== (editing.billing_code || "") ||
      form.duration_minutes !== editing.duration_minutes ||
      form.price !== String(editing.price) ||
      (form.description || "") !== (editing.description || "") ||
      form.is_active !== (editing.is_active !== false) ||
      form.show_in_public_booking !== (editing.show_in_public_booking !== false) ||
      form.service_type !== (editing.service_type === "massage" ? "massage" : "chiropractic"));

  const isNew = editing === null;

  return (
    <div className="space-y-6">
      <AdminPageIntro
        title="Services & codes"
        description="Add or edit visit types, prices, and billing codes shown on the public booking site. Use Add visit type for new rows. Turn Active off to hide a visit from online booking and from the provider grid — or delete when nothing should reference it anymore."
        pageHelp={
          <>
            These records power the public booking flow and invoices. <strong>Billing code</strong> is the identifier your clinic uses
            for that visit type (for example a CPT-style code).
            <br />
            <br />
            <strong>Active</strong> means patients can choose this visit type (if a doctor offers it) and it appears as a column on{" "}
            <strong>Admin → Providers & services</strong>. <strong>Inactive</strong> hides it there and on the public booking page; old
            links on provider profiles show a short reminder until you clean them up or turn the service back on.
            <br />
            <br />
            <strong>Visit kind</strong> controls booking rules: chiropractic visits use one assigned doctor; massage lets the patient pick
            from doctors who offer that service.
          </>
        }
      />

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>
      )}

      {!loading && services.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3 stagger-children">
          <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white to-[#ecfdf5]/40 px-4 py-3 shadow-sm ring-1 ring-[#16a349]/10">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#13823d]">Active visit types</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">{activeCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Inactive / hidden</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-700">{inactiveCount}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/90 bg-slate-50/80 px-4 py-3 shadow-sm">
            <button
              type="button"
              onClick={() => void load()}
              className="text-sm font-semibold text-[#16a349] hover:text-[#13823d]"
            >
              Refresh list
            </button>
            <span className="text-slate-300">·</span>
            <Link href="/admin/providers" className="text-sm font-semibold text-slate-600 hover:text-[#0d5c2e]">
              Assign to providers →
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_min(26rem,100%)]">
        {/* List */}
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-200/40 ring-1 ring-slate-100/80">
          <div className="border-b border-slate-200/90 bg-gradient-to-r from-slate-50/90 via-white to-[#ecfdf5]/25 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <AdminSectionLabel help="Search filters the list. Click Edit to load a service into the form, or Add for a blank form.">
                All visit types
              </AdminSectionLabel>
              <button
                type="button"
                onClick={startNew}
                className="shrink-0 rounded-xl bg-[#16a349] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-900/10 transition hover:bg-[#13823d]"
              >
                Add service
              </button>
            </div>
            <div className="mt-3">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, code, or description…"
                className="admin-input w-full max-w-md py-2.5 text-sm"
                aria-label="Filter services"
              />
            </div>
          </div>
          <div className="p-4 sm:p-5">
            {loading ? (
              <div className="flex min-h-[200px] items-center justify-center py-8">
                <Loader variant="page" label="Loading services" sublabel="Fetching visit types from the server…" />
              </div>
            ) : services.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center">
                <p className="font-semibold text-slate-800">No services yet</p>
                <p className="mt-2 text-sm text-slate-500">Add your first visit type to enable booking and provider assignment.</p>
                <button
                  type="button"
                  onClick={startNew}
                  className="mt-6 rounded-xl bg-[#16a349] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d]"
                >
                  Add service
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No services match your search.</p>
            ) : (
              <ul className="space-y-2">
                {filtered.map((s) => {
                  const selected = editing?.id === s.id;
                  const st = s.service_type === "massage" ? "Massage" : "Chiropractic";
                  return (
                    <li key={s.id}>
                      <div
                        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3.5 transition ${
                          selected
                            ? "border-[#16a349]/45 bg-[#ecfdf5]/50 ring-1 ring-[#16a349]/20"
                            : "border-slate-200/90 bg-white hover:border-slate-300/90 hover:bg-slate-50/50"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-900">{s.name}</p>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                              {st}
                            </span>
                            {!s.is_active && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                                Inactive
                              </span>
                            )}
                            {s.is_active && s.show_in_public_booking === false && (
                              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-900">
                                Bill-only
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-slate-500">
                            <span className="tabular-nums">{s.duration_minutes} min</span>
                            <span className="mx-1.5 text-slate-300">·</span>
                            <span className="font-medium text-slate-700">{formatPrice(String(s.price))}</span>
                            {s.billing_code ? (
                              <>
                                <span className="mx-1.5 text-slate-300">·</span>
                                <span className="font-mono text-xs text-slate-500">{s.billing_code}</span>
                              </>
                            ) : null}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(s)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(s.id)}
                            className="rounded-xl border border-rose-200/90 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="xl:sticky xl:top-4 xl:self-start">
          <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-lg shadow-slate-200/30 ring-1 ring-slate-100/80">
            <div className="border-b border-emerald-100/80 bg-gradient-to-br from-[#ecfdf5]/80 via-white to-white px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#13823d]">
                    {isNew ? "Create" : "Editing"}
                  </p>
                  <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                    {isNew ? "New visit type" : editing?.name ?? "Service"}
                  </h2>
                  {!isNew && (
                    <p className="mt-1 text-xs text-slate-500">ID #{editing?.id} · save to update the live booking catalog</p>
                  )}
                </div>
                <HelpTip label="Form overview" align="center">
                  Name, duration, and price are what patients and invoices see. Billing code is internal. Visit kind sets booking rules on
                  the public site. Active turns the row on or off without deleting it.
                </HelpTip>
              </div>
            </div>

            <div className="space-y-5 p-5 sm:p-6">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4 ring-1 ring-slate-100/60">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Basics</p>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="svc-name" className={fieldLabel}>
                      Service name <span className="text-rose-600">*</span>
                    </label>
                    <div className={inputWrap}>
                      <input
                        id="svc-name"
                        className="admin-input border-0 bg-transparent shadow-none ring-0 focus:ring-0"
                        placeholder="e.g. New patient exam"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="svc-desc" className={fieldLabel}>
                      Description <span className="font-normal normal-case text-slate-400">(optional)</span>
                    </label>
                    <div className={inputWrap}>
                      <textarea
                        id="svc-desc"
                        className="admin-input min-h-[5rem] resize-y border-0 bg-transparent shadow-none ring-0 focus:ring-0"
                        placeholder="Short text for staff or future patient-facing copy"
                        rows={3}
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white p-4 ring-1 ring-slate-100/60">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Time & price</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="svc-duration" className={fieldLabel}>
                      Duration (minutes)
                    </label>
                    <div className={inputWrap}>
                      <input
                        id="svc-duration"
                        type="number"
                        min={5}
                        step={5}
                        className="admin-input border-0 bg-transparent shadow-none ring-0 focus:ring-0"
                        value={form.duration_minutes}
                        onChange={(e) => setForm((f) => ({ ...f, duration_minutes: Number(e.target.value) || 0 }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="svc-price" className={fieldLabel}>
                      Price (USD)
                    </label>
                    <div className={inputWrap}>
                      <input
                        id="svc-price"
                        inputMode="decimal"
                        className="admin-input border-0 bg-transparent shadow-none ring-0 focus:ring-0"
                        placeholder="0.00"
                        value={form.price}
                        onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4 ring-1 ring-slate-100/60">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Billing & booking</p>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="svc-code" className={fieldLabel}>
                      Billing / procedure code
                    </label>
                    <div className={inputWrap}>
                      <input
                        id="svc-code"
                        className="admin-input border-0 bg-transparent font-mono text-sm shadow-none ring-0 focus:ring-0"
                        placeholder="e.g. 98941"
                        value={form.billing_code}
                        onChange={(e) => setForm((f) => ({ ...f, billing_code: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="svc-type" className={fieldLabel}>
                      Visit kind
                    </label>
                    <div className={inputWrap}>
                      <select
                        id="svc-type"
                        className="admin-input cursor-pointer border-0 bg-transparent py-3 shadow-none ring-0 focus:ring-0"
                        value={form.service_type}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, service_type: e.target.value as ServiceType }))
                        }
                      >
                        <option value="chiropractic">Chiropractic — one doctor assigned by the clinic</option>
                        <option value="massage">Massage — patient picks from doctors who offer it</option>
                      </select>
                    </div>
                  </div>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200/80 bg-white/80 p-3">
                    <input
                      type="checkbox"
                      checked={form.show_in_public_booking}
                      onChange={(e) => setForm((f) => ({ ...f, show_in_public_booking: e.target.checked }))}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[#16a349] focus:ring-[#16a349]"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">Show on public booking website</span>
                      <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                        Uncheck for CPT / fee rows that only appear on the doctor&apos;s visit bill (like modalities and no-show fees).
                        Those stay available in the doctor dashboard for clicking onto the bill.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-[#16a349]/20 bg-[#ecfdf5]/35 p-4 ring-1 ring-emerald-100/50">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[#16a349] focus:ring-[#16a349]"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[#0d5c2e]">Active (usable in the system)</span>
                    <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                      Inactive rows are hidden everywhere—including the doctor bill picker—until you turn them back on.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={isSaving}
                  className="rounded-xl bg-[#16a349] px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-900/10 transition hover:bg-[#13823d] disabled:opacity-50"
                >
                  {isSaving ? "Saving…" : isNew ? "Create visit type" : "Save changes"}
                </button>
                {!isNew && (
                  <button
                    type="button"
                    disabled={!formDirty || isSaving}
                    onClick={() => editing && startEdit(editing)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
                  >
                    Reset
                  </button>
                )}
                <HelpTip label="Save">
                  Writes to the server and refreshes the list. New rows appear immediately for provider assignment if active.
                </HelpTip>
              </div>
              {!isNew && formDirty && (
                <span className="text-xs font-medium text-amber-800">You have unsaved changes</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
