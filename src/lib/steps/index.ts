export type RuntimeSample = {
  lastAccountedAtMs: number;
  globalActiveSeconds: number;
  latestActiveLeaseExpiresAtMs: number | null;
};

export function reconcileWalkingTime(sample: RuntimeSample, nowMs: number): RuntimeSample {
  if (
    sample.latestActiveLeaseExpiresAtMs === null ||
    sample.latestActiveLeaseExpiresAtMs <= sample.lastAccountedAtMs
  ) {
    return { ...sample, lastAccountedAtMs: nowMs };
  }

  const activeUntil = Math.min(nowMs, sample.latestActiveLeaseExpiresAtMs);
  const elapsedSeconds = Math.max(0, activeUntil - sample.lastAccountedAtMs) / 1_000;
  return {
    ...sample,
    lastAccountedAtMs: nowMs,
    globalActiveSeconds: sample.globalActiveSeconds + elapsedSeconds,
  };
}

export function stepsFromActiveSeconds(seconds: number, stepsPerSecond: number): number {
  return Math.max(0, Math.floor(seconds * stepsPerSecond));
}
