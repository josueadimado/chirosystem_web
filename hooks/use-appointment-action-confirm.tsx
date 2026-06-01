"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCallback, useEffect, useRef, useState } from "react";

export type AppointmentConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive actions (cancel, no-show) use a red confirm button. */
  tone?: "default" | "destructive";
};

type PendingConfirm = {
  options: AppointmentConfirmOptions;
  resolve: (value: boolean) => void;
};

/**
 * Promise-based confirm dialog for staff appointment actions (replaces window.confirm).
 * Render `<ConfirmDialog />` once near the root of the page.
 */
export function useAppointmentActionConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);
  pendingRef.current = pending;

  const settle = useCallback((value: boolean) => {
    const p = pendingRef.current;
    if (!p) return;
    setPending(null);
    p.resolve(value);
  }, []);

  const requestConfirm = useCallback((options: AppointmentConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ options, resolve });
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") settle(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, settle]);

  const ConfirmDialog = () => {
    if (!pending) return null;
    const { title, description, confirmLabel = "Proceed", cancelLabel = "Cancel", tone = "default" } =
      pending.options;
    return (
      <Dialog open onOpenChange={(open) => !open && settle(false)}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="text-left whitespace-pre-wrap">{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t-0 bg-transparent p-0 pt-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => settle(false)}>
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={tone === "destructive" ? "destructive" : "default"}
              className={tone === "default" ? "bg-[#16a349] text-white hover:bg-[#13823d]" : undefined}
              onClick={() => settle(true)}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  return { requestConfirm, ConfirmDialog };
}
