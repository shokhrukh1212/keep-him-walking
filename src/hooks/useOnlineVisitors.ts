"use client";

import { useEffect, useState } from "react";

/** How often a visible page asks again. DataFast's online window is ten minutes wide. */
export const ONLINE_VISITORS_REFRESH_MS = 60_000;

/** A count with the moment DataFast answered it. */
export type DatedCount = { value: number; fetchedAt: string };

export type AudienceCountsState = {
  /** The latest read's online count for the header: undefined until the first answer, null when that read failed. */
  online: number | null | undefined;
  /** The last good value of each metric, kept with its time when a later read fails. Never a zero invented for a failure. */
  metrics: { online: DatedCount | null; allTime: DatedCount | null };
  /** When the most recent read that returned nothing usable happened, if it was the latest one. */
  failedAt: string | null;
};

export const INITIAL_AUDIENCE_COUNTS: AudienceCountsState = {
  online: undefined,
  metrics: { online: null, allTime: null },
  failedAt: null,
};

function wholeCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * Folds one /api/audience read into the state. A metric the read did not answer keeps its
 * previous dated value; the header's online count follows only the latest read.
 */
export function mergeAudienceRead(
  previous: AudienceCountsState,
  body: { online?: unknown; allTime?: unknown; fetchedAt?: unknown } | null,
  attemptedAt: string,
): AudienceCountsState {
  const fetchedAt = typeof body?.fetchedAt === "string" && Number.isFinite(Date.parse(body.fetchedAt)) ? body.fetchedAt : attemptedAt;
  const online = wholeCount(body?.online);
  const allTime = wholeCount(body?.allTime);
  return {
    online,
    metrics: {
      online: online === null ? previous.metrics.online : { value: online, fetchedAt },
      allTime: allTime === null ? previous.metrics.allTime : { value: allTime, fetchedAt },
    },
    failedAt: online === null || allTime === null ? attemptedAt : null,
  };
}

/**
 * DataFast's site analytics, read through the server's cached /api/audience: people with a
 * pageview in the last ten minutes and unique visitors since tracking began. It is page
 * analytics only; walking still follows the server's confirmed watchers.
 */
export function useAudienceCounts(): AudienceCountsState {
  const [state, setState] = useState<AudienceCountsState>(INITIAL_AUDIENCE_COUNTS);

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      if (document.visibilityState !== "visible") return;
      const attemptedAt = new Date().toISOString();
      let body: { online?: unknown; allTime?: unknown; fetchedAt?: unknown } | null = null;
      try {
        const response = await fetch("/api/audience", { headers: { Accept: "application/json" } });
        body = response.ok ? await response.json() : null;
      } catch {
        body = null;
      }
      if (!cancelled) setState((previous) => mergeAudienceRead(previous, body, attemptedAt));
    };
    const onVisibility = () => { void read(); };
    void read();
    const timer = window.setInterval(() => void read(), ONLINE_VISITORS_REFRESH_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return state;
}

/** The header's number alone. */
export function useOnlineVisitors(): number | null | undefined {
  return useAudienceCounts().online;
}
