"use client";

import { BrandLogo } from "@/components/brand-logo";
import { Loader } from "@/components/loader";
import { PublicProfileCardSetup } from "@/components/public-profile-card-setup";
import { ApiError, apiGet, apiPostPublic } from "@/lib/api";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type ProfileSession = {
  clinic_name: string;
  expires_at: string;
  patient: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    date_of_birth: string;
    address_line1: string;
    address_line2: string;
    city: string;
    state: string;
    zip: string;
    emergency_contact_name: string;
    emergency_contact_phone: string;
  };
  card: {
    has_saved_card: boolean;
    card_brand: string;
    card_last4: string;
    card_display_only: boolean;
    saved_cards?: Array<{
      id?: number;
      card_brand: string;
      card_last4: string;
      is_default?: boolean;
    }>;
  };
};

const fieldClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-[#0d5c2e]/50 focus:outline-none focus:ring-2 focus:ring-[#0d5c2e]/15";

export default function PublicUpdateInfoPage() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : "";
  const [session, setSession] = useState<ProfileSession | null>(null);
  const [form, setForm] = useState<ProfileSession["patient"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profileMsg, setProfileMsg] = useState("");
  const [profileErr, setProfileErr] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiGet<ProfileSession>(
        `/patient-profile-update/session/${encodeURIComponent(token)}/`,
      );
      setSession(data);
      setForm({ ...data.patient });
    } catch (e) {
      setSession(null);
      setForm(null);
      setError(e instanceof ApiError ? e.message : "Could not open this update link.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateField = (key: keyof ProfileSession["patient"], value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !form) return;
    setSavingProfile(true);
    setProfileMsg("");
    setProfileErr("");
    try {
      const res = await apiPostPublic<ProfileSession & { detail?: string }>(
        `/patient-profile-update/update-profile/${encodeURIComponent(token)}/`,
        form,
      );
      setSession(res);
      setForm({ ...res.patient });
      setProfileMsg(res.detail || "Your information was saved.");
    } catch (err) {
      setProfileErr(err instanceof ApiError ? err.message : "Could not save your information.");
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader label="Opening your secure update page…" />
      </main>
    );
  }

  if (error || !session || !form) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-50 to-emerald-50/40 px-4 py-10">
        <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <BrandLogo className="h-12 w-auto" />
          <h1 className="mt-6 text-xl font-semibold text-slate-900">Link unavailable</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {error || "This update link is invalid or has expired."}
          </p>
          <p className="mt-4 text-sm text-slate-600">
            Please call the clinic or ask them to text you a new link.
          </p>
          <Link href="/" className="mt-6 inline-block text-sm font-semibold text-[#0d5c2e] hover:underline">
            Back to booking
          </Link>
        </div>
      </main>
    );
  }

  const expiresLabel = (() => {
    try {
      return new Date(session.expires_at).toLocaleString();
    } catch {
      return session.expires_at;
    }
  })();

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-emerald-50/30 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur sm:p-8">
          <BrandLogo className="h-12 w-auto" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">
            Update your info
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {session.clinic_name} — securely update your contact details and payment card on file.
            This private link expires {expiresLabel}.
          </p>
        </div>

        <form
          onSubmit={(e) => void saveProfile(e)}
          className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8"
        >
          <h2 className="text-lg font-semibold text-slate-900">Contact & address</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              First name
              <input
                className={fieldClass}
                value={form.first_name}
                onChange={(e) => updateField("first_name", e.target.value)}
                required
                autoComplete="given-name"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Last name
              <input
                className={fieldClass}
                value={form.last_name}
                onChange={(e) => updateField("last_name", e.target.value)}
                required
                autoComplete="family-name"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Phone
              <input
                className={fieldClass}
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                required
                autoComplete="tel"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Email
              <input
                type="email"
                className={fieldClass}
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Date of birth
              <input
                type="date"
                className={fieldClass}
                value={form.date_of_birth || ""}
                onChange={(e) => updateField("date_of_birth", e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Street address
              <input
                className={fieldClass}
                value={form.address_line1}
                onChange={(e) => updateField("address_line1", e.target.value)}
                autoComplete="address-line1"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Apt / suite (optional)
              <input
                className={fieldClass}
                value={form.address_line2}
                onChange={(e) => updateField("address_line2", e.target.value)}
                autoComplete="address-line2"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              City
              <input
                className={fieldClass}
                value={form.city}
                onChange={(e) => updateField("city", e.target.value)}
                autoComplete="address-level2"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              State
              <input
                className={fieldClass}
                value={form.state}
                onChange={(e) => updateField("state", e.target.value)}
                autoComplete="address-level1"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              ZIP
              <input
                className={fieldClass}
                value={form.zip}
                onChange={(e) => updateField("zip", e.target.value)}
                autoComplete="postal-code"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Emergency contact name
              <input
                className={fieldClass}
                value={form.emergency_contact_name}
                onChange={(e) => updateField("emergency_contact_name", e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Emergency contact phone
              <input
                className={fieldClass}
                value={form.emergency_contact_phone}
                onChange={(e) => updateField("emergency_contact_phone", e.target.value)}
              />
            </label>
          </div>

          {profileErr ? <p className="text-sm text-red-700">{profileErr}</p> : null}
          {profileMsg ? <p className="text-sm font-medium text-emerald-800">{profileMsg}</p> : null}

          <button
            type="submit"
            disabled={savingProfile}
            className="rounded-xl bg-[#0d5c2e] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4a25] disabled:opacity-60"
          >
            {savingProfile ? "Saving…" : "Save contact info"}
          </button>
        </form>

        <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold text-slate-900">Payment cards on file</h2>
          <p className="text-sm text-slate-600">
            Add a card using Square’s secure form. You can keep more than one card. We never store your full card
            number.
          </p>
          <PublicProfileCardSetup
            token={token}
            existingSavedCards={session.card.saved_cards || null}
            existingSavedCard={
              session.card.card_last4
                ? {
                    card_brand: session.card.card_brand,
                    card_last4: session.card.card_last4,
                    card_display_only: session.card.card_display_only,
                    saved_cards: session.card.saved_cards,
                  }
                : null
            }
            onSaved={(card) => {
              setSession((prev) =>
                prev
                  ? {
                      ...prev,
                      card: {
                        has_saved_card: true,
                        card_brand: card.card_brand,
                        card_last4: card.card_last4,
                        card_display_only: false,
                        saved_cards: card.saved_cards,
                      },
                    }
                  : prev,
              );
            }}
          />
        </div>

        <p className="pb-8 text-center text-xs text-slate-500">
          Need help? Call the clinic.{" "}
          <Link href="/" className="font-semibold text-[#0d5c2e] hover:underline">
            Book an appointment
          </Link>
        </p>
      </div>
    </main>
  );
}
