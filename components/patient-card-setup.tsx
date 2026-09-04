"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiDelete, apiGet, apiPost } from "@/lib/api";

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

export type SavedCardRow = {
  id: number;
  card_brand: string;
  card_last4: string;
  is_default: boolean;
  square_card_id?: string;
};

type SavedCardDisplay = { card_brand: string; card_last4: string };

type Props = {
  patientId: number;
  /** Legacy single-card hint from patient detail (still used if saved_cards empty). */
  existingSavedCard?: SavedCardDisplay | null;
  /** Multi-card list from API when available. */
  existingSavedCards?: SavedCardRow[] | null;
  onSaved?: (card: SavedCardDisplay & { saved_cards?: SavedCardRow[] }) => void;
  containerId?: string;
};

function formatBrand(brand: string) {
  return (brand || "Card").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Staff / doctor: add multiple cards on file, set default, remove (Square Web Payments SDK).
 */
export function PatientCardSetup({
  patientId,
  existingSavedCard = null,
  existingSavedCards = null,
  onSaved,
  containerId = "staff-square-card-container",
}: Props) {
  const [config, setConfig] = useState<SquareConfig | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [makeDefault, setMakeDefault] = useState(true);
  const cardRef = useRef<SquareCard | null>(null);
  const [cards, setCards] = useState<SavedCardRow[]>(() => {
    if (existingSavedCards?.length) return existingSavedCards;
    if (existingSavedCard?.card_last4) {
      return [
        {
          id: 0,
          card_brand: existingSavedCard.card_brand,
          card_last4: existingSavedCard.card_last4,
          is_default: true,
        },
      ];
    }
    return [];
  });

  useEffect(() => {
    if (existingSavedCards?.length) {
      setCards(existingSavedCards);
    } else if (existingSavedCard?.card_last4) {
      setCards((prev) =>
        prev.length
          ? prev
          : [
              {
                id: 0,
                card_brand: existingSavedCard.card_brand,
                card_last4: existingSavedCard.card_last4,
                is_default: true,
              },
            ],
      );
    }
  }, [existingSavedCards, existingSavedCard?.card_brand, existingSavedCard?.card_last4]);

  useEffect(() => {
    apiGet<SquareConfig>("/booking-options/square-config/")
      .then(setConfig)
      .catch(() =>
        setConfig({ enabled: false, application_id: "", location_id: "", environment: "sandbox" }),
      );
  }, []);

  const refreshFromServer = useCallback(async () => {
    try {
      const data = await apiGet<{
        saved_cards?: SavedCardRow[];
        card_brand?: string;
        card_last4?: string;
      }>(`/patients/${patientId}/saved-cards/`);
      const list = data.saved_cards || [];
      setCards(list);
      const def = list.find((c) => c.is_default) || list[0];
      onSaved?.({
        card_brand: def?.card_brand || data.card_brand || "",
        card_last4: def?.card_last4 || data.card_last4 || "",
        saved_cards: list,
      });
    } catch {
      /* keep local */
    }
  }, [patientId, onSaved]);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setLoadErr("");
    setSdkReady(false);
    const c = cardRef.current;
    cardRef.current = null;
    if (c) void c.destroy().catch(() => {});
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
      await card.attach(`#${containerId}`);
      cardRef.current = card;
      setSdkReady(true);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not start card form.");
    }
  }, [config?.application_id, config?.location_id, config?.environment, containerId]);

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
      const saved = await apiPost<{
        card_brand?: string;
        card_last4?: string;
        saved_cards?: SavedCardRow[];
      }>(`/patients/${patientId}/save-card/`, {
        source_id: result.token,
        verification_token: result.verificationToken || "",
        set_as_default: makeDefault,
      });
      const list = saved.saved_cards || [];
      setCards(list);
      setSuccess("Card saved. You can charge any card on file after a visit.");
      onSaved?.({
        card_brand: saved.card_brand ?? "",
        card_last4: saved.card_last4 ?? "",
        saved_cards: list,
      });
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

  const setDefault = async (cardId: number) => {
    if (!cardId) {
      setLoadErr("Refresh the page, then set the default card again.");
      return;
    }
    setBusy(true);
    setLoadErr("");
    try {
      await apiPost(`/patients/${patientId}/saved-cards/${cardId}/set-default/`, {});
      await refreshFromServer();
      setSuccess("Default card updated.");
    } catch (e) {
      setLoadErr(e instanceof ApiError ? e.message : "Could not update default card.");
    } finally {
      setBusy(false);
    }
  };

  const removeCard = async (cardId: number) => {
    if (!cardId) {
      setLoadErr("Refresh the page, then remove the card again.");
      return;
    }
    if (!window.confirm("Remove this card from the patient chart?")) return;
    setBusy(true);
    setLoadErr("");
    try {
      await apiDelete(`/patients/${patientId}/saved-cards/${cardId}/`);
      await refreshFromServer();
      setSuccess("Card removed.");
    } catch (e) {
      setLoadErr(e instanceof ApiError ? e.message : "Could not remove card.");
    } finally {
      setBusy(false);
    }
  };

  if (!config) {
    return <p className="text-sm text-slate-500">Loading card options…</p>;
  }

  if (!config.enabled) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-4">
        <p className="text-sm font-medium text-slate-700">Card payments not connected</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Connect Square in Admin Settings to save cards and charge patients later.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100/80">
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/90 to-emerald-50/30 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Payment cards</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              Patients can keep more than one card. Set a default for auto-charges; pick any card when charging
              manually.
            </p>
          </div>
          {!showForm && (
            <button
              type="button"
              onClick={() => {
                setSuccess("");
                setLoadErr("");
                setMakeDefault(cards.length === 0);
                setShowForm(true);
              }}
              className="shrink-0 rounded-xl bg-[#16a349] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#13823d]"
            >
              Add card
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        {success ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-900">
            {success}
          </p>
        ) : null}
        {loadErr && !showForm ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{loadErr}</p>
        ) : null}

        {!showForm && cards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-5 text-sm text-slate-600">
            No cards on file yet.
          </div>
        ) : null}

        {!showForm && cards.length > 0 ? (
          <ul className="space-y-2">
            {cards.map((c) => (
              <li
                key={c.id || `${c.card_brand}-${c.card_last4}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {formatBrand(c.card_brand)} •••• {c.card_last4}
                    {c.is_default ? (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                        Default
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!c.is_default && c.id ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setDefault(c.id)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Make default
                    </button>
                  ) : null}
                  {c.id ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeCard(c.id)}
                      className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {showForm ? (
          <form onSubmit={(e) => void handleSave(e)} className="animate-fade-in space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <p className="text-xs font-medium text-slate-600">
                Enter the card below. This adds another card — it does not remove cards already on file.
              </p>
              <div
                id={containerId}
                className="mt-3 min-h-[148px] w-full rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-inner"
              />
              {!sdkReady ? (
                <p className="mt-2 text-xs text-slate-500">Loading secure card field…</p>
              ) : null}
              <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={makeDefault}
                  onChange={(e) => setMakeDefault(e.target.checked)}
                />
                Set as default card for auto-charges
              </label>
            </div>
            {loadErr ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{loadErr}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={!sdkReady || busy}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save card securely"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={closeForm}
                className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
