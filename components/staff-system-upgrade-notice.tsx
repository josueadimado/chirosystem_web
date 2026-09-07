"use client";

import { ApiError, apiGetAuth } from "@/lib/api";
import {
  DEFAULT_CLINIC_TIMEZONE,
  SYSTEM_UPGRADE_NOTICE_AFTER_HOURS,
  SYSTEM_UPGRADE_NOTICE_ID,
  SYSTEM_UPGRADE_YMD,
} from "@/lib/staff-announcements";
import { useCallback, useEffect, useState } from "react";

function storageKey(id: string): string {
  return `chiroflow_staff_notice_dismissed_${id}`;
}

function isDismissed(id: string): boolean {
  try {
    return localStorage.getItem(storageKey(id)) === "1";
  } catch {
    return false;
  }
}

function persistDismissed(id: string): void {
  try {
    localStorage.setItem(storageKey(id), "1");
  } catch {
    /* private mode */
  }
}

/** Calendar Y-M-D in an IANA timezone. */
function ymdInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Instant for midnight (00:00) on `ymd` in `timeZone`.
 */
function midnightInTimezone(ymd: string, timeZone: string): Date {
  const guess = new Date(`${ymd}T00:00:00.000Z`);
  const asLocal = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guess);
  const get = (type: string) => Number(asLocal.find((p) => p.type === type)?.value || 0);
  const asUtcMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offsetMs = asUtcMs - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}

function formatFriendlyDate(ymd: string, timeZone: string): string {
  const noonUtc = new Date(`${ymd}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(noonUtc);
}

function timezoneShortLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value || timeZone;
  } catch {
    return timeZone;
  }
}

type Props = {
  /** Prefer admin clinic_profile; doctor may fall back to default TZ. */
  timezoneSource: "admin" | "default";
};

/**
 * Banner for admin + doctor: server upgrade at the scheduled clinic midnight.
 */
export function StaffSystemUpgradeNotice({ timezoneSource }: Props) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (isDismissed(SYSTEM_UPGRADE_NOTICE_ID)) return;

      let timeZone = DEFAULT_CLINIC_TIMEZONE;
      if (timezoneSource === "admin") {
        try {
          const profile = await apiGetAuth<{ timezone?: string }>("/admin/clinic_profile/");
          if (profile.timezone?.trim()) timeZone = profile.timezone.trim();
        } catch (e) {
          if (!(e instanceof ApiError)) {
            /* keep default */
          }
        }
      }

      const now = new Date();
      const upgradeAt = midnightInTimezone(SYSTEM_UPGRADE_YMD, timeZone);
      const hideAfter = new Date(
        upgradeAt.getTime() + SYSTEM_UPGRADE_NOTICE_AFTER_HOURS * 60 * 60 * 1000,
      );

      if (now.getTime() > hideAfter.getTime()) return;

      const tzLabel = timezoneShortLabel(timeZone);
      const whenLabel = formatFriendlyDate(SYSTEM_UPGRADE_YMD, timeZone);
      const todayYmd = ymdInTz(now, timeZone);

      // Only advertise once we're within ~2 days of the upgrade (keeps wording accurate).
      if (todayYmd < "2026-09-06") return;

      const isTomorrow = todayYmd < SYSTEM_UPGRADE_YMD;
      const isUpgradeDay = todayYmd === SYSTEM_UPGRADE_YMD;

      let text: string;
      if (isTomorrow && todayYmd === "2026-09-07") {
        text = `Server upgrade tomorrow (${whenLabel}) at midnight (${tzLabel}). The system may be briefly unavailable — finish desk work before then.`;
      } else if (isTomorrow) {
        text = `Server upgrade on ${whenLabel} at midnight (${tzLabel}). The system may be briefly unavailable — finish desk work before then.`;
      } else if (isUpgradeDay && now.getTime() < upgradeAt.getTime()) {
        text = `Server upgrade tonight at midnight (${tzLabel}, ${whenLabel}). The system may be briefly unavailable.`;
      } else {
        text = `Server upgrade window (${tzLabel}). The system may be briefly unavailable — expect a short interruption.`;
      }

      if (!cancelled) {
        setMessage(text);
        setVisible(true);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [timezoneSource]);

  const dismiss = useCallback(() => {
    persistDismissed(SYSTEM_UPGRADE_NOTICE_ID);
    setVisible(false);
  }, []);

  if (!visible || !message) return null;

  return (
    <div
      className="border-b border-amber-300/80 bg-amber-50 px-[max(1rem,env(safe-area-inset-left))] py-2.5 pr-[max(1rem,env(safe-area-inset-right))] text-amber-950 shadow-sm sm:px-6"
      role="status"
    >
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-3">
        <p className="text-sm leading-snug">
          <span className="mr-2 inline-flex items-center rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
            Notice
          </span>
          {message}
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-amber-900/80 hover:bg-amber-100 hover:text-amber-950"
          aria-label="Dismiss upgrade notice"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
