"use client";

import { useEffect } from "react";

/**
 * Poll the schedule while viewing today so automatic no-shows (Celery, ~every 15 min)
 * update the grid without a manual page refresh.
 */
export function useScheduleAutoRefresh({
  enabled,
  refresh,
  intervalMs = 90_000,
}: {
  enabled: boolean;
  refresh: () => void | Promise<void>;
  intervalMs?: number;
}) {
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      void refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, refresh, intervalMs]);
}
