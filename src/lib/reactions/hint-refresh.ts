/** Reads started by Realtime hints are at least this far apart for one viewer. */
export const REACTION_HINT_SPACING_MS = 1_000;
/** Each viewer waits up to this long before reading, so a room does not read in one instant. */
export const REACTION_HINT_JITTER_MS = 400;

export type HintRefresherOptions = {
  minSpacingMs: number;
  jitterMs: number;
  random?: () => number;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

/**
 * Turns Realtime "something changed" hints into bounded reads. A hint that arrives
 * while a read is waiting joins it; hints that arrive during a read cause exactly one
 * more read after it; reads start at least `minSpacingMs` apart. However many hints
 * arrive, genuine or forged, one viewer makes at most one read a second.
 */
export function createHintRefresher(run: () => unknown, options: HintRefresherOptions) {
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? ((callback: () => void, delayMs: number) => setTimeout(callback, delayMs));
  const clearTimer = options.clearTimer
    ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let timer: unknown = null;
  let inFlight = false;
  let again = false;
  let cancelled = false;
  let lastStartedAt = Number.NEGATIVE_INFINITY;

  async function start() {
    timer = null;
    inFlight = true;
    again = false;
    lastStartedAt = now();
    try {
      await run();
    } catch {
      // A later heartbeat remains the authoritative fallback.
    } finally {
      inFlight = false;
      if (again) request();
    }
  }

  function request() {
    if (cancelled) return;
    if (inFlight) {
      again = true;
      return;
    }
    if (timer !== null) return;
    const spacing = Math.max(0, lastStartedAt + options.minSpacingMs - now());
    const jitter = Math.min(1, Math.max(0, random())) * options.jitterMs;
    timer = setTimer(() => void start(), spacing + jitter);
  }

  return {
    request,
    cancel() {
      cancelled = true;
      again = false;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}
