"use client";

import { useMemo } from "react";
import type { BootstrapSnapshot, HeartbeatResponse } from "@/lib/contracts";
import { travelerMotionAt } from "@/lib/traveler/motion-clock";
import { mergeScheduledActions, newestWalkingClock } from "@/lib/reactions/payload";
import {
  activeWalkingSecondsAt,
  extrapolatedRouteDistance,
  extrapolatedRouteSeconds,
  scenePositionAt,
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
    // Stops the server has already committed to, from whichever of the two
    // authoritative payloads carried them.
    const scheduledActions = mergeScheduledActions(
      snapshot.reactions.scheduled,
      heartbeat?.reactions?.scheduled,
    );
    const walkingClock = newestWalkingClock(
      snapshot.reactions.walkingClock,
      heartbeat?.reactions?.walkingClock,
    );
    const rawSeconds = extrapolatedRouteSeconds(runtime, serverNowMs);
    const walkingSeconds = activeWalkingSecondsAt(rawSeconds, scheduledActions, walkingClock);
    const distanceMetres = extrapolatedRouteDistance(runtime, serverNowMs, scheduledActions);
    const motion = travelerMotionAt(
      snapshot.assets,
      rawSeconds,
      distanceMetres,
      scheduledActions,
      walkingClock,
    );
    return {
      runtime,
      rawSeconds,
      distanceMetres,
      scheduledActions,
      walkingClock,
      motion,
      seconds: walkingSeconds,
      position: scenePositionAt(snapshot.assets, walkingSeconds),
    };
  }, [heartbeat, serverNowMs, snapshot.assets, snapshot.reactions.scheduled, snapshot.reactions.walkingClock, snapshot.route]);
}
