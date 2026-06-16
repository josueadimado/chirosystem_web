"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiGet, apiPost } from "@/lib/api";

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

type SavedCardDisplay = { card_brand: string; card_last4: string };

type Props = {
  patientId: number;
  existingSavedCard?: SavedCardDisplay | null;
  onSaved?: (card: SavedCardDisplay) => void;
  containerId?: string;
};

function formatBrand(brand: string) {
  return (brand || "Card").replace(/\b\w/g, (c) => c.toUpperCase());
}

function CardOnFileBadge({ brand, last4 }: { brand: string; last4: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 px-5 py-4 text-white shadow-md ring-1 ring-white/10">
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/5" />
      <div className="pointer-events-none absolute -bottom-8 -left-4 h-20 w-20 rounded-full bg-emerald-400/10" />
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">Card on file</p>
      <p className="mt-2 text-lg font-semibold tracking-wide">{formatBrand(brand)}</p>
      <p className="mt-1 font-mono text-sm tabular-nums tracking-widest text-white/90">
        •••• •••• •••• {last4}
      </p>
    </div>
  );
}

/**
 * Staff / doctor: add or replace a patient's card on file (Square Web Payments SDK).
 */
export function PatientCardSetup({
  patientId,
  existingSavedCard = null,
  onSaved,
  containerId = "staff-square-card-container",
}: Props) {
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
  }, [existingSavedCard?.card_brand, existingSavedCard?.card_last4, patientId]);

  useEffect(() => {
    apiGet<SquareConfig>("/booking-options/square-config/")
      .then(setConfig)
      .catch(() =>
        setConfig({ enabled: false, application_id: "", location_id: "", environment: "sandbox" }),
      );
  }, []);

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
      }>(`/patients/${patientId}/save-card/`, {
        source_id: result.token,
        verification_token: result.verificationToken || "",
      });
      const display: SavedCardDisplay = {
        card_brand: saved.card_brand ?? "",
        card_last4: saved.card_last4 ?? "",
      };
      setOnFile(display);
      setSuccess("Card saved — you can charge it after a visit or from billing.");
      onSaved?.(display);
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

  if (!config?.enabled) {
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
            <p className="text-sm font-semibold text-slate-900">Payment card</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              Save a card to charge after visits, no-shows, or from billing. Only the last four digits are kept on
              file.
            </p>
          </div>
          {!showForm && (
            <button
              type="button"
              onClick={() => {
                setSuccess("");
                setLoadErr("");
                setShowForm(true);
              }}
              className="shrink-0 rounded-xl bg-[#16a349] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#13823d] focus:outline-none focus:ring-2 focus:ring-[#16a349]/30"
            >
              {onFile ? "Replace card" : "Add card"}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        {success && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-900">
            {success}
          </p>
        )}
        {loadErr && !showForm && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{loadErr}</p>
        )}

        {onFile && !showForm ? (
          <div className="max-w-sm">
            <CardOnFileBadge brand={onFile.card_brand} last4={onFile.card_last4} />
            <p className="mt-2 text-xs text-slate-500">Ready to charge from the doctor dashboard or billing screen.</p>
          </div>
        ) : !showForm ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200/80 text-slate-500">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">No card on file</p>
              <p className="text-xs text-slate-500">Tap Add card when the patient is ready to pay by card.</p>
            </div>
          </div>
        ) : null}

        {showForm && (
          <form onSubmit={handleSave} className="animate-fade-in space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <p className="text-xs font-medium text-slate-600">
                {onFile ? "Enter the new card below — it will replace the card on file." : "Enter the patient's card details."}
              </p>
              <div
                id={containerId}
                className="mt-3 min-h-[148px] w-full rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-inner"
              />
              {!sdkReady && (
                <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                  Loading secure card field…
                </p>
              )}
            </div>

            {loadErr && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{loadErr}</p>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <button
                type="submit"
                disabled={!sdkReady || busy}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save card securely"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={closeForm}
                className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <p className="w-full text-[11px] text-slate-400 sm:ml-auto sm:w-auto">
                Processed by Square · card data never stored on our servers
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
