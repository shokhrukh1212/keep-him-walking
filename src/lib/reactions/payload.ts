import type { ReactionsView, ScheduledActionView } from "@/lib/contracts";
import { ACTIVITY_SOURCES, isActivityKind, type ActivitySource } from "@/lib/world/activities";
import type { WalkingClock } from "@/lib/world/types";

type RawScheduled = {
  kind?: unknown;
  atActiveSecond?: unknown;
  endsAtActiveSecond?: unknown;
  frozenDistanceMetres?: unknown;
  source?: unknown;
  variant?: unknown;
  occurrenceKey?: unknown;
  cancelled?: unknown;
} | null | undefined;

export type RawReactionsPayload = {
  counts?: { wave?: unknown; water?: unknown; photo?: unknown } | null;
  scheduled?: unknown;
  nextScheduledAction?: RawScheduled;
  walkingClock?: unknown;
} | null | undefined;

/** Script ids and occurrence keys are closed tokens, never display text. */
const TOKEN = /^[a-z0-9][a-z0-9:_-]{0,79}$/;

function finiteOrZero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function scheduledActionFromRow(row: RawScheduled): ScheduledActionView | null {
  if (!row || !isActivityKind(row.kind)) return null;
  const at = Number(row.atActiveSecond);
  if (!Number.isFinite(at)) return null;
  const end = Number(row.endsAtActiveSecond);
  const frozen = row.frozenDistanceMetres === null || row.frozenDistanceMetres === undefined
    ? null
    : Number(row.frozenDistanceMetres);
  const source = typeof row.source === "string"
    && (ACTIVITY_SOURCES as readonly string[]).includes(row.source)
    ? row.source as ActivitySource
    : null;
  return {
    kind: row.kind,
    atActiveSecond: at,
    ...(Number.isFinite(end) && end > at ? { endsAtActiveSecond: end } : {}),
    ...(frozen === null || Number.isFinite(frozen)
      ? { frozenDistanceMetres: frozen }
      : {}),
    ...(source && source !== "crowd" ? { source } : {}),
    ...(typeof row.variant === "string" && TOKEN.test(row.variant) ? { variant: row.variant } : {}),
    ...(typeof row.occurrenceKey === "string" && TOKEN.test(row.occurrenceKey)
      ? { occurrenceKey: row.occurrenceKey }
      : {}),
    ...(row.cancelled === true ? { cancelled: true } : {}),
  };
}

/** The anchor is authority only when it is internally consistent. */
export function walkingClockFromRow(value: unknown): WalkingClock | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { anchorActiveSeconds?: unknown; heldActiveSeconds?: unknown };
  const anchor = Number(raw.anchorActiveSeconds);
  const held = Number(raw.heldActiveSeconds);
  if (!Number.isFinite(anchor) || !Number.isFinite(held) || anchor < 0 || held < 0 || held > anchor + 1e-6) {
    return null;
  }
  return { anchorActiveSeconds: anchor, heldActiveSeconds: Math.min(held, anchor) };
}

/**
 * Reactions are enums and counts only. A missing or malformed payload becomes an
 * empty board, so the buttons never show a number the server did not confirm and
 * the motion clock never receives an action nobody scheduled.
 */
export function reactionsFromRow(payload: RawReactionsPayload): ReactionsView {
  const counts = payload?.counts ?? null;
  const walkingClock = walkingClockFromRow(payload?.walkingClock);
  return {
    counts: {
      wave: finiteOrZero(counts?.wave),
      water: finiteOrZero(counts?.water),
      photo: finiteOrZero(counts?.photo),
    },
    scheduled: (Array.isArray(payload?.scheduled) ? payload.scheduled : [])
      .map((row) => scheduledActionFromRow(row as RawScheduled))
      .filter((row): row is ScheduledActionView => row !== null),
    nextScheduledAction: scheduledActionFromRow(payload?.nextScheduledAction),
    ...(walkingClock ? { walkingClock } : {}),
  };
}

/**
 * Unions the stops the bootstrap knew about with the ones a later heartbeat
 * confirmed. A heartbeat only arrives every ~20 s, so a stop committed between
 * two of them must not be lost, and the same stop must never be played twice.
 * Cancellation is one-way, so a cancelled copy always replaces a live one.
 * Ordering is by second so every client receives the same list.
 */
export function mergeScheduledActions(
  ...sources: ReadonlyArray<readonly ScheduledActionView[] | null | undefined>
): ScheduledActionView[] {
  const bySecond = new Map<number, ScheduledActionView>();
  for (const source of sources) {
    for (const action of source ?? []) {
      const existing = bySecond.get(action.atActiveSecond);
      if (!existing || (action.cancelled && !existing.cancelled)) bySecond.set(action.atActiveSecond, action);
    }
  }
  return [...bySecond.values()].sort(
    (left, right) => left.atActiveSecond - right.atActiveSecond
      || left.kind.localeCompare(right.kind),
  );
}

/** The anchor read at the newest watched second wins. */
export function newestWalkingClock(
  ...clocks: ReadonlyArray<WalkingClock | null | undefined>
): WalkingClock | null {
  let newest: WalkingClock | null = null;
  for (const clock of clocks) {
    if (!clock) continue;
    if (!newest || clock.anchorActiveSeconds > newest.anchorActiveSeconds) newest = clock;
  }
  return newest;
}
