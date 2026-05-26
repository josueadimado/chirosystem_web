"use client";

import { AdminPageIntro, AdminSectionLabel } from "@/components/admin-shell";
import { useAppFeedback } from "@/components/app-feedback";
import { HelpTip } from "@/components/help-tip";
import { Loader } from "@/components/loader";
import { Button } from "@/components/ui/button";
import { SquareTerminalCheckoutPoller } from "@/components/square-terminal-checkout";
import { ApiError, apiGetAuth, apiPatch, apiPost } from "@/lib/api";
import { getRoleCookie } from "@/lib/auth";
import { useCallback, useEffect, useState } from "react";

type ClinicProfile = {
  clinic_name: string;
  address_line1: string;
  city_state_zip: string;
  phone: string;
  email: string;
  /** Billing provider ID printed on all patient bills (e.g. NPI). */
  provider_billing_id: string;
  /** EIN / office employer ID on bills (optional, separate from Provider ID). */
  employer_tax_id: string;
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
    provider_billing_id: "",
    employer_tax_id: "",
    pos_default: "11",
    no_show_fee: "25.00",
    business_hours: [],
  };
}

export default function AdminSettingsPage() {
  const { runWithFeedback, toast } = useAppFeedback();
  const [draft, setDraft] = useState<ClinicProfile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [canSave, setCanSave] = useState(false);
  const [payStatus, setPayStatus] = useState<PaymentConnectionStatus | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState("");
  /** Admin Terminal test: amount field + active Square checkout id for polling. */
  const [terminalTestAmount, setTerminalTestAmount] = useState("1.00");
  const [terminalTestCheckoutId, setTerminalTestCheckoutId] = useState<string | null>(null);

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
          provider_billing_id: updated.provider_billing_id ?? "",
          employer_tax_id: updated.employer_tax_id ?? "",
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
                  Provider ID (on all bills)
                  <HelpTip label="Provider ID">
                    Billing provider identifier printed on every patient bill (e.g. NPI like 453798678). Required for insurance-style statements.
                  </HelpTip>
                </label>
                <input
                  className="admin-input w-full max-w-[14rem] py-2.5 text-sm font-mono"
                  value={draft.provider_billing_id}
                  onChange={(e) => updateField("provider_billing_id", e.target.value)}
                  disabled={!canSave}
                  placeholder="e.g. 453798678"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Employer / office tax ID (printed on bills)
                  <HelpTip label="Printed on bills">Shown as Provider/Office Employer ID on patient bills (e.g. EIN). Optional.</HelpTip>
                </label>
                <input
                  className="admin-input w-full max-w-[14rem] py-2.5 text-sm font-mono"
                  value={draft.employer_tax_id}
                  onChange={(e) => updateField("employer_tax_id", e.target.value)}
                  disabled={!canSave}
                  placeholder="optional"
                  autoComplete="off"
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
                    Chiropractic and massage no-shows use the <strong>booked visit price</strong> from Services. This field is
                    only a <strong>fallback</strong> if a visit has no price. Saved cards are charged when possible; otherwise
                    the visit may move to <strong>Awaiting payment</strong>. Massage late cancellations (&lt;24h) use the
                    massage price separately. Use <strong>0</strong> to disable only the fallback amount.
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

                  <div className="space-y-3 rounded-lg border border-dashed border-slate-300 bg-white/70 px-3 py-3">
                    <div>
                      <p className="font-semibold text-slate-900">Test Square Terminal (hardware)</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">
                        Sends a real card-present charge for the amount you enter so you can confirm the reader wakes up.
                        This does <strong>not</strong> create or pay a clinic invoice — only Square processes the card (you can
                        void in Square if needed).
                      </p>
                      <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50/90 px-2.5 py-2 text-xs leading-relaxed text-sky-950">
                        <strong className="font-semibold">Device type matters:</strong> this API only works with a{" "}
                        <strong>Square Terminal</strong> — the standalone unit with its own screen (sometimes called countertop
                        Terminal). It does <strong>not</strong> use the <strong>Square Stand</strong> (iPad mount), the small{" "}
                        <strong>contactless and chip Reader</strong>, or an <strong>iPad running Square Point of Sale</strong>.
                        Those use the Square POS app or payment links instead — use <strong>Square POS app</strong> or{" "}
                        <strong>desk pay link</strong> on the doctor dashboard for those.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex min-w-[8rem] flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Amount (USD)
                        <input
                          type="text"
                          inputMode="decimal"
                          className="admin-input rounded-lg py-2 font-mono text-sm normal-case"
                          value={terminalTestAmount}
                          onChange={(e) => setTerminalTestAmount(e.target.value)}
                          aria-label="Test Terminal amount in US dollars"
                        />
                      </label>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="mt-5 h-auto rounded-lg px-3 py-2 text-xs font-semibold"
                        onClick={() => void launchTerminalTest()}
                        disabled={!payStatus.terminal_reader_ready}
                      >
                        Send to Terminal
                      </Button>
                    </div>
                    {!payStatus.terminal_reader_ready ? (
                      <p className="text-xs text-amber-800">
                        You can enter an amount anytime. <strong>Send to Terminal</strong> stays off until{" "}
                        <span className="font-mono">SQUARE_DEVICE_ID</span> (and related Square env) is set and “Card reader”
                        shows ready above.
                      </p>
                    ) : null}
                    {terminalTestCheckoutId ? (
                      <SquareTerminalCheckoutPoller
                        checkoutId={terminalTestCheckoutId}
                        statusPath="/admin/terminal_checkout_status/"
                        onComplete={() => {
                          toast.success(
                            "The Terminal finished this test. No clinic invoice was updated — check Square for the payment.",
                          );
                          setTerminalTestCheckoutId(null);
                        }}
                        onTerminalError={(msg) => {
                          toast.error(msg);
                          setTerminalTestCheckoutId(null);
                        }}
                      />
                    ) : null}
                  </div>
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
