import { DEFAULT_ROLLOVER_UTC_HOUR } from "./rollover-hour";

const DAY_MS = 86_400_000;
const PREWARM_LEAD_MS = 5 * 60_000;

/** The immutable day boundary (the rollover hour, UTC) at or before this wall-clock instant. */
export function logicalDayBoundaryAtOrBefore(
  now: Date,
  rolloverUtcHour = DEFAULT_ROLLOVER_UTC_HOUR,
) {
  const boundary = new Date(now);
  boundary.setUTCHours(rolloverUtcHour, 0, 0, 0);
  if (boundary.getTime() > now.getTime()) boundary.setUTCDate(boundary.getUTCDate() - 1);
  return boundary;
}

/**
 * What the minute run owes at this instant for a day that turns over at `rolloverUtcHour`:
 * the boundary it reconciles (a late or repeated run keeps the same one), and whether the
 * five-minute prewarm before the next boundary is due.
 */
export function minuteReconciliationPlan(now: Date, rolloverUtcHour = DEFAULT_ROLLOVER_UTC_HOUR) {
  const boundary = logicalDayBoundaryAtOrBefore(now, rolloverUtcHour);
  const untilNext = boundary.getTime() + DAY_MS - now.getTime();
  return {
    boundary,
    prewarmDue: untilNext > 0 && untilNext <= PREWARM_LEAD_MS,
  };
}
