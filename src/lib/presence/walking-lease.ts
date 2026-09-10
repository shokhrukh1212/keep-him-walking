export type WalkingLease = {
  confirmed: boolean;
  expiresAtMs: number;
};

export function confirmedWalkingLease(
  walking: boolean,
  ttlSeconds: number,
  nowMs = Date.now(),
): WalkingLease {
  return walking
    ? { confirmed: true, expiresAtMs: nowMs + Math.max(0, ttlSeconds) * 1_000 }
    : { confirmed: false, expiresAtMs: nowMs };
}

export function walkingLeaseIsActive(lease: WalkingLease, nowMs = Date.now()) {
  return lease.confirmed && nowMs <= lease.expiresAtMs;
}

/**
 * Bootstrap is a slow, cached read. One taken before the newest heartbeat must not replace
 * the walking lease that heartbeat confirmed, or he stops until the next beat.
 */
export function presenceReadIsCurrent(readAuthoritativeAt: string, newestConfirmedMs: number): boolean {
  if (!Number.isFinite(newestConfirmedMs)) return true;
  const readMs = Date.parse(readAuthoritativeAt);
  return Number.isFinite(readMs) && readMs >= newestConfirmedMs;
}
