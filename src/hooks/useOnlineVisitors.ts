"use client";

import { useEffect, useState } from "react";

/** How often a visible page asks again. DataFast's online window is ten minutes wide. */
export const ONLINE_VISITORS_REFRESH_MS = 60_000;

/**
 * DataFast's count of people with the site open: anyone with a pageview in the last
 * ten minutes. `undefined` until the first answer, `null` when the count is unavailable.
 * It is page analytics only; walking still follows the server's confirmed watchers.
 */
export function useOnlineVisitors(): number | null | undefined {
  const [online, setOnline] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      if (document.visibilityState !== "visible") return;
      let next: number | null = null;
      try {
        const response = await fetch("/api/audience", { headers: { Accept: "application/json" } });
        const body = response.ok ? await response.json() as { online?: unknown } : null;
        const value = body?.online;
        next = typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
      } catch {
        next = null;
      }
      if (!cancelled) setOnline(next);
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

  return online;
}
