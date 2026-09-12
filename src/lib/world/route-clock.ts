import { DEFAULT_SCENE_VISIT_SECONDS, type CountryPack } from "@/lib/content/schema";
import { activityWindow, type ActivityWindowRow } from "./activities";
import type { RoutePosition, RouteRuntime, ScenePosition, WalkingClock } from "./types";

type DistanceRow = ActivityWindowRow & { frozenDistanceMetres?: number | null };

/** Live stop windows, unioned so overlapping or legacy rows never pause the clock twice. */
function mergedWindows(rows: readonly ActivityWindowRow[]): Array<[number, number]> {
  const windows = rows.flatMap((row) => {
    const window = activityWindow(row);
    return window ? [[window[0], window[1]] as [number, number]] : [];
  }).sort((left, right) => left[0] - right[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of windows) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function heldBetween(windows: ReadonlyArray<readonly [number, number]>, from: number, to: number): number {
  if (!(to > from)) return 0;
  let held = 0;
  for (const [start, end] of windows) held += Math.max(0, Math.min(to, end) - Math.max(from, start));
  return held;
}

export function validWalkingClock(clock: WalkingClock | null | undefined): clock is WalkingClock {
  return Boolean(clock)
    && Number.isFinite(clock!.anchorActiveSeconds)
    && Number.isFinite(clock!.heldActiveSeconds)
    && clock!.anchorActiveSeconds >= 0
    && clock!.heldActiveSeconds >= 0
    && clock!.heldActiveSeconds <= clock!.anchorActiveSeconds + 1e-6;
}

/**
 * Derives the shared walking clock from server-owned watched time and stop
 * windows. With the server's anchor, only the rows around the anchor matter, so
 * a long day of stops never drifts as old rows age out of the payload. Without
 * one (rollback payloads, tests), the given rows are the whole history. This clock
 * is global: viewer count and pace never enter it.
 */
export function activeWalkingSecondsAt(
  globalActiveSeconds: number,
  scheduledActions: readonly ActivityWindowRow[] = [],
  clock: WalkingClock | null = null,
): number {
  const raw = Math.max(0, Number.isFinite(globalActiveSeconds) ? globalActiveSeconds : 0);
  const windows = mergedWindows(scheduledActions);
  if (validWalkingClock(clock)) {
    const anchor = clock.anchorActiveSeconds;
    const walkingAtAnchor = anchor - Math.min(anchor, clock.heldActiveSeconds);
    const delta = raw >= anchor
      ? (raw - anchor) - heldBetween(windows, anchor, raw)
      : -((anchor - raw) - heldBetween(windows, raw, anchor));
    return Math.max(0, walkingAtAnchor + delta);
  }
  return Math.max(0, raw - heldBetween(windows, 0, raw));
}

export function sceneVisitSecondsFor(pack: CountryPack): number {
  const value = pack.route.sceneVisitSeconds;
  return Number.isFinite(value) && value >= 60 ? value : DEFAULT_SCENE_VISIT_SECONDS;
}

/** Every place in the pinned manifest, in order, one visit per `sceneVisitSeconds` of walking, looping all day. */
export function scenePositionAt(
  pack: CountryPack,
  dailyActiveWalkingSeconds: number,
): ScenePosition {
  const placeCount = pack.route.zones.length;
  if (placeCount < 1) {
    throw new RangeError(`pack ${pack.assetVersion} must declare at least one place`);
  }
  const visitSeconds = sceneVisitSecondsFor(pack);
  const seconds = Math.max(
    0,
    Number.isFinite(dailyActiveWalkingSeconds) ? dailyActiveWalkingSeconds : 0,
  );
  const visitIndex = Math.floor(seconds / visitSeconds);
  const secondsIntoVisit = seconds - visitIndex * visitSeconds;
  const zoneIndex = visitIndex % placeCount;
  return {
    zoneIndex,
    visitIndex,
    cycleIndex: Math.floor(visitIndex / placeCount),
    secondsIntoVisit,
    visitProgress: secondsIntoVisit / visitSeconds,
    placeCount,
    visitSeconds,
    nextZoneIndex: (zoneIndex + 1) % placeCount,
    secondsToNextVisit: visitSeconds - secondsIntoVisit,
  };
}

/** Legacy metre position. Scenery no longer follows distance; kept for the map and history. */
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
  scheduledActions: readonly DistanceRow[] = [],
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
  scheduledActions: readonly DistanceRow[] = [],
): number {
  const elapsed = Math.min(60, Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0));
  const projectedActiveSecond = runtime.globalActiveSeconds + elapsed;
  const heldSeconds = heldBetween(
    mergedWindows(scheduledActions),
    runtime.globalActiveSeconds,
    projectedActiveSecond,
  );
  let frozenDistance: number | null = null;
  for (const action of scheduledActions) {
    const window = activityWindow(action);
    if (window
      && projectedActiveSecond >= window[0]
      && projectedActiveSecond < window[1]
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
