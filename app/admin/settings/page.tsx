"use client";

import { AdminPageIntro } from "@/components/admin-shell";
import { useAppFeedback } from "@/components/app-feedback";
import { HelpTip } from "@/components/help-tip";
import { Loader } from "@/components/loader";
import { Button } from "@/components/ui/button";
import { SquareTerminalCheckoutPoller } from "@/components/square-terminal-checkout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ClinicTimezoneCombobox,
  formatClinicLocalTime,
  isValidIanaTimezone,
  type TimezoneGrouped,
} from "@/components/clinic-timezone-combobox";
import { ApiError, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import { getRoleCookie } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";

type ClinicProfile = {
  clinic_name: string;
  address_line1: string;
  city_state_zip: string;
  phone: string;
  email: string;
  timezone: string;
  provider_billing_id: string;
  employer_tax_id: string;
  pos_default: string;
  no_show_fee: string;
  business_hours: Array<{ day: string; hours: string }>;
};

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

type SettingsTab = "clinic" | "billing" | "payments";

function emptyProfile(): ClinicProfile {
  return {
    clinic_name: "",
    address_line1: "",
    city_state_zip: "",
    phone: "",
    email: "",
    timezone: "America/Detroit",
    provider_billing_id: "",
    employer_tax_id: "",
    pos_default: "11",
    no_show_fee: "25.00",
    business_hours: [],
  };
}

function SettingsField({
  label,
  help,
  children,
  className,
}: {
  label: string;
  help?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        {label}
        {help ? <HelpTip label={label}>{help}</HelpTip> : null}
      </label>
      {children}
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean | null }) {
  if (ok === true) return <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" title="OK" />;
  if (ok === false) return <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-rose-500" title="Needs attention" />;
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-slate-300" title="Optional" />;
}

export default function AdminSettingsPage() {
  const { runWithFeedback, toast } = useAppFeedback();
  const [draft, setDraft] = useState<ClinicProfile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [canSave, setCanSave] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("clinic");
  const [payStatus, setPayStatus] = useState<PaymentConnectionStatus | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState("");
  const [terminalTestAmount, setTerminalTestAmount] = useState("1.00");
  const [terminalTestCheckoutId, setTerminalTestCheckoutId] = useState<string | null>(null);
  const [timezonesGrouped, setTimezonesGrouped] = useState<TimezoneGrouped | null>(null);
  const [timezonesLoading, setTimezonesLoading] = useState(true);
  const [timezoneError, setTimezoneError] = useState("");

  const loadTimezones = useCallback(async () => {
    setTimezonesLoading(true);
    try {
      const data = await apiGetAuth<TimezoneGrouped>("/admin/timezones/");
      setTimezonesGrouped(data);
    } catch {
      setTimezonesGrouped(null);
    } finally {
      setTimezonesLoading(false);
    }
  }, []);

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
        timezone: data.timezone?.trim() || "America/Detroit",
        provider_billing_id: data.provider_billing_id ?? "",
        employer_tax_id: data.employer_tax_id ?? "",
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
    void loadTimezones();
  }, [load, loadTimezones]);

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
    setCanSave(getRoleCookie() === "owner_admin" || getRoleCookie() === "staff");
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
      next[index] = { ...next[index], [key]: value };
      return { ...d, business_hours: next };
    });
  };

  const launchTerminalTest = async () => {
    const n = Number.parseFloat(terminalTestAmount.trim());
    if (Number.isNaN(n) || n < 1) {
      toast.error("Enter an amount of at least $1.00.");
      return;
    }
    setTerminalTestCheckoutId(null);
    await runWithFeedback(
      async () => {
        const out = await apiPost<{ checkout_id: string }>("/admin/terminal_checkout_test/", {
          amount: terminalTestAmount.trim(),
        });
        setTerminalTestCheckoutId(out.checkout_id);
      },
      {
        loadingMessage: "Sending test amount to Square…",
        errorFallback: "Could not reach the Terminal. Check SQUARE_DEVICE_ID and Square Dashboard.",
      },
    );
  };

  const handleSave = async () => {
    if (!canSave) return;
    if (!isValidIanaTimezone(draft.timezone)) {
      setTimezoneError("Please select a valid timezone");
      return;
    }
    setSaving(true);
    setError("");
    setTimezoneError("");
    const timezoneBeforeSave = draft.timezone;
    await runWithFeedback(
      async () => {
        const updated = await apiPatch<ClinicProfile>("/admin/clinic_profile/", {
          clinic_name: draft.clinic_name,
          address_line1: draft.address_line1,
          city_state_zip: draft.city_state_zip,
          phone: draft.phone,
          email: draft.email,
          timezone: draft.timezone,
          provider_billing_id: draft.provider_billing_id,
          employer_tax_id: draft.employer_tax_id,
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
          timezone: updated.timezone?.trim() || "America/Detroit",
          provider_billing_id: updated.provider_billing_id ?? "",
          employer_tax_id: updated.employer_tax_id ?? "",
          pos_default: updated.pos_default ?? "11",
          no_show_fee: updated.no_show_fee ?? "25.00",
          business_hours: Array.isArray(updated.business_hours) ? updated.business_hours : [],
        });
        return updated;
      },
      {
        loadingMessage: "Saving clinic settings…",
        successMessage: (updated) => {
          const tz = updated.timezone?.trim() || timezoneBeforeSave;
          if (tz !== timezoneBeforeSave) {
            const name = tz.replace(/_/g, " ");
            const time = formatClinicLocalTime(tz);
            return `Timezone updated to ${name}. Current clinic time is now ${time}.`;
          }
          return "Settings saved.";
        },
        errorFallback: "Could not save settings.",
      },
    );
    setSaving(false);
  };

  const inputClass = "admin-input w-full py-2.5 text-sm";

  return (
    <div className="w-full space-y-6 pb-24">
      <AdminPageIntro
        title="Settings"
        description="Clinic details, billing defaults, and payment connection checks. Pick a section below — you don’t need everything on one screen."
        pageHelp="Owner and staff can edit clinic and billing fields and save. Payment settings are configured on the server; this page only verifies Square is connected."
      />

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</p>
      ) : null}

      {loading ? (
        <Loader variant="page" label="Loading settings" sublabel="Reading clinic profile…" />
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SettingsTab)} className="gap-6">
          <TabsList className="flex h-auto w-full max-w-2xl flex-wrap gap-1 rounded-xl border border-slate-200/90 bg-slate-100/70 p-1 shadow-inner shadow-slate-200/30">
            <TabsTrigger
              value="clinic"
              className="min-w-[7rem] flex-1 rounded-lg border-0 px-4 py-2 text-sm font-medium text-slate-600 shadow-none after:hidden hover:text-slate-900 data-active:bg-white data-active:text-slate-900 data-active:shadow-sm sm:flex-none"
            >
              Clinic info
            </TabsTrigger>
            <TabsTrigger
              value="billing"
              className="min-w-[7rem] flex-1 rounded-lg border-0 px-4 py-2 text-sm font-medium text-slate-600 shadow-none after:hidden hover:text-slate-900 data-active:bg-white data-active:text-slate-900 data-active:shadow-sm sm:flex-none"
            >
              Billing & hours
            </TabsTrigger>
            {canSave ? (
              <TabsTrigger
                value="payments"
                className="min-w-[7rem] flex-1 rounded-lg border-0 px-4 py-2 text-sm font-medium text-slate-600 shadow-none after:hidden hover:text-slate-900 data-active:bg-white data-active:text-slate-900 data-active:shadow-sm sm:flex-none"
              >
                Payments
              </TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="clinic" className="mt-0">
            <div className="admin-panel space-y-5">
              <p className="text-sm text-slate-600">Shown on printed bills and staff-facing screens.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <SettingsField label="Clinic name" className="sm:col-span-2">
                  <input
                    className={inputClass}
                    value={draft.clinic_name}
                    onChange={(e) => updateField("clinic_name", e.target.value)}
                    disabled={!canSave}
                  />
                </SettingsField>
                <SettingsField label="Street address" className="sm:col-span-2">
                  <input
                    className={inputClass}
                    value={draft.address_line1}
                    onChange={(e) => updateField("address_line1", e.target.value)}
                    disabled={!canSave}
                  />
                </SettingsField>
                <SettingsField label="City, state, ZIP" className="sm:col-span-2">
                  <input
                    className={inputClass}
                    value={draft.city_state_zip}
                    onChange={(e) => updateField("city_state_zip", e.target.value)}
                    disabled={!canSave}
                  />
                </SettingsField>
                <SettingsField label="Phone">
                  <input
                    className={inputClass}
                    value={draft.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                    disabled={!canSave}
                  />
                </SettingsField>
                <SettingsField label="Public email">
                  <input
                    type="email"
                    className={inputClass}
                    value={draft.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    disabled={!canSave}
                    placeholder="optional"
                  />
                </SettingsField>
                <div className="space-y-2 sm:col-span-2">
                  <SettingsField
                    label="Clinic timezone"
                    help="Used for scheduling, AI phone booking, appointment slots, and reminders."
                  >
                    <ClinicTimezoneCombobox
                      value={draft.timezone}
                      disabled={!canSave}
                      grouped={timezonesGrouped}
                      loading={timezonesLoading}
                      error={timezoneError}
                      onChange={(tz) => {
                        setTimezoneError("");
                        updateField("timezone", tz);
                      }}
                    />
                  </SettingsField>
                  <p className="rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-sm leading-relaxed text-amber-950">
                    Changing the timezone affects AI voice booking, appointment slot filtering, and SMS
                    reminders. After changing, refresh the booking site to confirm.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="billing" className="mt-0 space-y-4">
            <div className="admin-panel space-y-5">
              <p className="text-sm text-slate-600">Defaults for patient bills and no-show rules.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <SettingsField
                  label="Provider ID (all bills)"
                  help="Billing provider ID on every patient bill (e.g. NPI)."
                >
                  <input
                    className={cn(inputClass, "font-mono")}
                    value={draft.provider_billing_id}
                    onChange={(e) => updateField("provider_billing_id", e.target.value)}
                    disabled={!canSave}
                    placeholder="e.g. 453798678"
                    autoComplete="off"
                  />
                </SettingsField>
                <SettingsField label="Employer / office tax ID" help="Optional EIN on printed bills.">
                  <input
                    className={cn(inputClass, "font-mono")}
                    value={draft.employer_tax_id}
                    onChange={(e) => updateField("employer_tax_id", e.target.value)}
                    disabled={!canSave}
                    placeholder="optional"
                    autoComplete="off"
                  />
                </SettingsField>
                <SettingsField label="Place of service (POS)" help="Line-item code on bills (often 11).">
                  <input
                    className={cn(inputClass, "max-w-[8rem] font-mono")}
                    value={draft.pos_default}
                    onChange={(e) => updateField("pos_default", e.target.value)}
                    disabled={!canSave}
                  />
                </SettingsField>
                <SettingsField
                  label="No-show fee fallback (USD)"
                  help={
                    <>
                      Visit prices usually come from Services. This amount is only used when a visit has no price. Use{" "}
                      <strong>0</strong> to disable the fallback.
                    </>
                  }
                >
                  <input
                    type="text"
                    inputMode="decimal"
                    className={cn(inputClass, "max-w-[10rem] font-mono")}
                    value={draft.no_show_fee}
                    onChange={(e) => updateField("no_show_fee", e.target.value)}
                    disabled={!canSave}
                    placeholder="25.00"
                  />
                </SettingsField>
              </div>
            </div>

            <div className="admin-panel">
              <h3 className="text-base font-semibold text-slate-900">Business hours</h3>
              <p className="mt-1 text-sm text-slate-600">Reference for staff; online booking uses schedule rules separately.</p>
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="w-[7.5rem] px-3 py-2">Day</th>
                      <th className="px-3 py-2">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.business_hours.map((row, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2">
                          <input
                            className="admin-input w-full py-1.5 text-sm"
                            value={row.day}
                            onChange={(e) => updateHourRow(i, "day", e.target.value)}
                            disabled={!canSave}
                            aria-label={`Day ${i + 1}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="admin-input w-full py-1.5 text-sm"
                            value={row.hours}
                            onChange={(e) => updateHourRow(i, "hours", e.target.value)}
                            disabled={!canSave}
                            aria-label={`Hours row ${i + 1}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {canSave ? (
            <TabsContent value="payments" className="mt-0 space-y-4">
              <div className="admin-panel space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Square payments</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Credentials live in server environment variables — this tab only checks the connection.
                  </p>
                </div>

                {payError ? (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{payError}</p>
                ) : null}

                {payLoading && !payStatus ? (
                  <p className="text-sm text-slate-500">Checking connection…</p>
                ) : payStatus ? (
                  <>
                    <div
                      className={cn(
                        "rounded-xl border px-4 py-3",
                        payStatus.web_payments_ready
                          ? "border-emerald-200/80 bg-emerald-50/60"
                          : "border-amber-200/80 bg-amber-50/60",
                      )}
                    >
                      <p className="font-semibold text-slate-900">{payStatus.summary}</p>
                      {payStatus.environment ? (
                        <p className="mt-1 text-xs text-slate-600">
                          Environment: <span className="font-mono">{payStatus.environment}</span>
                          {payStatus.square_locations_found > 0
                            ? ` · ${payStatus.square_locations_found} location(s)`
                            : null}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            payStatus.web_payments_ready ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-700",
                          )}
                        >
                          Web: {payStatus.web_payments_ready ? "ready" : "not ready"}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            payStatus.terminal_reader_ready ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-700",
                          )}
                        >
                          Terminal: {payStatus.terminal_reader_ready ? "ready" : "not set"}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void loadPaymentStatus()}
                        disabled={payLoading}
                        className="mt-3 h-8 rounded-lg text-xs"
                      >
                        {payLoading ? "Checking…" : "Re-check"}
                      </Button>
                    </div>

                    <details className="group rounded-xl border border-slate-200 bg-white">
                      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
                        <span className="flex items-center justify-between gap-2">
                          Connection checklist
                          <span className="text-xs font-normal text-slate-500 group-open:hidden">Show details</span>
                          <span className="hidden text-xs font-normal text-slate-500 group-open:inline">Hide</span>
                        </span>
                      </summary>
                      <ul className="space-y-1.5 border-t border-slate-100 px-3 py-3">
                        {payStatus.checks.map((c) => (
                          <li key={c.id} className="flex gap-2.5 rounded-lg px-2 py-2 hover:bg-slate-50/80">
                            <StatusDot ok={c.ok} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900">{c.label}</p>
                              {c.hint ? <p className="mt-0.5 text-xs text-slate-500">{c.hint}</p> : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </details>

                    <details className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50">
                      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
                        Test Square Terminal
                      </summary>
                      <div className="space-y-3 border-t border-slate-200/80 px-4 py-3 text-sm text-slate-600">
                        <p className="text-xs leading-relaxed">
                          Sends a small real charge to your <strong>Square Terminal</strong> (standalone reader with screen). Does
                          not update clinic invoices.
                        </p>
                        <p className="rounded-lg border border-sky-100 bg-sky-50/80 px-2.5 py-2 text-xs text-sky-950">
                          Not for Square Stand, chip readers only, or iPad POS — use payment links or Square POS for those.
                        </p>
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="text-xs font-semibold text-slate-600">
                            Amount (USD)
                            <input
                              type="text"
                              inputMode="decimal"
                              className="admin-input mt-1 block w-28 rounded-lg py-2 font-mono text-sm"
                              value={terminalTestAmount}
                              onChange={(e) => setTerminalTestAmount(e.target.value)}
                            />
                          </label>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-9 rounded-lg text-xs"
                            onClick={() => void launchTerminalTest()}
                            disabled={!payStatus.terminal_reader_ready}
                          >
                            Send to Terminal
                          </Button>
                        </div>
                        {!payStatus.terminal_reader_ready ? (
                          <p className="text-xs text-amber-800">
                            Set <span className="font-mono">SQUARE_DEVICE_ID</span> on the server and wait for Terminal: ready.
                          </p>
                        ) : null}
                        {terminalTestCheckoutId ? (
                          <SquareTerminalCheckoutPoller
                            checkoutId={terminalTestCheckoutId}
                            statusPath="/admin/terminal_checkout_status/"
                            onComplete={() => {
                              toast.success("Terminal test finished — check Square for the charge.");
                              setTerminalTestCheckoutId(null);
                            }}
                            onTerminalError={(msg) => {
                              toast.error(msg);
                              setTerminalTestCheckoutId(null);
                            }}
                          />
                        ) : null}
                      </div>
                    </details>
                  </>
                ) : null}
              </div>
            </TabsContent>
          ) : null}
        </Tabs>
      )}

      {!loading && activeTab !== "payments" ? (
        <div className="sticky bottom-0 z-10 border-t border-slate-200/90 bg-background/95 py-4 backdrop-blur-md sm:static sm:border-0 sm:bg-transparent sm:py-0 sm:backdrop-blur-none">
          <div className="flex flex-wrap items-center gap-3">
            {canSave ? (
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="h-auto rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm"
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Sign in as owner or staff to edit.</p>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => void load()}
              disabled={loading || saving}
              className="h-auto px-2 text-sm text-slate-600"
            >
              Reload
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
