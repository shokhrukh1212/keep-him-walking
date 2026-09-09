import type { CountryPack } from "@/lib/content/schema";
import type { RoutePosition, RouteRuntime } from "./types";

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

export function extrapolatedRouteDistance(runtime: RouteRuntime, nowMs: number): number {
  if (!runtime.walking) return runtime.globalDistanceMetres;
  const authoritativeMs = new Date(runtime.authoritativeAt).getTime();
  if (!Number.isFinite(authoritativeMs)) return runtime.globalDistanceMetres;
  const elapsed = Math.min(60, Math.max(0, (nowMs - authoritativeMs) / 1_000));
  return runtime.globalDistanceMetres + elapsed * 1.25 * runtime.paceRate;
}

export function deterministicVariant(seed: string, index: number, count: number): number {
  let hash = 2_166_136_261 ^ index;
  for (let offset = 0; offset < seed.length; offset += 1) {
    hash ^= seed.charCodeAt(offset);
    hash = Math.imul(hash, 16_777_619);
  }
  return Math.abs(hash >>> 0) % Math.max(1, count);
}
