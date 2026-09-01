import type { CountryPack } from "@/lib/content/schema";
import type { RoutePosition, RouteRuntime } from "./types";

export function routePositionAt(
  pack: CountryPack,
  activeSeconds: number,
): RoutePosition {
  const seconds = Math.max(0, Number.isFinite(activeSeconds) ? activeSeconds : 0);
  const zones = pack.route.zones;
  const routeDuration = zones.reduce((total, zone) => total + zone.durationActiveSeconds, 0);
  const loopedSeconds = routeDuration > 0 ? seconds % routeDuration : 0;
  let boundary = 0;
  let zoneIndex = zones.length - 1;

  for (let index = 0; index < zones.length; index += 1) {
    const end = boundary + zones[index].durationActiveSeconds;
    if (loopedSeconds < end) {
      zoneIndex = index;
      break;
    }
    boundary = end;
  }

  const zone = zones[zoneIndex];
  const zoneElapsedSeconds = loopedSeconds - boundary;
  return {
    globalActiveSeconds: seconds,
    distance: seconds * pack.route.worldUnitsPerSecond,
    zoneIndex,
    zoneId: zone.id,
    zoneLabel: zone.label,
    zoneElapsedSeconds,
    zoneProgress: Math.min(1, zoneElapsedSeconds / zone.durationActiveSeconds),
  };
}

export function extrapolatedRouteSeconds(runtime: RouteRuntime, nowMs: number): number {
  if (!runtime.walking) return runtime.globalActiveSeconds;
  const authoritativeMs = new Date(runtime.authoritativeAt).getTime();
  if (!Number.isFinite(authoritativeMs)) return runtime.globalActiveSeconds;
  // Presence is reconciled frequently. A cap prevents a disconnected client
  // from inventing route progress indefinitely.
  const elapsed = Math.min(30, Math.max(0, (nowMs - authoritativeMs) / 1_000));
  return runtime.globalActiveSeconds + elapsed;
}

export function deterministicVariant(seed: string, index: number, count: number): number {
  let hash = 2_166_136_261 ^ index;
  for (let offset = 0; offset < seed.length; offset += 1) {
    hash ^= seed.charCodeAt(offset);
    hash = Math.imul(hash, 16_777_619);
  }
  return Math.abs(hash >>> 0) % Math.max(1, count);
}
