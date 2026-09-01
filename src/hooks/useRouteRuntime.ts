"use client";

import { useMemo } from "react";
import type { BootstrapSnapshot, HeartbeatResponse } from "@/lib/contracts";
import { extrapolatedRouteSeconds, routePositionAt } from "@/lib/world/route-clock";

export function useRouteRuntime(
  snapshot: BootstrapSnapshot,
  heartbeat: HeartbeatResponse | null,
  serverNowMs: number,
) {
  return useMemo(() => {
    const runtime = heartbeat
      ? {
          globalActiveSeconds: heartbeat.globalActiveSeconds,
          authoritativeAt: heartbeat.routeAuthoritativeAt,
          walking: heartbeat.walking,
        }
      : snapshot.route;
    const seconds = extrapolatedRouteSeconds(runtime, serverNowMs);
    return { runtime, seconds, position: routePositionAt(snapshot.assets, seconds) };
  }, [heartbeat, serverNowMs, snapshot.assets, snapshot.route]);
}
