/**
 * Format a Date as relative time ("5 min ago" / "3h ago") falling back to
 * absolute ("14:23 · 14 Mar") once older than 24 hours.
 *
 * Pure function — caller passes `now` for testability. Default `now` is the
 * current time at call.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function relativeTime(date: Date | string, now: Date = new Date()): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const deltaMs = now.getTime() - then.getTime();

  if (deltaMs < MINUTE_MS) return "just now";
  if (deltaMs < HOUR_MS) {
    const minutes = Math.floor(deltaMs / MINUTE_MS);
    return `${minutes} min ago`;
  }
  if (deltaMs < DAY_MS) {
    const hours = Math.floor(deltaMs / HOUR_MS);
    return `${hours}h ago`;
  }

  const hh = String(then.getHours()).padStart(2, "0");
  const mm = String(then.getMinutes()).padStart(2, "0");
  const day = then.getDate();
  const month = MONTHS[then.getMonth()];
  return `${hh}:${mm} · ${day} ${month}`;
}
