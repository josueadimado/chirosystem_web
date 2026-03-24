"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiGet, apiPostPublic } from "@/lib/api";

type SquareConfig = {
  enabled: boolean;
  application_id: string;
  location_id: string;
  environment: string;
};

/** Minimal typing for Square Web Payments SDK (https://developer.squareup.com/docs/web-payments/overview) */
type SquareCard = {
  attach: (selector: string) => Promise<void>;
  destroy: () => Promise<void>;
  tokenize: () => Promise<{
    status: string;
    token?: string;
    errors?: { message: string }[];
    verificationToken?: string;
  }>;
};

type SquarePayments = {
  card: () => Promise<SquareCard>;
};

declare global {
  interface Window {
    Square?: {
      payments: (applicationId: string, locationId: string) => Promise<SquarePayments>;
    };
  }
}

function loadSquareScript(environment: string): Promise<void> {
  const id = "square-web-payments-sdk";
  if (document.getElementById(id)) {
    return Promise.resolve();
  }
  const src =
    environment === "production"
      ? "https://web.squarecdn.com/v1/square.js"
      : "https://sandbox.web.squarecdn.com/v1/square.js";
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.id = id;
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Square.js"));
    document.head.appendChild(s);
  });
}

type Props = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | undefined;
};

/**
 * Optional Square card-on-file during booking (Web Payments SDK).
 * See https://developer.squareup.com/docs/web-payments/overview
 */
export function BookingCardSetup({ firstName, lastName, email, phone }: Props) {
  const [config, setConfig] = useState<SquareConfig | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const cardRef = useRef<SquareCard | null>(null);

  useEffect(() => {
    apiGet<SquareConfig>("/booking-options/square-config/")
      .then(setConfig)
      .catch(() =>
        setConfig({ enabled: false, application_id: "", location_id: "", environment: "sandbox" }),
      );
  }, []);

  const attachCard = useCallback(async () => {
    if (!config?.application_id || !config.location_id) return;
    setLoadErr("");
    try {
      await loadSquareScript(config.environment || "sandbox");
      if (!window.Square) {
        setLoadErr("Square payments could not load in this browser.");
        return;
      }
      const payments = await window.Square.payments(config.application_id, config.location_id);
      const card = await payments.card();
      await card.attach("#square-card-container");
      cardRef.current = card;
      setSdkReady(true);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not start card form.");
    }
  }, [config?.application_id, config?.location_id, config?.environment]);

  useEffect(() => {
    if (!showForm || !config?.enabled) return;
    void attachCard();
    return () => {
      const c = cardRef.current;
      cardRef.current = null;
      if (c) void c.destroy().catch(() => {});
    };
  }, [showForm, config?.enabled, attachCard]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadErr("");
    setSuccess("");
    if (!phone || !firstName.trim() || !lastName.trim()) {
      setLoadErr("Enter your name and a valid phone number first.");
      return;
    }
    const card = cardRef.current;
    if (!card) {
      setLoadErr("Card form is not ready yet.");
      return;
    }
    setBusy(true);
    try {
      const result = await card.tokenize();
      if (result.status !== "OK" || !result.token) {
        const msg = result.errors?.map((x) => x.message).join(" ") || "Card tokenization failed.";
        setLoadErr(msg);
        return;
      }
      await apiPostPublic("/booking-options/save-card/", {
        phone,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        source_id: result.token,
        verification_token: result.verificationToken || "",
      });
      setSuccess("Your card was saved securely. We only store the last four digits on file.");
      await card.destroy().catch(() => {});
      cardRef.current = null;
      setShowForm(false);
      setSdkReady(false);
    } catch (err) {
      setLoadErr(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (!config?.enabled) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Card-on-file checkout will be available when the clinic enables Square payments.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Optional — faster checkout</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">
        If you would like to expedite your checkout, please register your credit card in our secured database. Once you
        have inputted your information, we can only see the <strong>last four digits</strong> of this card.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">
        Your card will only be charged at the time of service and per our client payment policy. This also applies to
        any <strong>HSA (health savings account)</strong> debit cards.
      </p>
      {!showForm && (
        <button
          type="button"
          onClick={() => {
            setShowForm(true);
          }}
          className="mt-3 rounded-lg border border-[#16a349] bg-[#16a349]/5 px-4 py-2 text-sm font-semibold text-[#166534] hover:bg-[#16a349]/10"
        >
          Add a card (optional)
        </button>
      )}
      {loadErr && <p className="mt-2 text-sm text-rose-600">{loadErr}</p>}
      {success && <p className="mt-2 text-sm font-medium text-[#166534]">{success}</p>}

      {showForm && (
        <form onSubmit={handleSave} className="mt-4 space-y-3">
          <div id="square-card-container" className="min-h-[120px] rounded-lg border border-slate-200 bg-slate-50 p-2" />
          {!sdkReady && <p className="text-xs text-slate-500">Loading secure card field…</p>}
          <button
            type="submit"
            disabled={!sdkReady || busy}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save card securely"}
          </button>
        </form>
      )}
    </div>
  );
}
