"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { useAppFeedback } from "@/components/app-feedback";
import { HelpTip } from "@/components/help-tip";
import { Loader } from "@/components/loader";
import { ApiError, apiDelete, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ServiceType = "chiropractic" | "massage";

type Service = {
  id: number;
  name: string;
  /** If set, patients see this on the booking site & confirmations instead of name. Staff still see name. */
  public_booking_name?: string;
  description: string;
  duration_minutes: number;
  price: string;
  billing_code: string;
  is_active: boolean;
  /** If false: doctor can still bill it; patients never see it on the booking site. */
  show_in_public_booking?: boolean;
  /** In-room bill: chiropractic doctors see this line when true. */
  visible_to_chiropractic_staff?: boolean;
  /** In-room bill: massage therapists see this line when true. */
  visible_to_massage_staff?: boolean;
  service_type?: ServiceType;
  /** Chiropractic-only: marks the service as new-patient intake (booking site / eligibility logic). */
  is_new_client_intake?: boolean;
  /** If false: line appears on printed bill for insurance but does not add to patient invoice total. */
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

const fieldLabel =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500";
const inputWrap = "rounded-xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100/80 transition focus-within:border-[#16a349]/35 focus-within:ring-2 focus-within:ring-[#16a349]/12";

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
  type QuickFilter = "all" | "active" | "inactive" | "chiropractic" | "massage";
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");

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
    load();
  }, []);

  const activeCount = useMemo(() => services.filter((s) => s.is_active !== false).length, [services]);
  const inactiveCount = services.length - activeCount;

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

  const listSummary = useMemo(() => {
    const total = services.length;
    const n = filtered.length;
    if (total === 0) return null;
    if (n === total && !search.trim() && quickFilter === "all") {
      return `Showing all ${total} visit type${total === 1 ? "" : "s"}`;
    }
    return `Showing ${n} of ${total} visit type${total === 1 ? "" : "s"}`;
  }, [services.length, filtered.length, search, quickFilter]);

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
        if (editing?.id === id) closeForm();
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
      (form.public_booking_name || "").trim() !== (editing.public_booking_name || "").trim() ||
      (form.billing_code || "") !== (editing.billing_code || "") ||
      form.duration_minutes !== editing.duration_minutes ||
      form.price !== String(editing.price) ||
      (form.description || "") !== (editing.description || "") ||
      form.is_active !== (editing.is_active !== false) ||
      form.show_in_public_booking !== (editing.show_in_public_booking !== false) ||
      form.visible_to_chiropractic_staff !== (editing.visible_to_chiropractic_staff !== false) ||
      form.visible_to_massage_staff !== (editing.visible_to_massage_staff !== false) ||
      form.service_type !== (editing.service_type === "massage" ? "massage" : "chiropractic") ||
      (form.service_type === "chiropractic" && form.is_new_client_intake !== (editing.is_new_client_intake === true)) ||
      form.charges_patient !== (editing.charges_patient !== false));

  const isNew = editing === null;

  return (
    <div className="space-y-6">
      <AdminPageIntro
        title="Services & codes"
        description="Manage visit types: duration, price, billing code, and where each one appears (booking site, doctor bill, chiro vs massage)."
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

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-200/40 ring-1 ring-slate-100/80">
          <div className="sticky top-0 z-10 border-b border-slate-200/90 bg-white/95 px-5 py-4 backdrop-blur supports-[backdrop-filter]:bg-white/85">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <AdminSectionLabel help="Use filters and search to narrow the list. Edit or Add service opens a popup form — close with Esc, X, or Cancel when done.">
                Visit types
              </AdminSectionLabel>
              <button
                type="button"
                onClick={openCreate}
                className="shrink-0 rounded-xl bg-[#16a349] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-900/10 transition hover:bg-[#13823d]"
              >
                Add service
              </button>
            </div>
            <div className="relative mt-3 max-w-lg">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, patient label, code…"
                className="admin-input w-full py-2.5 pr-10 text-sm"
                aria-label="Filter services"
              />
              {search.trim() ? (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                >
                  <span className="text-lg leading-none" aria-hidden>
                    ×
                  </span>
                </button>
              ) : null}
            </div>
            {services.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    { id: "all" as const, label: "All" },
                    { id: "active" as const, label: "Active" },
                    { id: "inactive" as const, label: "Inactive" },
                    { id: "chiropractic" as const, label: "Chiropractic" },
                    { id: "massage" as const, label: "Massage" },
                  ] as const
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setQuickFilter(id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-semibold transition",
                      quickFilter === id
                        ? "border-[#16a349] bg-[#ecfdf5] text-[#0d5c2e] ring-1 ring-[#16a349]/25"
                        : "border-slate-200 bg-slate-50/80 text-slate-600 hover:border-slate-300 hover:bg-white",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            {listSummary ? (
              <p className="mt-2 text-xs font-medium text-slate-500">{listSummary}</p>
            ) : null}
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
                  onClick={openCreate}
                  className="mt-6 rounded-xl bg-[#16a349] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d]"
                >
                  Add service
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-medium text-slate-600">No visit types match filters or search.</p>
                <button
                  type="button"
                  className="mt-3 text-sm font-semibold text-[#16a349] hover:text-[#13823d]"
                  onClick={() => {
                    setSearch("");
                    setQuickFilter("all");
                  }}
                >
                  Clear filters & search
                </button>
              </div>
            ) : (
              <ul className="space-y-2">
                {filtered.map((s, idx) => {
                  const selected = formOpen && editing?.id === s.id;
                  const st = s.service_type === "massage" ? "Massage" : "Chiropractic";
                  const visChiro = s.visible_to_chiropractic_staff !== false;
                  const visMassage = s.visible_to_massage_staff !== false;
                  const staffScope =
                    visChiro && visMassage ? null : visChiro ? "chiro" : visMassage ? "massage" : "none";
                  return (
                    <li key={s.id}>
                      <div
                        className={cn(
                          "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3.5 transition",
                          selected
                            ? "border-[#16a349]/45 bg-[#ecfdf5]/50 ring-1 ring-[#16a349]/20"
                            : "border-slate-200/90 hover:border-slate-300/90",
                          !selected && idx % 2 === 1 && "bg-slate-50/50",
                          !selected && idx % 2 === 0 && "bg-white",
                          !selected && "hover:bg-slate-50/80",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900">{s.name}</p>
                              {(s.public_booking_name || "").trim() ? (
                                <p className="mt-0.5 text-xs text-slate-500">
                                  Patients see: <span className="font-medium text-slate-700">{(s.public_booking_name || "").trim()}</span>
                                </p>
                              ) : null}
                            </div>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                              {st}
                            </span>
                            {s.service_type !== "massage" && s.is_new_client_intake && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                                Intake / reactivation
                              </span>
                            )}
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
                            {s.is_active && s.charges_patient === false && (
                              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-900">
                                Insurance / no patient charge
                              </span>
                            )}
                            {s.is_active && staffScope === "chiro" && (
                              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-900">
                                Chiro doctors
                              </span>
                            )}
                            {s.is_active && staffScope === "massage" && (
                              <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fuchsia-900">
                                Massage doctors
                              </span>
                            )}
                            {s.is_active && staffScope === "none" && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                                No doctor picker
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
                            onClick={() => openEdit(s)}
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

      <Dialog open={formOpen} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="sm:max-w-2xl sm:max-h-[min(calc(100dvh-2rem),52rem)] p-0 gap-0 overflow-hidden">
          <DialogHeader className="border-b border-emerald-100/80 bg-gradient-to-br from-[#ecfdf5]/80 via-white to-white px-5 py-4 pr-12 sm:px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#13823d]">
              {isNew ? "Create" : "Editing"}
            </p>
            <DialogTitle className="mt-1 text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
              {isNew ? "New visit type" : editing?.name ?? "Service"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {isNew
                ? "Fill in at least the name, then save. You can refine flags after."
                : `ID ${editing?.id} · Save updates booking and billing everywhere this type is used.`}
            </DialogDescription>
            <div className="absolute top-4 right-12 hidden sm:block">
              <HelpTip label="Form overview" align="center">
                <strong>Service name</strong> is what doctors and schedules use. <strong>Patient-facing name</strong> (optional) overrides
                the label on the public booking site and patient texts only. Duration and price apply everywhere. Billing code is internal.
              </HelpTip>
            </div>
          </DialogHeader>

          <div className="space-y-5 overflow-y-auto p-5 sm:p-6">
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
                        placeholder="e.g. Miscellaneous (shown to doctors & schedule)"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="svc-public-name" className={fieldLabel}>
                      Patient-facing name <span className="font-normal normal-case text-slate-400">(optional)</span>
                    </label>
                    <div className={inputWrap}>
                      <input
                        id="svc-public-name"
                        className="admin-input border-0 bg-transparent shadow-none ring-0 focus:ring-0"
                        placeholder="Leave blank to use service name everywhere — e.g. Chiropractic Visit"
                        value={form.public_booking_name}
                        onChange={(e) => setForm((f) => ({ ...f, public_booking_name: e.target.value }))}
                      />
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                      When set, the public booking page, voice assistant, and patient SMS/email use this label. Doctor portal and billing
                      still use <strong className="font-medium text-slate-600">Service name</strong> above.
                    </p>
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
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-indigo-200/80 bg-indigo-50/40 p-3">
                    <input
                      type="checkbox"
                      checked={form.charges_patient}
                      onChange={(e) => setForm((f) => ({ ...f, charges_patient: e.target.checked }))}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[#16a349] focus:ring-[#16a349]"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">
                        Count toward patient invoice (patient pays)
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                        Uncheck for procedures that should appear on the printed bill with CPT/code for insurance reimbursement but{" "}
                        <strong>should not</strong> increase what the patient owes in this system. Checked = normal billable visit or product.
                      </span>
                    </span>
                  </label>
                  <div>
                    <label htmlFor="svc-type" className={fieldLabel}>
                      Visit kind
                    </label>
                    <div className={inputWrap}>
                      <select
                        id="svc-type"
                        className="admin-input cursor-pointer border-0 bg-transparent py-3 shadow-none ring-0 focus:ring-0"
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
                        <option value="chiropractic">Chiropractic — one doctor assigned by the clinic</option>
                        <option value="massage">Massage — patient picks from doctors who offer it</option>
                      </select>
                    </div>
                  </div>
                  {form.service_type === "chiropractic" && (
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-200/80 bg-amber-50/50 p-3">
                      <input
                        type="checkbox"
                        checked={form.is_new_client_intake}
                        onChange={(e) => setForm((f) => ({ ...f, is_new_client_intake: e.target.checked }))}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[#16a349] focus:ring-[#16a349]"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-slate-800">
                          New patient / reactivation visit (long-gap rule)
                        </span>
                        <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                          Check this for the visit type returning patients must book online if they have not had a completed chiropractic
                          visit in over two years (for example &quot;New patient exam&quot; or &quot;Reactivation&quot;). Only applies when
                          this service is shown on public booking. Massage visit types ignore this flag.
                        </span>
                      </span>
                    </label>
                  )}
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
                  <div className="rounded-lg border border-slate-200/80 bg-white/80 p-3">
                    <p className="text-sm font-semibold text-slate-800">Who sees this on the in-room bill?</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      Clinic admins always see every service here in Admin. These checkboxes control the list each doctor gets when they
                      finish a visit. Use them so chiropractic-only codes don&apos;t clutter massage therapists&apos; screens, and vice versa.
                    </p>
                    <div className="mt-3 space-y-2">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={form.visible_to_chiropractic_staff}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, visible_to_chiropractic_staff: e.target.checked }))
                          }
                          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[#16a349] focus:ring-[#16a349]"
                        />
                        <span className="text-sm text-slate-700">Chiropractic doctors</span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={form.visible_to_massage_staff}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, visible_to_massage_staff: e.target.checked }))
                          }
                          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[#16a349] focus:ring-[#16a349]"
                        />
                        <span className="text-sm text-slate-700">Massage doctors / therapists</span>
                      </label>
                    </div>
                    {!form.visible_to_chiropractic_staff && !form.visible_to_massage_staff && (
                      <p className="mt-2 text-xs font-medium text-amber-800">
                        Warning: no doctor role will see this line—only admins can use it until you check at least one box above.
                      </p>
                    )}
                  </div>
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
                  onClick={() => editing && openEdit(editing)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
                >
                  Reset
                </button>
              )}
              <button
                type="button"
                disabled={isSaving}
                onClick={closeForm}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <HelpTip label="Save">
                Writes to the server and refreshes the list. New rows appear immediately for provider assignment if active.
              </HelpTip>
            </div>
            {!isNew && formDirty && (
              <span className="text-xs font-medium text-amber-800">You have unsaved changes</span>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
