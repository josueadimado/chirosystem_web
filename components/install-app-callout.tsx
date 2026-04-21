"use client";

import { useCallback, useEffect, useState } from "react";

const storageKey = (variant: "kiosk" | "staff") => `chiroflow_install_hint_dismissed_${variant}`;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIosLike(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/**
 * Shown on kiosk and staff areas so tablets/desktops can install a focused PWA (Chrome/Edge install button;
 * iPad/iPhone instructions for Add to Home Screen). Hidden when already running as an installed app.
 */
export function InstallAppCallout({ variant }: { variant: "kiosk" | "staff" }) {
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return;
    try {
      if (sessionStorage.getItem(storageKey(variant)) === "1") return;
    } catch {
      /* private mode */
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    // iOS Safari has no beforeinstallprompt — still show short instructions once.
    if (isIosLike()) {
      setVisible(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, [variant]);

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(storageKey(variant), "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }, [variant]);

  const runInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    setDeferred(null);
    dismiss();
  };

  if (!visible) return null;

  const title =
    variant === "kiosk" ? "Install check-in on this tablet" : "Install staff portal on this device";
  const bodyChrome =
    variant === "kiosk"
      ? "Add this screen to your home screen or apps for a full-screen check-in experience."
      : "Add this screen to your home screen or taskbar for quick access. Installed staff apps open the sign-in page.";

  return (
    <div
      role="region"
      aria-label="Install web app"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/80 bg-card/95 px-4 py-3 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur-md sm:px-6"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {deferred ? bodyChrome : isIosLike() ? "Tap Share, then “Add to Home Screen”." : bodyChrome}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {deferred ? (
            <button
              type="button"
              onClick={() => void runInstall()}
              className="rounded-xl bg-[#16a349] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#13823d]"
            >
              Install
            </button>
          ) : null}
          <button
            type="button"
            onClick={dismiss}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/60"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
