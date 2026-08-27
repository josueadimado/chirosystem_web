"use client";

import { ApiError, apiGet, apiPostPublic } from "@/lib/api";
import { useState } from "react";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";

type Match = { first_name: string; last_name: string };

type Props = {
  onBack: () => void;
};

/**
 * Booking-page flow: phone → pick household member if needed → SMS code → open /update-info/{token}.
 */
export function BookingUpdateInfoPanel({ onBack }: Props) {
  const [phone, setPhone] = useState<string | undefined>(undefined);
  const [matches, setMatches] = useState<Match[]>([]);
  const [picked, setPicked] = useState<Match | null>(null);
  const [challengeToken, setChallengeToken] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const lookupAndRequest = async (firstName?: string, lastName?: string) => {
    if (!phone || !isValidPhoneNumber(phone)) {
      setError("Enter a valid mobile phone number.");
      return;
    }
    setBusy(true);
    setError("");
    setInfo("");
    try {
      // First pass without name: may return household list
      const find = await apiGet<{ found: boolean; matches: Match[]; detail?: string }>(
        `/patient-profile-update/find-patients/?phone=${encodeURIComponent(phone)}`,
      );
      if (!find.found || !find.matches?.length) {
        setError(find.detail || "No patient found with that phone number.");
        setMatches([]);
        return;
      }

      let fn = (firstName || picked?.first_name || "").trim();
      let ln = (lastName || picked?.last_name || "").trim();

      if (find.matches.length > 1 && (!fn || !ln)) {
        setMatches(find.matches);
        setInfo("More than one person uses this phone. Select your name, then we’ll text a code.");
        return;
      }

      if (find.matches.length === 1) {
        fn = find.matches[0].first_name;
        ln = find.matches[0].last_name;
        setPicked(find.matches[0]);
        setMatches([]);
      }

      const res = await apiPostPublic<{
        need_patient_pick?: boolean;
        household_members?: Match[];
        challenge_token?: string;
        masked_phone?: string;
        detail?: string;
        patient_first_name?: string;
      }>("/patient-profile-update/request-sms-code/", {
        phone,
        first_name: fn,
        last_name: ln,
      });

      if (res.need_patient_pick && res.household_members?.length) {
        setMatches(res.household_members);
        setInfo(res.detail || "Select your name to continue.");
        return;
      }

      if (!res.challenge_token) {
        setError(res.detail || "Could not send a code. Please try again.");
        return;
      }

      setChallengeToken(res.challenge_token);
      setMaskedPhone(res.masked_phone || "");
      setStep("code");
      setInfo(res.detail || "We texted a verification code to your phone.");
      setCode("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send a verification code.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeToken || code.trim().length < 4) {
      setError("Enter the 6-digit code from your text message.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await apiPostPublic<{ url: string; detail?: string }>(
        "/patient-profile-update/verify-sms-code/",
        { challenge_token: challengeToken, code: code.trim() },
      );
      if (!res.url) {
        setError("Verification worked, but no update link was returned. Please try again.");
        return;
      }
      window.location.assign(res.url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That code did not work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-in-up space-y-4">
      <p className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2 text-sm text-slate-700">
        Update your <strong className="text-slate-900">contact info or payment card</strong>. We text a
        one-time code to confirm it’s you.{" "}
        <button
          type="button"
          onClick={onBack}
          className="font-semibold text-[#0d5c2e] underline-offset-4 hover:underline"
        >
          Back to booking
        </button>
      </p>

      <div className="space-y-4 rounded-xl border border-[#166534]/25 bg-[#f0fdf4]/60 p-4">
        <h2 className="text-lg font-semibold text-[#0d5c2e]">Update my info &amp; card</h2>
        <p className="text-sm leading-relaxed text-slate-600">
          Enter the <strong className="text-slate-800">same cell number</strong> on your chart. After we
          find your profile, we’ll text a code. Then you can update address, phone, email, and your card
          on Square’s secure form.
        </p>

        {step === "phone" ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-white p-2">
              <PhoneInput
                international
                defaultCountry="US"
                countryCallingCodeEditable={false}
                value={phone}
                onChange={setPhone}
                className="phone-input"
                placeholder="Mobile phone"
              />
            </div>

            {matches.length > 1 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-800">Who are you?</p>
                <div className="flex flex-wrap gap-2">
                  {matches.map((m) => {
                    const selected =
                      picked?.first_name === m.first_name && picked?.last_name === m.last_name;
                    return (
                      <button
                        key={`${m.first_name}-${m.last_name}`}
                        type="button"
                        onClick={() => {
                          setPicked(m);
                          void lookupAndRequest(m.first_name, m.last_name);
                        }}
                        disabled={busy}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                          selected
                            ? "border-[#0d5c2e] bg-[#0d5c2e] text-white"
                            : "border-slate-200 bg-white text-slate-800 hover:border-[#0d5c2e]/40"
                        }`}
                      >
                        {m.first_name} {m.last_name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void lookupAndRequest()}
                className="rounded-xl bg-[#0d5c2e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4a25] disabled:opacity-60"
              >
                {busy ? "Checking…" : "Text me a code"}
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={(e) => void verify(e)} className="space-y-3">
            <p className="text-sm text-slate-700">
              Code sent to <strong>{maskedPhone || "your phone"}</strong>
              {picked ? (
                <>
                  {" "}
                  for <strong>
                    {picked.first_name} {picked.last_name}
                  </strong>
                </>
              ) : null}
              .
            </p>
            <label className="block text-sm font-medium text-slate-700">
              Verification code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-lg tracking-[0.3em] shadow-sm focus:border-[#0d5c2e]/50 focus:outline-none focus:ring-2 focus:ring-[#0d5c2e]/15"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                maxLength={6}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busy || code.length < 6}
                className="rounded-xl bg-[#0d5c2e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4a25] disabled:opacity-60"
              >
                {busy ? "Checking…" : "Verify & continue"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setStep("phone");
                  setChallengeToken("");
                  setCode("");
                  setError("");
                  setInfo("");
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Use a different number
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void lookupAndRequest(picked?.first_name, picked?.last_name)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[#0d5c2e] hover:underline"
              >
                Resend code
              </button>
            </div>
          </form>
        )}

        {info ? <p className="text-sm text-emerald-900">{info}</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>
    </div>
  );
}
