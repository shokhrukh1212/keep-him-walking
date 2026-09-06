"use client";

import { useMemo } from "react";
import type { BootstrapSnapshot, HeartbeatResponse } from "@/lib/contracts";
import { travelerMotionAt } from "@/lib/traveler/motion-clock";
import { extrapolatedRouteSeconds, routePositionAt } from "@/lib/world/route-clock";

export function useRouteRuntime(
  snapshot: BootstrapSnapshot,
  heartbeat: HeartbeatResponse | null,
  serverNowMs: number,
) {
  return useMemo(() => {
    const runtime = heartbeat && Date.parse(heartbeat.routeAuthoritativeAt) >= Date.parse(snapshot.route.authoritativeAt)
      ? {
          globalActiveSeconds: heartbeat.globalActiveSeconds,
          authoritativeAt: heartbeat.routeAuthoritativeAt,
          walking: heartbeat.walking,
        }
      : snapshot.route;
    const rawSeconds = extrapolatedRouteSeconds(runtime, serverNowMs);
    const motion = travelerMotionAt(snapshot.assets, rawSeconds);
    return {
      runtime,
      rawSeconds,
      motion,
      seconds: motion.routeSeconds,
      position: routePositionAt(snapshot.assets, motion.routeSeconds),
    };
  }, [heartbeat, serverNowMs, snapshot.assets, snapshot.route]);
}
