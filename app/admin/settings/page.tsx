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
  business_hours: Array<{ day: string; hours: string }>;
};

function emptyProfile(): ClinicProfile {
  return {
    clinic_name: "",
    address_line1: "",
    city_state_zip: "",
    phone: "",
    email: "",
    pos_default: "11",
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

  useEffect(() => {
    const role = getRoleCookie();
    setCanSave(role === "owner_admin" || role === "staff");
  }, []);

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
          business_hours: draft.business_hours,
        });
        setDraft({
          clinic_name: updated.clinic_name ?? "",
          address_line1: updated.address_line1 ?? "",
          city_state_zip: updated.city_state_zip ?? "",
          phone: updated.phone ?? "",
          email: updated.email ?? "",
          pos_default: updated.pos_default ?? "11",
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
