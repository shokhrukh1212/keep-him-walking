import type { ScheduledActionView } from "@/lib/contracts";
import { REACTION_DEDUPE_ACTIVE_SECONDS, REACTION_MOTION_KIND, type ReactionKind } from "./threshold";

/** Live stops the crowd booked for this reaction. A missing source means the crowd. */
function crowdStops(kind: ReactionKind, rows: readonly ScheduledActionView[]) {
  const motion = REACTION_MOTION_KIND[kind];
  return rows.filter((row) => !row.cancelled && (row.source ?? "crowd") === "crowd" && row.kind === motion);
}

/** The watched second the crowd can ask for this again, or null when he is not resting from it. */
export function reactionRestUntil(kind: ReactionKind, rows: readonly ScheduledActionView[]): number | null {
  const stops = crowdStops(kind, rows);
  if (stops.length === 0) return null;
  return Math.max(...stops.map((row) => row.atActiveSecond)) + REACTION_DEDUPE_ACTIVE_SECONDS;
}

/** Whole watched seconds of rest left. Without a clock there is no countdown to show. */
export function reactionRestSeconds(
  kind: ReactionKind,
  rows: readonly ScheduledActionView[],
  activeSeconds: number,
): number {
  const until = reactionRestUntil(kind, rows);
  if (until === null || !Number.isFinite(activeSeconds)) return 0;
  return Math.max(0, Math.ceil(until - activeSeconds));
}

/**
 * A crowd booking of this reaction that the server holds now and did not hold when a
 * request left. It is how a request whose answer was lost is confirmed after all.
 */
export function newCrowdBooking(
  kind: ReactionKind,
  before: readonly ScheduledActionView[],
  after: readonly ScheduledActionView[],
): number | null {
  const known = new Set(crowdStops(kind, before).map((row) => row.atActiveSecond));
  const fresh = crowdStops(kind, after).filter((row) => !known.has(row.atActiveSecond));
  return fresh.length > 0 ? Math.max(...fresh.map((row) => row.atActiveSecond)) : null;
}
