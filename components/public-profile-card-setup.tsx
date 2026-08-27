"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiGet, apiPostPublic } from "@/lib/api";

type SquareConfig = {
  enabled: boolean;
  application_id: string;
  location_id: string;
  environment: string;
};

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

type SavedCardDisplay = { card_brand: string; card_last4: string; card_display_only?: boolean };

type Props = {
  token: string;
  existingSavedCard?: SavedCardDisplay | null;
  onSaved?: (card: SavedCardDisplay) => void;
};

/**
 * Patient magic-link: add/replace card on file via Square Web Payments (token never stores full PAN).
 */
export function PublicProfileCardSetup({ token, existingSavedCard = null, onSaved }: Props) {
  const [config, setConfig] = useState<SquareConfig | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const cardRef = useRef<SquareCard | null>(null);
  const [onFile, setOnFile] = useState<SavedCardDisplay | null>(
    existingSavedCard?.card_last4 ? existingSavedCard : null,
  );

  useEffect(() => {
    setOnFile(existingSavedCard?.card_last4 ? existingSavedCard : null);
  }, [existingSavedCard?.card_brand, existingSavedCard?.card_last4, existingSavedCard?.card_display_only]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await apiGet<SquareConfig>("/booking-options/square-config/");
        if (!cancelled) setConfig(cfg);
      } catch {
        if (!cancelled) setConfig({ enabled: false, application_id: "", location_id: "", environment: "" });
      }
    })();
    return () => {
      cancelled = true;
    };
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
      await card.attach("#profile-update-square-card");
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
    const card = cardRef.current;
    if (!card) {
      setLoadErr("Card form is not ready yet.");
      return;
    }
    setBusy(true);
    try {
      const result = await card.tokenize();
      if (result.status !== "OK" || !result.token) {
        const msg = result.errors?.map((x) => x.message).join(" ") || "Card could not be verified.";
        setLoadErr(msg);
        return;
      }
      const saved = await apiPostPublic<{
        card_brand?: string;
        card_last4?: string;
        detail?: string;
      }>(`/patient-profile-update/save-card/${encodeURIComponent(token)}/`, {
        source_id: result.token,
        verification_token: result.verificationToken || "",
      });
      const next = {
        card_brand: saved.card_brand ?? "",
        card_last4: saved.card_last4 ?? "",
        card_display_only: false,
      };
      setOnFile(next);
      onSaved?.(next);
      setSuccess("Your card was saved securely. We only keep the brand and last four digits.");
      await card.destroy().catch(() => {});
      cardRef.current = null;
      setShowForm(false);
      setSdkReady(false);
    } catch (err) {
      setLoadErr(err instanceof ApiError ? err.message : "Something went wrong saving the card.");
    } finally {
      setBusy(false);
    }
  };

  if (!config) {
    return <p className="text-sm text-slate-500">Loading card options…</p>;
  }

  if (!config.enabled) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
        Card updates are not available online right now. Please call the clinic.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {onFile?.card_last4 ? (
        <div className="rounded-xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 px-5 py-4 text-white shadow-md">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">Card on file</p>
          <p className="mt-2 text-lg font-semibold tracking-wide">
            {(onFile.card_brand || "Card").replace(/\b\w/g, (c) => c.toUpperCase())}
          </p>
          <p className="mt-1 font-mono text-sm tracking-widest text-white/90">•••• •••• •••• {onFile.card_last4}</p>
          {onFile.card_display_only ? (
            <p className="mt-2 text-xs text-amber-200">Please save your card again so we can charge it when needed.</p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-slate-600">No payment card on file yet.</p>
      )}

      {!showForm ? (
        <button
          type="button"
          onClick={() => {
            setSuccess("");
            setLoadErr("");
            setShowForm(true);
          }}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          {onFile?.card_last4 ? "Replace card" : "Add card"}
        </button>
      ) : (
        <form onSubmit={(e) => void handleSave(e)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">
            Enter your card below. Your full card number goes only to Square — our clinic never stores it.
          </p>
          <div id="profile-update-square-card" className="min-h-[90px]" />
          {loadErr ? <p className="text-sm text-red-700">{loadErr}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !sdkReady}
              className="rounded-xl bg-[#0d5c2e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4a25] disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save card securely"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setShowForm(false);
                setLoadErr("");
              }}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {success ? <p className="text-sm font-medium text-emerald-800">{success}</p> : null}
    </div>
  );
}
