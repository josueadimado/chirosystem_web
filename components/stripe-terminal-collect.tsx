"use client";

/**
 * Collects a card_present payment using Stripe Terminal JS (browser).
 * Clinics without a Stripe reader can ignore this and use Checkout or saved-card charge instead.
 */

import { apiPost } from "@/lib/api";
import { useCallback, useState } from "react";

type Props = {
  /** PaymentIntent client_secret from POST /doctor/terminal_payment_intent/ */
  clientSecret: string;
  /** From GET /doctor/terminal_reader_config/ when STRIPE_TERMINAL_LOCATION_ID is set */
  locationId: string | null;
  onSuccess: () => void;
};

function isTerminalError(x: unknown): x is { error: { message: string } } {
  if (typeof x !== "object" || x === null || !("error" in x)) return false;
  const e = (x as { error: unknown }).error;
  return typeof e === "object" && e !== null && "message" in e && typeof (e as { message: unknown }).message === "string";
}

export function StripeTerminalCollect({ clientSecret, locationId, onSuccess }: Props) {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [localErr, setLocalErr] = useState("");

  const fetchConnectionToken = useCallback(async () => {
    const { secret } = await apiPost<{ secret: string }>("/doctor/terminal_connection_token/", {});
    return secret;
  }, []);

  const runFlow = async (mode: "simulated" | "internet") => {
    setLocalErr("");
    setLog("");
    setBusy(true);
    let terminal: import("@stripe/terminal-js").Terminal | null = null;
    try {
      const { loadStripeTerminal } = await import("@stripe/terminal-js");
      const ST = await loadStripeTerminal();
      if (!ST) {
        setLocalErr(
          "Stripe Terminal could not load in this browser. Use the green “desk pay screen” button instead — no physical reader required.",
        );
        return;
      }
      terminal = ST.create({
        onFetchConnectionToken: fetchConnectionToken,
      });

      let discoverResult:
        | import("@stripe/terminal-js").DiscoverResult
        | import("@stripe/terminal-js").ErrorResponse;
      if (mode === "simulated") {
        discoverResult = await terminal.discoverReaders({ simulated: true });
      } else {
        if (!locationId?.trim()) {
          setLocalErr("No Terminal location is configured on the server (STRIPE_TERMINAL_LOCATION_ID).");
          return;
        }
        discoverResult = await terminal.discoverReaders({
          method: "internet",
          location: locationId.trim(),
        });
      }

      if (isTerminalError(discoverResult)) {
        setLocalErr(discoverResult.error.message);
        return;
      }
      const readers = discoverResult.discoveredReaders;
      if (!readers?.length) {
        setLocalErr("No readers were found. Confirm the reader is online in Stripe, or use desk checkout instead.");
        return;
      }

      const connectResult = await terminal.connectReader(readers[0]);
      if (isTerminalError(connectResult)) {
        setLocalErr(connectResult.error.message);
        return;
      }

      setLog("Reader connected — have the patient tap, insert, or swipe.");
      const collectResult = await terminal.collectPaymentMethod(clientSecret, {
        config_override: { skip_tipping: true },
      });
      if (isTerminalError(collectResult)) {
        setLocalErr(collectResult.error.message);
        await terminal.disconnectReader();
        return;
      }

      const processResult = await terminal.processPayment(collectResult.paymentIntent);
      if (isTerminalError(processResult)) {
        setLocalErr(processResult.error.message);
        await terminal.disconnectReader();
        return;
      }

      setLog("Payment sent to Stripe. This invoice will mark paid when Stripe confirms (usually seconds).");
      onSuccess();
      await terminal.disconnectReader();
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
      if (terminal) {
        try {
          await terminal.disconnectReader();
        } catch {
          /* ignore */
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-amber-950/90">
        <strong>No Stripe reader?</strong> You can still collect payment using the saved card or the desk pay screen
        above — those do not require Terminal hardware.
      </p>
      <div className="flex flex-wrap gap-2">
        {locationId ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void runFlow("internet")}
            className="rounded-lg bg-[#16a349] px-3 py-2 text-xs font-semibold text-white hover:bg-[#13823d] disabled:opacity-50"
          >
            {busy ? "Working…" : "Charge on Stripe reader (internet)"}
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void runFlow("simulated")}
          className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100/80 disabled:opacity-50"
        >
          {busy ? "Working…" : "Simulated reader (test mode)"}
        </button>
      </div>
      {log ? <p className="text-sm font-medium text-emerald-800">{log}</p> : null}
      {localErr ? <p className="text-sm text-rose-700">{localErr}</p> : null}
    </div>
  );
}
