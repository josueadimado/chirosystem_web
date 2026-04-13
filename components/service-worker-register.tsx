"use client";

import { useEffect } from "react";

/**
 * Registers the app shell service worker so the site meets PWA install criteria
 * (manifest + HTTPS + active service worker). Safe no-op if unsupported or blocked.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          /* Dev without HTTPS or blocked third-party — install may still work on iOS via Share */
        });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
