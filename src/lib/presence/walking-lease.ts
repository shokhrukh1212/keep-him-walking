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
