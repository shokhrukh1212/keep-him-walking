import { SEASON_ONE_ROUTE, seasonOneDayWindow } from "./anniversary";

export type CityAssetManifest = {
  schemaVersion: 1;
  day: number;
  city: string;
  country: string;
  packId: string;
  startsAt: string;
  endsAt: string;
  /** One small poster retained for Journey and completed-day history. */
  thumbnail: string;
  /** Canonical R2 paths. Empty when the city has no approved painting yet. */
  fullResolution: string[];
  missing: string[];
  fallback: string;
};

export const SEASON_SCENE_FALLBACK = "/scenes/tashkent/v1/scene-fallback.webp";

/** A city manifest is independent; callers never need the other thirteen. */
export function cityAssetManifest(day: number, fullResolution: readonly string[], thumbnail: string | null, missing: readonly string[], liveWindow?: { startsAt: string; endsAt: string }): CityAssetManifest {
  const stop = SEASON_ONE_ROUTE[day - 1];
  if (!stop) throw new RangeError("Invalid Season 1 day");
  const window = liveWindow ?? seasonOneDayWindow(day);
  return {
    schemaVersion: 1, day, city: stop.city, country: stop.country, packId: stop.packId,
    ...window,
    thumbnail: thumbnail ?? SEASON_SCENE_FALLBACK,
    fullResolution: [...new Set(fullResolution)].sort(),
    missing: [...new Set(missing)].sort(),
    fallback: SEASON_SCENE_FALLBACK,
  };
}

/** Only the current city and its next city may enter the loading window. */
export function sceneAssetWindow(day: number): { current: number | null; next: number | null; release: number[] } {
  if (!Number.isInteger(day) || day < 0 || day > SEASON_ONE_ROUTE.length + 1) throw new RangeError("Invalid Season 1 day");
  if (day === 0) return { current: null, next: 1, release: [] };
  if (day > SEASON_ONE_ROUTE.length) return { current: null, next: null, release: SEASON_ONE_ROUTE.map((_, i) => i + 1) };
  return { current: day, next: day < SEASON_ONE_ROUTE.length ? day + 1 : null, release: Array.from({ length: day - 1 }, (_, i) => i + 1) };
}

/** Refuse deletion of anything still visible or needed by a retained thumbnail. */
export function cleanupEligible(input: {
  day: number; currentDay: number; completed: boolean; nextComplete: boolean;
  thumbnail: string; fullResolution: readonly string[];
}): boolean {
  return Number.isInteger(input.day) && input.day >= 1 && input.day < SEASON_ONE_ROUTE.length
    && input.day < input.currentDay && input.completed && input.nextComplete
    && !input.fullResolution.includes(input.thumbnail);
}
