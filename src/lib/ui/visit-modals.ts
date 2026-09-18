/**
 * The two one-time visitor modals — the first-visit introduction and the
 * sustained-watching support ask — decided as pure functions of authoritative
 * inputs, the way the rest of the journey's timing is.
 *
 * Nothing here touches the DOM, storage or the clock: the hook that drives it
 * passes `nowMs` and the surfaces that are in the way, so every rule below is
 * a unit test rather than a stopwatch.
 */

export type VisitModalName = "intro" | "support";

/** How a modal was closed, as the analytics payload names it. */
export type VisitModalDismissMethod = "button" | "escape" | "backdrop" | "x";

/** The scene is on screen before anything covers part of it. */
export const INTRO_DELAY_MS = 900;

/** Sustained watching, counted only while the tab is visible and the window has focus. */
export const SUPPORT_ACTIVE_MS = 75_000;

/** The support ask never lands on the heels of the introduction. */
export const INTRO_TO_SUPPORT_GAP_MS = 30_000;

/** A modal held back by another surface waits this long after that surface closes. */
export const UNBLOCKED_SETTLE_MS = 5_000;

/** How often the queue is re-read while a modal is still owed. */
export const VISIT_MODAL_TICK_MS = 250;

/** Query parameters that mean this visitor arrived on the sponsor path. */
export const SPONSOR_REFERRAL_PARAMS = ["ref", "sponsor"] as const;

export type VisitModalState = {
  nowMs: number;
  /** A modal already on screen keeps it; the queue never stacks. */
  openModal: VisitModalName | null;
  /** When each modal was first shown to this visitor, from storage or earlier in this session. */
  introShownAtMs: number | null;
  supportShownAtMs: number | null;
  /** The server's own visitor cookie says this is not a first visit. */
  returningVisitor: boolean;
  /** This session arrived on a sponsor link, so neither modal belongs in it. */
  sponsorReferral: boolean;
  /** When the scene first reported a renderer, or null while it has not. */
  sceneReadyAtMs: number | null;
  /** Active watching so far: the tab visible and the window focused. */
  activeWatchMs: number;
  /**
   * The support ask claims he is walking, so it is only armed on a live journey.
   * Prelaunch, intermission and a finished season never earn it.
   */
  supportEligible: boolean;
  /** A panel, the sponsor flow, a checkout, a toast, loading or an error is in the way. */
  blocked: boolean;
  /** When the last blocking surface went away; null while none has ever blocked. */
  unblockedAtMs: number | null;
  /** When the introduction was closed in this session. */
  introClosedAtMs: number | null;
};

/** True once nothing more can ever be shown, so the driving loop can stop. */
export function visitModalsSettled(state: VisitModalState): boolean {
  if (state.openModal !== null) return false;
  if (state.sponsorReferral) return true;
  return state.introShownAtMs !== null && state.supportShownAtMs !== null;
}

function introIsOwed(state: VisitModalState): boolean {
  if (state.introShownAtMs !== null) return false;
  // Someone the server already knows saw this once, even with their storage cleared.
  if (state.returningVisitor) return false;
  if (state.sceneReadyAtMs === null) return false;
  return state.nowMs - state.sceneReadyAtMs >= INTRO_DELAY_MS;
}

function supportIsOwed(state: VisitModalState): boolean {
  if (state.supportShownAtMs !== null) return false;
  if (!state.supportEligible) return false;
  if (state.activeWatchMs < SUPPORT_ACTIVE_MS) return false;
  if (state.introClosedAtMs === null) return true;
  return state.nowMs - state.introClosedAtMs >= INTRO_TO_SUPPORT_GAP_MS;
}

/**
 * The one modal that may be on screen now, or null. A modal already open stays
 * open; a blocking surface holds the queue rather than emptying it.
 */
export function nextVisitModal(state: VisitModalState): VisitModalName | null {
  if (state.sponsorReferral) return null;
  if (state.openModal !== null) return state.openModal;
  if (state.blocked) return null;
  // Whatever was in the way has just gone; let the page settle before covering it again.
  if (state.unblockedAtMs !== null && state.nowMs - state.unblockedAtMs < UNBLOCKED_SETTLE_MS) return null;
  if (introIsOwed(state)) return "intro";
  if (supportIsOwed(state)) return "support";
  return null;
}

/**
 * Active watching, accumulated. `startedAtMs` is the moment the current active
 * stretch began, or null while the tab is hidden or the window unfocused.
 */
export type WatchClock = { activeMs: number; startedAtMs: number | null };

export const IDLE_WATCH_CLOCK: WatchClock = { activeMs: 0, startedAtMs: null };

/** Total active milliseconds at `nowMs`, including a stretch still running. */
export function watchClockActiveMs(clock: WatchClock, nowMs: number): number {
  if (clock.startedAtMs === null) return clock.activeMs;
  return clock.activeMs + Math.max(0, nowMs - clock.startedAtMs);
}

/**
 * Folds "is this visitor actively watching right now" into the clock. Starting
 * an already-running clock and stopping an already-stopped one both change
 * nothing, so a duplicate blur or a repeated visibility event is harmless.
 */
export function watchClockAt(clock: WatchClock, watching: boolean, nowMs: number): WatchClock {
  if (watching) {
    return clock.startedAtMs === null ? { activeMs: clock.activeMs, startedAtMs: nowMs } : clock;
  }
  if (clock.startedAtMs === null) return clock;
  return { activeMs: watchClockActiveMs(clock, nowMs), startedAtMs: null };
}

/** True when the URL carries a parameter aimed at the sponsor flow. */
export function hasSponsorReferral(search: string): boolean {
  const params = new URLSearchParams(search);
  return SPONSOR_REFERRAL_PARAMS.some((name) => (params.get(name) ?? "") !== "");
}
