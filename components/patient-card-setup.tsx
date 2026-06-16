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
  /** Current card on file from patient chart */
  existingSavedCard?: SavedCardDisplay | null;
  /** Called after a card is saved so the parent can refresh the chart */
  onSaved?: (card: SavedCardDisplay) => void;
  /** Unique DOM id for Square attach (use when multiple forms could mount) */
  containerId?: string;
};

/**
 * Staff / doctor: add or replace a patient's card on file (Square Web Payments SDK).
 * Full card numbers are never stored — only brand + last 4 on the patient record.
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
      setSuccess("Card saved. You can charge it after a visit or from billing.");
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
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Card-on-file is available when Square is connected in Admin Settings.
      </p>
    );
  }

  return (
    <div className="mt-3 border-t border-slate-200/80 pt-3">
      {onFile ? (
        <p className="text-sm text-slate-700">
          <strong>{(onFile.card_brand || "Card").replace(/\b\w/g, (c) => c.toUpperCase())}</strong> ending in{" "}
          <strong>{onFile.card_last4}</strong> — ready to charge after visits.
        </p>
      ) : (
        <p className="text-sm text-slate-600">No card on file yet. Add one so you can charge the patient later.</p>
      )}

      {!showForm && (
        <button
          type="button"
          onClick={() => {
            setSuccess("");
            setLoadErr("");
            setShowForm(true);
          }}
          className="mt-2 rounded-lg border border-[#16a349] bg-[#16a349]/5 px-3 py-2 text-sm font-semibold text-[#166534] hover:bg-[#16a349]/10"
        >
          {onFile ? "Replace card on file" : "Add card on file"}
        </button>
      )}

      {loadErr && <p className="mt-2 text-sm text-rose-600">{loadErr}</p>}
      {success && <p className="mt-2 text-sm font-medium text-[#166534]">{success}</p>}

      {showForm && (
        <form onSubmit={handleSave} className="mt-3 space-y-3">
          <p className="text-xs text-slate-500">
            Enter the patient&apos;s card below. Only the last four digits are stored on their chart.
          </p>
          <div
            id={containerId}
            className="min-h-[120px] rounded-lg border border-slate-200 bg-slate-50 p-2"
          />
          {!sdkReady && <p className="text-xs text-slate-500">Loading secure card field…</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!sdkReady || busy}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
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
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
