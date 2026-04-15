"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { useAppFeedback } from "@/components/app-feedback";
import { HelpTip } from "@/components/help-tip";
import { Loader } from "@/components/loader";
import { Button } from "@/components/ui/button";
import { ApiError, apiGetAuth, apiPatch } from "@/lib/api";
import { getRoleCookie } from "@/lib/auth";
import { useCallback, useEffect, useState } from "react";

type ClinicProfile = {
  clinic_name: string;
  address_line1: string;
  city_state_zip: string;
  phone: string;
  email: string;
  pos_default: string;
  /** USD amount charged on no-show (0 = no fee / no auto-invoice). */
  no_show_fee: string;
  business_hours: Array<{ day: string; hours: string }>;
};

/** From GET /admin/payment_connection_status/ — confirms Square env + live API ping. */
type PaymentCheck = {
  id: string;
  label: string;
  ok: boolean | null;
  hint: string | null;
};

type PaymentConnectionStatus = {
  environment: string | null;
  summary: string;
  checks: PaymentCheck[];
  web_payments_ready: boolean;
  terminal_reader_ready: boolean;
  square_locations_found: number;
};

function emptyProfile(): ClinicProfile {
  return {
    clinic_name: "",
    address_line1: "",
    city_state_zip: "",
    phone: "",
    email: "",
    pos_default: "11",
    no_show_fee: "25.00",
    business_hours: [],
  };
}

export default function AdminSettingsPage() {
  const { runWithFeedback } = useAppFeedback();
  const [draft, setDraft] = useState<ClinicProfile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [canSave, setCanSave] = useState(false);
  const [payStatus, setPayStatus] = useState<PaymentConnectionStatus | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiGetAuth<ClinicProfile>("/admin/clinic_profile/");
      setDraft({
        clinic_name: data.clinic_name ?? "",
        address_line1: data.address_line1 ?? "",
        city_state_zip: data.city_state_zip ?? "",
        phone: data.phone ?? "",
        email: data.email ?? "",
        pos_default: data.pos_default ?? "11",
        no_show_fee: data.no_show_fee ?? "25.00",
        business_hours: Array.isArray(data.business_hours) ? data.business_hours : [],
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load clinic profile.");
      setDraft(emptyProfile());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadPaymentStatus = useCallback(async () => {
    const role = getRoleCookie();
    if (role !== "owner_admin" && role !== "staff") {
      setPayStatus(null);
      setPayError("");
      return;
    }
    setPayLoading(true);
    setPayError("");
    try {
      const data = await apiGetAuth<PaymentConnectionStatus>("/admin/payment_connection_status/");
      setPayStatus(data);
    } catch (e) {
      setPayStatus(null);
      setPayError(e instanceof ApiError ? e.message : "Could not load payment connection status.");
    } finally {
      setPayLoading(false);
    }
  }, []);

  useEffect(() => {
    const role = getRoleCookie();
    setCanSave(role === "owner_admin" || role === "staff");
  }, []);

  useEffect(() => {
    void loadPaymentStatus();
  }, [loadPaymentStatus]);

  const updateField = (field: keyof Omit<ClinicProfile, "business_hours">, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
  };

  const updateHourRow = (index: number, key: "day" | "hours", value: string) => {
    setDraft((d) => {
      const next = [...d.business_hours];
      const row = { ...next[index], [key]: value };
      next[index] = row;
      return { ...d, business_hours: next };
    });
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError("");
    await runWithFeedback(
      async () => {
        const updated = await apiPatch<ClinicProfile>("/admin/clinic_profile/", {
          clinic_name: draft.clinic_name,
          address_line1: draft.address_line1,
          city_state_zip: draft.city_state_zip,
          phone: draft.phone,
          email: draft.email,
          pos_default: draft.pos_default,
          no_show_fee: draft.no_show_fee,
          business_hours: draft.business_hours,
        });
        setDraft({
          clinic_name: updated.clinic_name ?? "",
          address_line1: updated.address_line1 ?? "",
          city_state_zip: updated.city_state_zip ?? "",
          phone: updated.phone ?? "",
          email: updated.email ?? "",
          pos_default: updated.pos_default ?? "11",
          no_show_fee: updated.no_show_fee ?? "25.00",
          business_hours: Array.isArray(updated.business_hours) ? updated.business_hours : [],
        });
      },
      {
        loadingMessage: "Saving clinic settings…",
        successMessage: "Settings saved. Printed bills and this page will use these values.",
        errorFallback: "Could not save settings.",
      },
    );
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <AdminPageIntro
        title="Settings"
        description="Clinic details and hours are stored in the database—the same information used for printed bills and staff reference."
        pageHelp="Owner and staff can edit and save. Changes apply immediately for new bill printouts and this screen."
      />

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>
      )}
      {loading ? (
        <Loader variant="page" label="Loading settings" sublabel="Reading clinic profile…" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="admin-panel space-y-3">
            <AdminSectionLabel help="Shown on statements and in doctor bill printouts.">
              Clinic profile
            </AdminSectionLabel>
            <div className="space-y-3 rounded-xl border border-slate-200/90 bg-slate-50/40 p-4 text-sm">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Clinic name</label>
                <input
                  className="admin-input w-full py-2.5 text-sm"
                  value={draft.clinic_name}
                  onChange={(e) => updateField("clinic_name", e.target.value)}
                  disabled={!canSave}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Street address</label>
                <input
                  className="admin-input w-full py-2.5 text-sm"
                  value={draft.address_line1}
                  onChange={(e) => updateField("address_line1", e.target.value)}
                  disabled={!canSave}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">City, state, ZIP</label>
                <input
                  className="admin-input w-full py-2.5 text-sm"
                  value={draft.city_state_zip}
                  onChange={(e) => updateField("city_state_zip", e.target.value)}
                  disabled={!canSave}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</label>
                <input
                  className="admin-input w-full py-2.5 text-sm"
                  value={draft.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  disabled={!canSave}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Public email</label>
                <input
                  type="email"
                  className="admin-input w-full py-2.5 text-sm"
                  value={draft.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  disabled={!canSave}
                  placeholder="optional"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Default place of service (POS)
                  <HelpTip label="What is this?">Code printed on each line of the patient bill (e.g. 11). Your biller or clearinghouse can confirm the right value.</HelpTip>
                </label>
                <input
                  className="admin-input w-full max-w-[8rem] py-2.5 text-sm font-mono"
                  value={draft.pos_default}
                  onChange={(e) => updateField("pos_default", e.target.value)}
                  disabled={!canSave}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  No-show fee (USD)
                  <HelpTip label="No-show billing">
                    When staff marks a visit as no-show, this amount is invoiced. If the patient has a card on file, it is charged
                    automatically; otherwise the appointment moves to <strong>Awaiting payment</strong> until collected. Use{" "}
                    <strong>0</strong> to turn off the fee (status becomes no-show only, no invoice).
                  </HelpTip>
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="admin-input w-full max-w-[10rem] py-2.5 text-sm font-mono"
                  value={draft.no_show_fee}
                  onChange={(e) => updateField("no_show_fee", e.target.value)}
                  disabled={!canSave}
                  placeholder="25.00"
                />
              </div>
            </div>
          </section>

          <section className="admin-panel space-y-3">
            <AdminSectionLabel help="Reference hours for staff. Actual booking slots still follow your schedule rules.">
              Business hours
            </AdminSectionLabel>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200/90 bg-white">
              {draft.business_hours.map((row, i) => (
                <li key={i} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                  <input
                    className="admin-input min-w-0 flex-1 py-2 text-sm sm:max-w-[9rem]"
                    value={row.day}
                    onChange={(e) => updateHourRow(i, "day", e.target.value)}
                    disabled={!canSave}
                    aria-label={`Day ${i + 1}`}
                  />
                  <input
                    className="admin-input min-w-0 flex-[2] py-2 text-sm"
                    value={row.hours}
                    onChange={(e) => updateHourRow(i, "hours", e.target.value)}
                    disabled={!canSave}
                    aria-label={`Hours for row ${i + 1}`}
                  />
                </li>
              ))}
            </ul>
          </section>

          {canSave && (
            <section className="admin-panel space-y-3 lg:col-span-2">
              <AdminSectionLabel help="Card payments use Square. Values live in the API server environment (.env), not in this form. This panel only checks that they are set and that Square accepts your access token.">
                Payments (Square)
              </AdminSectionLabel>
              {payError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
                  {payError}
                </p>
              )}
              {payLoading && !payStatus ? (
                <div className="rounded-xl border border-slate-200/90 bg-slate-50/40 px-4 py-6 text-sm text-slate-600">
                  Checking payment connection…
                </div>
              ) : payStatus ? (
                <div className="space-y-4 rounded-xl border border-slate-200/90 bg-slate-50/40 p-4 text-sm">
                  <div
                    className={`rounded-lg border px-3 py-2.5 ${
                      payStatus.web_payments_ready
                        ? "border-emerald-200 bg-emerald-50/80 text-emerald-950"
                        : "border-amber-200 bg-amber-50/80 text-amber-950"
                    }`}
                  >
                    <p className="font-semibold leading-snug">{payStatus.summary}</p>
                    {payStatus.environment ? (
                      <p className="mt-1 text-xs opacity-90">
                        Square environment: <span className="font-mono">{payStatus.environment}</span>
                        {payStatus.square_locations_found > 0 ? (
                          <>
                            {" "}
                            · {payStatus.square_locations_found} location
                            {payStatus.square_locations_found === 1 ? "" : "s"} on this account
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                  <ul className="space-y-2">
                    {payStatus.checks.map((c) => (
                      <li
                        key={c.id}
                        className="flex gap-3 rounded-lg border border-slate-200/80 bg-white/90 px-3 py-2.5"
                      >
                        <span className="mt-0.5 shrink-0" aria-hidden>
                          {c.ok === true ? (
                            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" title="OK" />
                          ) : c.ok === false ? (
                            <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" title="Needs attention" />
                          ) : (
                            <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-300" title="Optional / not set" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{c.label}</p>
                          {c.hint ? <p className="mt-0.5 text-xs text-slate-600">{c.hint}</p> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs leading-relaxed text-slate-600">
                    <strong>Web payments ready</strong> means patients can save a card on the booking page and you can send payment
                    links. <strong>Terminal reader ready</strong> (when shown below) includes the desk card reader — see project README
                    for all <span className="font-mono">SQUARE_*</span> variables.
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span
                      className={`rounded-full px-2.5 py-1 font-semibold ${
                        payStatus.web_payments_ready ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      Web payments: {payStatus.web_payments_ready ? "ready" : "not ready"}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 font-semibold ${
                        payStatus.terminal_reader_ready ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      Card reader: {payStatus.terminal_reader_ready ? "ready" : "not required or not ready"}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void loadPaymentStatus()}
                    disabled={payLoading}
                    className="h-auto rounded-lg text-xs font-semibold"
                  >
                    {payLoading ? "Re-checking…" : "Re-check connection"}
                  </Button>
                </div>
              ) : null}
            </section>
          )}
        </div>
      )}

      {!loading && (
        <div className="flex flex-wrap items-center gap-3">
          {canSave ? (
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="h-auto rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm"
            >
              {saving ? "Saving…" : "Save settings"}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Sign in as owner or staff to edit these fields.</p>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() => void load()}
            disabled={loading || saving}
            className="h-auto px-2 text-sm font-semibold underline-offset-2 hover:underline"
          >
            Reload from server
          </Button>
        </div>
      )}
    </div>
  );
}
