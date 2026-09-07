/**
 * Temporary staff UI announcements: NEW nav badges + maintenance banner.
 * Edit here when you add/remove "new" highlights or schedule an upgrade notice.
 */

/** Paths that show a small NEW badge in the sidebar until end of `until` (YYYY-MM-DD). */
export const NEW_NAV_UNTIL: Record<string, string> = {
  "/admin/reconciliation": "2026-10-07",
  "/admin/intake": "2026-10-07",
  "/doctor/intake": "2026-10-07",
  "/admin/patients/merge": "2026-10-07",
  "/doctor/patients/merge": "2026-10-07",
};

/** Stable id for dismiss storage — change when you post a new upgrade notice. */
export const SYSTEM_UPGRADE_NOTICE_ID = "server-upgrade-2026-09-08-midnight";

/**
 * Clinic calendar date of the upgrade (midnight that morning starts the window).
 * Staff connecting on Sep 7 see “tomorrow”; after Sep 8 morning the banner expires.
 */
export const SYSTEM_UPGRADE_YMD = "2026-09-08";

/** Fallback if clinic timezone cannot be loaded (matches API default). */
export const DEFAULT_CLINIC_TIMEZONE = "America/Detroit";

/** How long after upgrade midnight to keep showing the banner (hours). */
export const SYSTEM_UPGRADE_NOTICE_AFTER_HOURS = 6;

export function isNewNavBadgeActive(href: string, now = new Date()): boolean {
  const until = NEW_NAV_UNTIL[href];
  if (!until) return false;
  const end = new Date(`${until}T23:59:59`);
  return now.getTime() <= end.getTime();
}
