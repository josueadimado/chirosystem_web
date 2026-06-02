"use client";

import { useEffect } from "react";

/**
 * Production only: minimal service worker for PWA “Install app” (see public/sw.js).
 * It does not cache pages — every request goes to the network.
 *
 * Development: we skip registration and remove any old workers so local changes
 * show up immediately (no stale shell from a previous visit).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV === "development") {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          void registration.unregister();
        }
      });
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          /* Blocked or unsupported — install may still work on iOS via Share */
        });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
