/**
 * When to try a character again after a failed download or a lost WebGL context.
 *
 * He is the reason the page exists, so the first retry is quick and the backoff
 * then settles into a slow poll a tab left open all day can keep making. The
 * place paintings have always retried this way (`textureRetryDelayMs`); until
 * P22 he did not retry at all, and one failed request ended his walk for the
 * whole session.
 */
const RETRY_DELAYS_MS = [1_000, 3_000, 8_000, 20_000, 30_000] as const;

/** How many times a lost context is asked to come back before the stage is rebuilt. */
export const CONTEXT_RESTORE_ATTEMPTS = 3;

/** Rebuilding is the last resort, and a device that cannot hold a context must not loop. */
export const MAX_STAGE_REBUILDS = 3;

export function characterRetryDelayMs(attempt: number): number {
  const index = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  return RETRY_DELAYS_MS[Math.min(index, RETRY_DELAYS_MS.length - 1)]!;
}
