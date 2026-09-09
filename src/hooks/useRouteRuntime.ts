"use client";

import { useMemo } from "react";
import type { BootstrapSnapshot, HeartbeatResponse } from "@/lib/contracts";
import { travelerMotionAt } from "@/lib/traveler/motion-clock";
import {
  extrapolatedRouteDistance,
  extrapolatedRouteSeconds,
  routePositionAt,
} from "@/lib/world/route-clock";

export function useRouteRuntime(
  snapshot: BootstrapSnapshot,
  heartbeat: HeartbeatResponse | null,
  serverNowMs: number,
) {
  return useMemo(() => {
    const runtime = heartbeat && Date.parse(heartbeat.routeAuthoritativeAt) >= Date.parse(snapshot.route.authoritativeAt)
      ? {
          globalActiveSeconds: heartbeat.globalActiveSeconds,
          globalDistanceMetres: heartbeat.globalDistanceMetres,
          paceRate: heartbeat.paceRate,
          authoritativeAt: heartbeat.routeAuthoritativeAt,
          walking: heartbeat.walking,
        }
      : snapshot.route;
    const rawSeconds = extrapolatedRouteSeconds(runtime, serverNowMs);
    const distanceMetres = extrapolatedRouteDistance(runtime, serverNowMs);
    const motion = travelerMotionAt(snapshot.assets, rawSeconds, distanceMetres);
    return {
      runtime,
      rawSeconds,
      distanceMetres,
      motion,
      seconds: rawSeconds,
      position: routePositionAt(snapshot.assets, distanceMetres),
    };
  }, [heartbeat, serverNowMs, snapshot.assets, snapshot.route]);
}
