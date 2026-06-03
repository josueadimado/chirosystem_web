/** From GET /appointments/ — countdown before automatic no-show (today, booked/checked-in only). */
export type AutoNoShowCountdown = {
  enabled: boolean;
  applies: boolean;
  exempt: boolean;
  grace_minutes: number;
  minutes_remaining: number | null;
  past_deadline: boolean;
  deadline_display?: string;
};

export function formatAutoNoShowCountdown(c: AutoNoShowCountdown | null | undefined): string {
  if (!c) return "";
  if (!c.enabled) return "Automatic no-show is turned off in Admin → Settings.";
  if (c.exempt) return "Automatic no-show is paused for this visit.";
  if (!c.applies) return "";
  if (c.past_deadline || c.minutes_remaining === 0) {
    return `Past the ${c.grace_minutes}-minute grace period — may be marked no-show on the next system run (every ~15 min).`;
  }
  const m = c.minutes_remaining ?? 0;
  const deadline = c.deadline_display ? ` (around ${c.deadline_display})` : "";
  return `Auto no-show in about ${m} minute${m === 1 ? "" : "s"}${deadline} unless you check them in, reschedule, or cancel.`;
}
