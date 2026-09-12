import type { CountryPack } from "@/lib/content/schema";
import type { ScheduledActionView } from "@/lib/contracts";
import type { RoutePosition, RouteRuntime, ScenePosition } from "./types";

const CROWD_ACTION_DURATION_SECONDS = { wave: 2.5, drink: 5.5, photo: 4 } as const;
export const SCENE_VISIT_SECONDS = 18 * 60;

/**
 * Derives the shared walking clock from server-owned watched time and action
 * windows. Overlapping windows are unioned so corrupt/legacy rows cannot pause
 * the clock twice. This clock is global: viewer count and pace never enter it.
 */
export function activeWalkingSecondsAt(
  globalActiveSeconds: number,
  scheduledActions: readonly ScheduledActionView[] = [],
): number {
  const end = Math.max(0, Number.isFinite(globalActiveSeconds) ? globalActiveSeconds : 0);
  const windows = scheduledActions.flatMap((action) => {
    const start = Math.max(0, Number.isFinite(action.atActiveSecond) ? action.atActiveSecond : 0);
    const rawEnd = action.endsAtActiveSecond
      ?? start + CROWD_ACTION_DURATION_SECONDS[action.kind];
    const stop = Math.max(start, Number.isFinite(rawEnd) ? rawEnd : start);
    if (start >= end || stop <= 0 || stop <= start) return [];
    return [[Math.max(0, start), Math.min(end, stop)] as const];
  }).sort((left, right) => left[0] - right[0]);

  let held = 0;
  let mergedStart = -1;
  let mergedEnd = -1;
  for (const [start, stop] of windows) {
    if (mergedStart < 0) {
      mergedStart = start;
      mergedEnd = stop;
    } else if (start <= mergedEnd) {
      mergedEnd = Math.max(mergedEnd, stop);
    } else {
      held += mergedEnd - mergedStart;
      mergedStart = start;
      mergedEnd = stop;
    }
  }
  if (mergedStart >= 0) held += mergedEnd - mergedStart;
  return Math.max(0, end - held);
}

/** Five authored paintings repeat indefinitely, one per 18 walking minutes. */
export function scenePositionAt(
  pack: CountryPack,
  dailyActiveWalkingSeconds: number,
): ScenePosition {
  if (pack.route.zones.length !== 5) {
    throw new RangeError(`pack ${pack.assetVersion} must declare exactly five launch scenes`);
  }
  const seconds = Math.max(
    0,
    Number.isFinite(dailyActiveWalkingSeconds) ? dailyActiveWalkingSeconds : 0,
  );
  const visitIndex = Math.floor(seconds / SCENE_VISIT_SECONDS);
  const secondsIntoVisit = seconds - visitIndex * SCENE_VISIT_SECONDS;
  return {
    zoneIndex: visitIndex % pack.route.zones.length,
    visitIndex,
    cycleIndex: Math.floor(visitIndex / pack.route.zones.length),
    secondsIntoVisit,
    visitProgress: secondsIntoVisit / SCENE_VISIT_SECONDS,
  };
}

export function routePositionAt(
  pack: CountryPack,
  distanceMetres: number,
): RoutePosition {
  const distance = Math.max(0, Number.isFinite(distanceMetres) ? distanceMetres : 0);
  const zones = pack.route.zones;
  const routeMetres = pack.dayRouteMetres;
  if (distance >= routeMetres) {
    const zoneIndex = zones.length - 1;
    const zoneLength = zones[zoneIndex]?.lengthMetres ?? 1;
    const metresIntoZone = zoneLength > 0 ? (distance - routeMetres) % zoneLength : 0;
    return {
      phase: "evening",
      zoneIndex,
      zoneProgress: Math.min(1, metresIntoZone / zoneLength),
      metresIntoZone,
      remainingToLandmark: 0,
      marathonProgress: Math.min(1, distance / pack.marathonMetres),
    };
  }

  let boundary = 0;
  let zoneIndex = zones.length - 1;

  for (let index = 0; index < zones.length; index += 1) {
    const end = boundary + zones[index].lengthMetres;
    if (distance < end) {
      zoneIndex = index;
      break;
    }
    boundary = end;
  }

  const zone = zones[zoneIndex];
  const metresIntoZone = Math.max(0, distance - boundary);
  return {
    phase: "route",
    zoneIndex,
    zoneProgress: Math.min(1, metresIntoZone / zone.lengthMetres),
    metresIntoZone,
    remainingToLandmark: Math.max(0, routeMetres - distance),
    marathonProgress: Math.min(1, distance / pack.marathonMetres),
  };
}

export function extrapolatedRouteSeconds(runtime: RouteRuntime, nowMs: number): number {
  if (!runtime.walking) return runtime.globalActiveSeconds;
  const authoritativeMs = new Date(runtime.authoritativeAt).getTime();
  if (!Number.isFinite(authoritativeMs)) return runtime.globalActiveSeconds;
  // Presence is reconciled frequently. A cap prevents a disconnected client
  // from inventing route progress indefinitely.
  const elapsed = Math.min(60, Math.max(0, (nowMs - authoritativeMs) / 1_000));
  return runtime.globalActiveSeconds + elapsed;
}

export function extrapolatedRouteDistance(
  runtime: RouteRuntime,
  nowMs: number,
  scheduledActions: readonly ScheduledActionView[] = [],
): number {
  if (!runtime.walking) return runtime.globalDistanceMetres;
  const authoritativeMs = new Date(runtime.authoritativeAt).getTime();
  if (!Number.isFinite(authoritativeMs)) return runtime.globalDistanceMetres;
  const elapsed = Math.min(60, Math.max(0, (nowMs - authoritativeMs) / 1_000));
  return projectedRouteDistance(runtime, elapsed, scheduledActions);
}

/** Pure bounded projection used by both React state and the two render clocks. */
export function projectedRouteDistance(
  runtime: RouteRuntime,
  elapsedSeconds: number,
  scheduledActions: readonly ScheduledActionView[] = [],
): number {
  const elapsed = Math.min(60, Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0));
  const projectedActiveSecond = runtime.globalActiveSeconds + elapsed;
  let heldSeconds = 0;
  let frozenDistance: number | null = null;
  for (const action of scheduledActions) {
    const end = action.endsAtActiveSecond
      ?? action.atActiveSecond + CROWD_ACTION_DURATION_SECONDS[action.kind];
    heldSeconds += Math.max(
      0,
      Math.min(projectedActiveSecond, end)
        - Math.max(runtime.globalActiveSeconds, action.atActiveSecond),
    );
    if (projectedActiveSecond >= action.atActiveSecond
      && projectedActiveSecond < end
      && Number.isFinite(action.frozenDistanceMetres)) {
      frozenDistance = Math.max(0, action.frozenDistanceMetres!);
    }
  }
  if (frozenDistance !== null) return frozenDistance;
  return runtime.globalDistanceMetres
    + Math.max(0, elapsed - Math.min(elapsed, heldSeconds)) * 1.25 * runtime.paceRate;
}

export function deterministicVariant(seed: string, index: number, count: number): number {
  let hash = 2_166_136_261 ^ index;
  for (let offset = 0; offset < seed.length; offset += 1) {
    hash ^= seed.charCodeAt(offset);
    hash = Math.imul(hash, 16_777_619);
  }
  return Math.abs(hash >>> 0) % Math.max(1, count);
}
