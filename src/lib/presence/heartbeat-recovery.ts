/**
 * The heartbeat chain is a sequence of timers, and a timer can be lost: a request
 * already in flight when another beat is asked for, a forced goodbye that finishes
 * after the tab is visible again, a throttled background timer. A lost chain lets
 * this viewer's lease lapse while they are still watching. This decision, run by a
 * single watchdog, restarts the chain without ever sending beats faster than the
 * server asked for.
 */
export type HeartbeatWatchState = {
  live: boolean;
  sceneReady: boolean;
  visible: boolean;
  online: boolean;
  /** When the request currently in flight started, or null. */
  inFlightSinceMs: number | null;
  /** When the next beat is due, or null when nothing is scheduled. */
  nextDueMs: number | null;
};

export type HeartbeatRecovery = "none" | "send" | "abort_and_send";

export const HEARTBEAT_STALL_MS = 10_000;
export const HEARTBEAT_GRACE_MS = 10_000;

export function heartbeatRecoveryDecision(state: HeartbeatWatchState, nowMs: number): HeartbeatRecovery {
  if (!state.live || !state.sceneReady || !state.visible || !state.online) return "none";
  if (state.inFlightSinceMs !== null) {
    return nowMs - state.inFlightSinceMs > HEARTBEAT_STALL_MS ? "abort_and_send" : "none";
  }
  if (state.nextDueMs === null) return "send";
  return nowMs > state.nextDueMs + HEARTBEAT_GRACE_MS ? "send" : "none";
}
