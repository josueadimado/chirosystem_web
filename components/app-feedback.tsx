"use client";

import { Loader } from "@/components/loader";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type ToastVariant = "success" | "error" | "info";

type ToastItem = {
  id: number;
  variant: ToastVariant;
  message: string;
};

type RunOptions<T = unknown> = {
  /** Shown on the dim overlay while the promise runs */
  loadingMessage?: string;
  /** Shown as a toast when the operation succeeds (omit or return "" to skip) */
  successMessage?: string | ((result: T) => string);
  /** Used when the error is not an ApiError */
  errorFallback?: string;
};

type AppFeedbackContextValue = {
  /** Short-lived messages (bottom-right). */
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
  };
  /**
   * Runs an async action with a full-screen busy overlay, then shows success or error toast.
   * Returns the result on success, or undefined if it failed.
   */
  runWithFeedback: <T>(operation: () => Promise<T>, options?: RunOptions<T>) => Promise<T | undefined>;
};

const AppFeedbackContext = createContext<AppFeedbackContextValue | null>(null);

const TOAST_DURATION_MS = 5200;
let toastIdSeq = 0;

function ToastIcon({ variant }: { variant: ToastVariant }) {
  const common = "h-5 w-5 shrink-0";
  if (variant === "success") return <CheckCircle2 className={cn(common, "text-[#16a349]")} aria-hidden />;
  if (variant === "error") return <XCircle className={cn(common, "text-rose-600")} aria-hidden />;
  return <Info className={cn(common, "text-sky-600")} aria-hidden />;
}

export function AppFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [busyDepth, setBusyDepth] = useState(0);
  const [busyMessage, setBusyMessage] = useState("Working…");
  const [mounted, setMounted] = useState(false);
  const liveId = useId();
  const dismissTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const timers = dismissTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const removeToast = useCallback((id: number) => {
    const t = dismissTimers.current.get(id);
    if (t) clearTimeout(t);
    dismissTimers.current.delete(id);
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const pushToast = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = ++toastIdSeq;
      const trimmed = message.trim();
      if (!trimmed) return;
      setToasts((prev) => [...prev.slice(-4), { id, variant, message: trimmed }]);
      const timer = setTimeout(() => removeToast(id), TOAST_DURATION_MS);
      dismissTimers.current.set(id, timer);
    },
    [removeToast],
  );

  const toastApi = useMemo(
    () => ({
      success: (m: string) => pushToast("success", m),
      error: (m: string) => pushToast("error", m),
      info: (m: string) => pushToast("info", m),
    }),
    [pushToast],
  );

  const pushBusy = useCallback((message?: string) => {
    if (message) setBusyMessage(message);
    setBusyDepth((d) => d + 1);
  }, []);

  const popBusy = useCallback(() => {
    setBusyDepth((d) => Math.max(0, d - 1));
  }, []);

  const runWithFeedback = useCallback(
    async <T,>(operation: () => Promise<T>, options?: RunOptions<T>): Promise<T | undefined> => {
      pushBusy(options?.loadingMessage ?? "Working…");
      try {
        const result = await operation();
        popBusy();
        const sm = options?.successMessage;
        if (sm !== undefined) {
          const text = typeof sm === "function" ? sm(result) : sm;
          if (text && text.trim()) toastApi.success(text.trim());
        }
        return result;
      } catch (e) {
        popBusy();
        const msg =
          e instanceof ApiError ? e.message : options?.errorFallback ?? "Something went wrong. Please try again.";
        toastApi.error(msg);
        return undefined;
      }
    },
    [popBusy, pushBusy, toastApi],
  );

  const value = useMemo(
    () => ({
      toast: toastApi,
      runWithFeedback,
    }),
    [toastApi, runWithFeedback],
  );

  const portal =
    mounted &&
    createPortal(
      <>
        {/* Busy overlay */}
        {busyDepth > 0 && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/35 backdrop-blur-[3px] animate-fade-in"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={liveId}
            aria-busy="true"
          >
            <div className="mx-4 w-full max-w-sm rounded-2xl border border-white/60 bg-white/95 p-8 shadow-2xl shadow-slate-900/20 ring-1 ring-slate-200/80">
              <Loader variant="page" label={busyMessage} sublabel="Please wait — this usually takes a moment." />
            </div>
          </div>
        )}

        {/* Toasts */}
        <div
          className="pointer-events-none fixed bottom-4 right-4 z-[210] flex max-w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
          aria-live="polite"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto flex gap-3 rounded-xl border px-4 py-3 shadow-lg animate-fade-in-up",
                t.variant === "success" && "border-[#16a349]/25 bg-white text-slate-800 ring-1 ring-[#16a349]/10",
                t.variant === "error" && "border-rose-200 bg-white text-slate-800 ring-1 ring-rose-100",
                t.variant === "info" && "border-sky-200 bg-white text-slate-800 ring-1 ring-sky-100",
              )}
              role="status"
            >
              <ToastIcon variant={t.variant} />
              <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{t.message}</p>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <span id={liveId} className="sr-only">
          {busyDepth > 0 ? busyMessage : ""}
        </span>
      </>,
      document.body,
    );

  return (
    <AppFeedbackContext.Provider value={value}>
      {children}
      {portal}
    </AppFeedbackContext.Provider>
  );
}

export function useAppFeedback(): AppFeedbackContextValue {
  const ctx = useContext(AppFeedbackContext);
  if (!ctx) {
    throw new Error("useAppFeedback must be used within AppFeedbackProvider");
  }
  return ctx;
}
