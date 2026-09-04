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

type SavedCardRow = {
  id?: number;
  card_brand: string;
  card_last4: string;
  is_default?: boolean;
};

type SavedCardDisplay = { card_brand: string; card_last4: string; saved_cards?: SavedCardRow[] };

type Props = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | undefined;
  /** When set, patient already has a card on file — we do not prompt to add one unless they choose to update. */
  existingSavedCard?: SavedCardDisplay | null;
  existingSavedCards?: SavedCardRow[] | null;
};

function formatBrand(brand: string) {
  return (brand || "Card").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Optional Square card-on-file during booking (Web Payments SDK).
 * See https://developer.squareup.com/docs/web-payments/overview
 */
export function BookingCardSetup({
  firstName,
  lastName,
  email,
  phone,
  existingSavedCard = null,
  existingSavedCards = null,
}: Props) {
  const [config, setConfig] = useState<SquareConfig | null>(null);
  /** User chose to add another card, or no card on file yet */
  const [showForm, setShowForm] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const cardRef = useRef<SquareCard | null>(null);
  /** After a successful save in this session (parent may not re-fetch immediately) */
  const [cards, setCards] = useState<SavedCardRow[]>(() => {
    if (existingSavedCards?.length) return existingSavedCards;
    if (existingSavedCard?.saved_cards?.length) return existingSavedCard.saved_cards;
    if (existingSavedCard?.card_last4) {
      return [{ card_brand: existingSavedCard.card_brand, card_last4: existingSavedCard.card_last4, is_default: true }];
    }
    return [];
  });

  useEffect(() => {
    if (existingSavedCards?.length) {
      setCards(existingSavedCards);
    } else if (existingSavedCard?.saved_cards?.length) {
      setCards(existingSavedCard.saved_cards);
    } else if (existingSavedCard?.card_last4) {
      setCards([
        { card_brand: existingSavedCard.card_brand, card_last4: existingSavedCard.card_last4, is_default: true },
      ]);
    } else {
      setCards([]);
    }
  }, [phone, existingSavedCards, existingSavedCard?.card_brand, existingSavedCard?.card_last4, existingSavedCard?.saved_cards]);

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
      const saved = await apiPostPublic<{
        card_brand?: string;
        card_last4?: string;
        saved_cards?: SavedCardRow[];
      }>("/booking-options/save-card/", {
        phone,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        source_id: result.token,
        verification_token: result.verificationToken || "",
      });
      const list = saved.saved_cards?.length
        ? saved.saved_cards
        : [
            {
              card_brand: saved.card_brand ?? "",
              card_last4: saved.card_last4 ?? "",
              is_default: true,
            },
          ];
      setCards(list);
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

      {cards.length > 0 ? (
        <>
          <ul className="mt-2 space-y-1.5">
            {cards.map((c, idx) => (
              <li key={c.id || `${c.card_brand}-${c.card_last4}-${idx}`} className="text-sm text-slate-700">
                We have <strong>{formatBrand(c.card_brand)}</strong> ending in <strong>{c.card_last4}</strong>
                {c.is_default ? " (default)" : ""} on file.
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-slate-500">No need to re-enter a card for this booking unless you want to add another.</p>
          {!showForm && (
            <button
              type="button"
              onClick={() => {
                setSuccess("");
                setLoadErr("");
                setShowForm(true);
              }}
              className="mt-3 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Add another card
            </button>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-slate-700">
            Save a card for faster checkout—we only see the last 4 digits. Charged at time of service.
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
        </>
      )}

      {loadErr && <p className="mt-2 text-sm text-rose-600">{loadErr}</p>}
      {success && <p className="mt-2 text-sm font-medium text-[#166534]">{success}</p>}

      {showForm && (
        <form onSubmit={handleSave} className="mt-4 space-y-3">
          {cards.length ? (
            <p className="text-sm text-slate-600">
              Enter another card below. Saving adds it — it does not remove cards already on file.
            </p>
          ) : null}
          <div id="square-card-container" className="min-h-[120px] rounded-lg border border-slate-200 bg-slate-50 p-2" />
          {!sdkReady && <p className="text-xs text-slate-500">Loading secure card field…</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!sdkReady || busy}
              className="min-w-0 flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save card securely"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setShowForm(false);
                setLoadErr("");
                setSdkReady(false);
                const c = cardRef.current;
                cardRef.current = null;
                if (c) void c.destroy().catch(() => {});
              }}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
