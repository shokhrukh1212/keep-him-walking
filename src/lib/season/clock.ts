/**
 * The season clock. It is wall-clock time from the server's configured
 * starts_at/ends_at, and it is deliberately separate from the watched-seconds and
 * distance clocks: it keeps running while nobody watches, and nothing here can
 * move him or add a metre.
 */
export const SEASON_LENGTH_DAYS = 7;

export type SeasonStatus = "draft" | "preview" | "active" | "completed" | "paused";

export type SeasonRecord = {
  id: string;
  number: number;
  title: string;
  status: SeasonStatus;
  startsAt: string;
  endsAt: string;
  totalDays: number;
};

export type SeasonPhase =
  | { kind: "none"; needsReconcile: boolean }
  | { kind: "prelaunch"; next: SeasonRecord; needsReconcile: boolean }
  | { kind: "live"; current: SeasonRecord; next: SeasonRecord | null; needsReconcile: boolean }
  | { kind: "completed"; last: SeasonRecord; next: SeasonRecord | null; needsReconcile: boolean };

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function window(season: SeasonRecord) {
  return { start: Date.parse(season.startsAt), end: Date.parse(season.endsAt) };
}

/**
 * Which season the shared page is in at this instant. `needsReconcile` is true when
 * a stored status lags its own timestamps (a missed or late scheduler run), so the
 * caller can run the idempotent reconciliation before reading a live day.
 */
export function seasonPhaseAt(seasons: readonly SeasonRecord[], nowMs: number): SeasonPhase {
  const ordered = seasons
    .filter((season) => season.status !== "paused")
    .filter((season) => Number.isFinite(window(season).start) && Number.isFinite(window(season).end))
    .sort((left, right) => window(left).start - window(right).start);
  const needsReconcile = ordered.some((season) => {
    const { start, end } = window(season);
    return (start <= nowMs && season.status === "draft")
      || (end <= nowMs && season.status !== "completed");
  });
  const current = ordered.find((season) => window(season).start <= nowMs && nowMs < window(season).end) ?? null;
  const next = ordered.find((season) => window(season).start > nowMs) ?? null;
  if (current) return { kind: "live", current, next, needsReconcile };
  const last = [...ordered].reverse().find((season) => window(season).end <= nowMs) ?? null;
  if (last) return { kind: "completed", last, next, needsReconcile };
  if (next) return { kind: "prelaunch", next, needsReconcile };
  return { kind: "none", needsReconcile };
}

/** "4d 6h", "6h 12m", "12m" or "under 1m". Never negative. */
export function formatSeasonCountdown(remainingMs: number): string {
  const ms = Number.isFinite(remainingMs) ? Math.max(0, remainingMs) : 0;
  if (ms >= DAY_MS) return `${Math.floor(ms / DAY_MS)}d ${Math.floor((ms % DAY_MS) / HOUR_MS)}h`;
  if (ms >= HOUR_MS) return `${Math.floor(ms / HOUR_MS)}h ${Math.floor((ms % HOUR_MS) / MINUTE_MS)}m`;
  if (ms >= MINUTE_MS) return `${Math.floor(ms / MINUTE_MS)}m`;
  return "under 1m";
}

export type SeasonClockInput = {
  number: number;
  totalDays: number;
  startsAt: string;
  endsAt: string;
  state: "prelaunch" | "live" | "completed";
  /** The authoritative country-day number, only while live. */
  dayNumber: number | null;
  /** Server-synchronized wall clock. */
  nowMs: number;
};

/**
 * Where the shared season is, in two halves a narrow header can stack: which season
 * and day, and when it starts or ends. It is never per visitor.
 */
export function seasonClockParts(input: SeasonClockInput): { where: string; when: string } {
  const label = `Season ${input.number}`;
  if (input.state === "completed") return { where: label, when: "Season complete" };
  if (input.state === "prelaunch") {
    const remaining = Date.parse(input.startsAt) - input.nowMs;
    return { where: label, when: remaining > 0 ? `Starts in ${formatSeasonCountdown(remaining)}` : "Starting now" };
  }
  const remaining = Date.parse(input.endsAt) - input.nowMs;
  const where = input.dayNumber === null
    ? label
    : `${label} · Day ${Math.min(input.totalDays, Math.max(1, input.dayNumber))} of ${input.totalDays}`;
  return { where, when: remaining > 0 ? `Ends in ${formatSeasonCountdown(remaining)}` : "Ending now" };
}

/** The same clock as one line. */
export function seasonClockLine(input: SeasonClockInput): string {
  const { where, when } = seasonClockParts(input);
  return `${where} · ${when}`;
}
