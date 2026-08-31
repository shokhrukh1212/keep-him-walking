export const DEFAULT_PRESENCE_TTL_SECONDS = 50;
export const DEFAULT_HEARTBEAT_MS = 20_000;

export function nextHeartbeatDelay(random = Math.random): number {
  return DEFAULT_HEARTBEAT_MS - 3_000 + Math.round(random() * 6_000);
}

export function isLeaseActive(
  lastSeenAtMs: number,
  nowMs: number,
  ttlSeconds = DEFAULT_PRESENCE_TTL_SECONDS,
): boolean {
  return lastSeenAtMs + ttlSeconds * 1_000 > nowMs;
}
