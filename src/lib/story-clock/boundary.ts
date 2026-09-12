import { DEFAULT_ROLLOVER_UTC_HOUR } from "./rollover-hour";

/** The immutable 16:00 UTC boundary at or before this wall-clock instant. */
export function logicalDayBoundaryAtOrBefore(
  now: Date,
  rolloverUtcHour = DEFAULT_ROLLOVER_UTC_HOUR,
) {
  const boundary = new Date(now);
  boundary.setUTCHours(rolloverUtcHour, 0, 0, 0);
  if (boundary.getTime() > now.getTime()) boundary.setUTCDate(boundary.getUTCDate() - 1);
  return boundary;
}

export function minuteReconciliationPlan(now: Date) {
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return {
    boundary: logicalDayBoundaryAtOrBefore(now),
    prewarmDue: minutes >= 15 * 60 + 55 && minutes < 16 * 60,
  };
}
