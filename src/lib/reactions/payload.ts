import type { ReactionsView, ScheduledActionView } from "@/lib/contracts";

const CROWD_ACTION_KINDS = new Set(["wave", "drink", "photo"]);

type RawScheduled = { kind?: unknown; atActiveSecond?: unknown } | null | undefined;

export type RawReactionsPayload = {
  counts?: { wave?: unknown; water?: unknown; photo?: unknown } | null;
  scheduled?: unknown;
  nextScheduledAction?: RawScheduled;
} | null | undefined;

function finiteOrZero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function scheduledActionFromRow(row: RawScheduled): ScheduledActionView | null {
  if (!row || typeof row.kind !== "string" || !CROWD_ACTION_KINDS.has(row.kind)) return null;
  const at = Number(row.atActiveSecond);
  if (!Number.isFinite(at)) return null;
  return { kind: row.kind as ScheduledActionView["kind"], atActiveSecond: at };
}

/**
 * Reactions are enums and counts only. A missing or malformed payload becomes an
 * empty board, so the buttons never show a number the server did not confirm and
 * the motion clock never receives an action nobody scheduled.
 */
export function reactionsFromRow(payload: RawReactionsPayload): ReactionsView {
  const counts = payload?.counts ?? null;
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
  };
}

/**
 * Unions the actions the bootstrap knew about with the ones a later heartbeat
 * confirmed. A heartbeat only arrives every ~20 s, so an action committed
 * between two of them must not be lost, and the same action must never be
 * played twice. Ordering is by second so every client receives the same list.
 */
export function mergeScheduledActions(
  ...sources: ReadonlyArray<readonly ScheduledActionView[] | null | undefined>
): ScheduledActionView[] {
  const bySecond = new Map<number, ScheduledActionView>();
  for (const source of sources) {
    for (const action of source ?? []) {
      if (!bySecond.has(action.atActiveSecond)) bySecond.set(action.atActiveSecond, action);
    }
  }
  return [...bySecond.values()].sort(
    (left, right) => left.atActiveSecond - right.atActiveSecond
      || left.kind.localeCompare(right.kind),
  );
}
