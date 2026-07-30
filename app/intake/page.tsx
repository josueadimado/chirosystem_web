"use client";

import { BrandLogo } from "@/components/brand-logo";
import { Loader } from "@/components/loader";
import { ApiError, apiGet, apiPostPublic } from "@/lib/api";
import { FORM_TYPE_OPTIONS, type IntakeFormType } from "@/lib/digital-intake";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";

type Match = {
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
};

export default function PublicIntakeStartPage() {
  const router = useRouter();
  const [formType, setFormType] = useState<IntakeFormType | "">("");
  const [phone, setPhone] = useState<string | undefined>();
  const [nameFilter, setNameFilter] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState<Match | null>(null);
  const [needDob, setNeedDob] = useState(false);
  const [dob, setDob] = useState("");
  const [looking, setLooking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [lookedUp, setLookedUp] = useState(false);

  const canLookup = Boolean(formType && phone && isValidPhoneNumber(phone));

  const filteredMatches = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    if (!q) return matches;
    return matches.filter((m) => {
      const full = `${m.first_name} ${m.last_name}`.toLowerCase();
      return full.includes(q) || m.first_name.toLowerCase().includes(q) || m.last_name.toLowerCase().includes(q);
    });
  }, [matches, nameFilter]);

  const findPatients = async () => {
    if (!canLookup || !phone) return;
    setLooking(true);
    setError("");
    setSelected(null);
    setNeedDob(false);
    setDob("");
    setLookedUp(false);
    try {
      const params = new URLSearchParams({ phone });
      const data = await apiGet<{ found: boolean; matches: Match[]; detail?: string }>(
        `/digital-intake/find-patient/?${params.toString()}`,
      );
      setLookedUp(true);
      setMatches(data.matches || []);
      if (!data.found || !(data.matches || []).length) {
        setError(data.detail || "No matching patient found.");
      } else if (data.matches.length === 1) {
        setSelected(data.matches[0]);
      }
    } catch (e) {
      setMatches([]);
      setError(e instanceof ApiError ? e.message : "Could not look up that phone number.");
    } finally {
      setLooking(false);
    }
  };

  const startForm = async () => {
    if (!formType || !phone || !selected) return;
    setStarting(true);
    setError("");
    try {
      const payload: Record<string, string> = {
        form_type: formType,
        phone,
        first_name: selected.first_name,
        last_name: selected.last_name,
      };
      const dobToSend = dob || selected.date_of_birth || "";
      if (dobToSend) payload.date_of_birth = dobToSend;
      const res = await apiPostPublic<{ token: string; url: string }>(`/digital-intake/public-start/`, payload);
      router.push(`/intake/${encodeURIComponent(res.token)}`);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.message.toLowerCase().includes("date of birth")) {
          setNeedDob(true);
        }
        setError(e.message);
      } else {
        setError("Could not open your form.");
      }
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[linear-gradient(180deg,#f3faf5_0%,#ffffff_42%,#f8fafc_100%)]">
      <header className="border-b border-emerald-100/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" aria-label="Back to booking">
            <BrandLogo variant="full" className="max-h-12 sm:max-h-14" priority />
          </Link>
          <Link href="/" className="text-sm font-medium text-[#0d5c2e] underline-offset-4 hover:underline">
            Booking home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-8 sm:px-6">
        <h1 className="font-serif text-3xl tracking-tight text-[#0d5c2e]">Fill intake forms</h1>
        <p className="mt-2 text-sm text-slate-600">
          Choose your form, find your chart with your phone number, then complete anything that is missing.
        </p>

        <section className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">1. Which form?</h2>
          <div className="space-y-2">
            {FORM_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setFormType(opt.value);
                  setError("");
                }}
                className={cn(
                  "w-full rounded-xl border px-4 py-3 text-left text-sm font-semibold transition",
                  formType === opt.value
                    ? "border-[#0d5c2e] bg-[#ecfdf5] text-[#0d5c2e]"
                    : "border-slate-200 bg-white text-slate-800 hover:border-emerald-200",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">2. Find yourself</h2>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-600">Cell phone on file</span>
            <PhoneInput
              international
              defaultCountry="US"
              value={phone}
              onChange={setPhone}
              className="phone-field phone-input-intake rounded-xl border border-slate-200 bg-white px-3 py-2"
            />
          </label>
          <button
            type="button"
            disabled={!canLookup || looking}
            onClick={() => void findPatients()}
            className="w-full rounded-xl bg-[#0d5c2e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4a25] disabled:opacity-50"
          >
            {looking ? "Searching…" : "Find my chart"}
          </button>
        </section>

        {looking ? (
          <div className="mt-6 flex justify-center">
            <Loader label="Looking up…" />
          </div>
        ) : null}

        {lookedUp && matches.length > 0 ? (
          <section className="mt-8 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">3. Select your name</h2>
            {matches.length > 1 ? (
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-600">Filter by name (optional)</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  placeholder="Type part of your name"
                />
              </label>
            ) : null}
            <div className="space-y-2">
              {filteredMatches.map((m) => {
                const key = `${m.first_name}|${m.last_name}|${m.date_of_birth || ""}`;
                const isOn =
                  selected?.first_name === m.first_name &&
                  selected?.last_name === m.last_name &&
                  (selected?.date_of_birth || "") === (m.date_of_birth || "");
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSelected(m);
                      setError("");
                    }}
                    className={cn(
                      "w-full rounded-xl border px-4 py-3 text-left text-sm transition",
                      isOn
                        ? "border-[#0d5c2e] bg-[#ecfdf5] font-semibold text-[#0d5c2e]"
                        : "border-slate-200 bg-white text-slate-800 hover:border-emerald-200",
                    )}
                  >
                    {m.first_name} {m.last_name}
                    {m.date_of_birth ? (
                      <span className="mt-0.5 block text-xs font-normal text-slate-500">
                        DOB on file: {m.date_of_birth}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {needDob ? (
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-600">Date of birth (to confirm)</span>
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                />
              </label>
            ) : null}

            <button
              type="button"
              disabled={!selected || starting}
              onClick={() => void startForm()}
              className="w-full rounded-xl bg-[#16a349] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d] disabled:opacity-50"
            >
              {starting ? "Opening form…" : "Continue to form"}
            </button>
          </section>
        ) : null}

        {error ? <p className="mt-4 text-sm font-medium text-red-700">{error}</p> : null}
      </main>
    </div>
  );
}
