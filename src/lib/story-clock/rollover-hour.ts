export const DEFAULT_ROLLOVER_UTC_HOUR = 16;

/**
 * The instant the next country-day begins: the next occurrence of the rollover
 * hour, in UTC, strictly after `from`. Pure, so the countdown and the cron agree.
 */
export function nextRolloverAt(from: Date, utcHour = DEFAULT_ROLLOVER_UTC_HOUR): Date {
  const hour = Math.min(23, Math.max(0, Math.round(utcHour)));
  const next = new Date(from);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(hour);
  if (next.getTime() <= from.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/** Milliseconds until the next rollover, never negative. */
export function millisecondsUntilRollover(
  from: Date,
  utcHour = DEFAULT_ROLLOVER_UTC_HOUR,
): number {
  return Math.max(0, nextRolloverAt(from, utcHour).getTime() - from.getTime());
}
