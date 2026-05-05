"use client";

import { useEffect, useRef, useState } from "react";
import { apiGetAuth } from "@/lib/api";

type StatusResponse = {
  checkout_id: string;
  status: string;
  payment_id?: string;
  error?: string;
};

/**
 * After the API creates a Square Terminal checkout, poll until the device completes or cancels.
 * https://developer.squareup.com/reference/square/terminal-api/create-terminal-checkout
 */
export function SquareTerminalCheckoutPoller({
  checkoutId,
  /** API path for GET status poll (default: doctor dashboard). Admin tests use `/admin/terminal_checkout_status/`. */
  statusPath = "/doctor/terminal_checkout_status/",
  onComplete,
  onTerminalError,
}: {
  checkoutId: string;
  statusPath?: string;
  onComplete: () => void;
  onTerminalError: (msg: string) => void;
}) {
  const [log, setLog] = useState("Waiting for payment on the Square Terminal…");
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    let attempts = 0;
    const maxAttempts = 120;

    const tick = async () => {
      if (stopped.current) return;
      attempts += 1;
      if (attempts > maxAttempts) {
        onTerminalError("Timed out waiting for the terminal. Check the device or try again.");
        return;
      }
      try {
        const q = new URLSearchParams({ checkout_id: checkoutId });
        const base = statusPath.endsWith("/") ? statusPath : `${statusPath}/`;
        const res = await apiGetAuth<StatusResponse>(`${base}?${q.toString()}`);
        const st = (res.status || "").toUpperCase();
        if (st === "COMPLETED") {
          setLog("Payment completed.");
          onComplete();
          return;
        }
        if (st === "CANCELED" || st === "CANCEL_REQUESTED") {
          onTerminalError("Payment was canceled on the terminal.");
          return;
        }
        if (st === "ERROR") {
          onTerminalError(res.error || "Terminal checkout error.");
          return;
        }
        setLog(`Terminal status: ${res.status}…`);
      } catch {
        setLog("Checking terminal status…");
      }
      setTimeout(tick, 2000);
    };

    void tick();
    return () => {
      stopped.current = true;
    };
  }, [checkoutId, statusPath, onComplete, onTerminalError]);

  return (
    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{log}</p>
  );
}
