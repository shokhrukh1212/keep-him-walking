export const DEFAULT_PRESENCE_TTL_SECONDS = 50;
export const DEFAULT_HEARTBEAT_MS = 20_000;

/**
 * The interval the server hands out, jittered by six seconds so a large crowd
 * does not arrive in lockstep. The base comes from the server once the adaptive
 * heartbeat is in play; the default is only the fallback.
 */
export function nextHeartbeatDelay(random = Math.random, baseMs = DEFAULT_HEARTBEAT_MS): number {
  const base = Number.isFinite(baseMs) && baseMs > 0 ? baseMs : DEFAULT_HEARTBEAT_MS;
  return base - 3_000 + Math.round(random() * 6_000);
}

export function isLeaseActive(
  lastSeenAtMs: number,
  nowMs: number,
  ttlSeconds = DEFAULT_PRESENCE_TTL_SECONDS,
): boolean {
  return lastSeenAtMs + ttlSeconds * 1_000 > nowMs;
}

export function formatPaceRate(paceRate: number): string {
  const safeRate = Number.isFinite(paceRate) ? Math.max(1, paceRate) : 1;
  const rounded = Math.round(safeRate * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
