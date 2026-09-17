import { describe, expect, it } from "vitest";
import { SEASON_ONE_ROUTE, seasonOneDayWindow } from "./anniversary";
import { cityAssetManifest, cleanupEligible, sceneAssetWindow, SEASON_SCENE_FALLBACK } from "./asset-manifest";

describe("Season 1 route and R2 manifests", () => {
  it("has 14 distinct countries and contiguous 21:00 Tashkent route days", () => {
    expect(SEASON_ONE_ROUTE).toHaveLength(14);
    expect(new Set(SEASON_ONE_ROUTE.map((stop) => stop.code)).size).toBe(14);
    for (let day = 1; day <= 14; day += 1) {
      const window = seasonOneDayWindow(day);
      expect(window.startsAt).toBe(new Date(Date.parse("2026-09-17T16:00:00.000Z") + (day - 1) * 86_400_000).toISOString());
      expect(Date.parse(window.endsAt) - Date.parse(window.startsAt)).toBe(86_400_000);
      if (day < 14) expect(window.endsAt).toBe(seasonOneDayWindow(day + 1).startsAt);
    }
    expect(seasonOneDayWindow(14).endsAt).toBe("2026-10-01T16:00:00.000Z");
    expect(() => seasonOneDayWindow(0)).toThrow();
    expect(() => seasonOneDayWindow(15)).toThrow();
  });

  it("gives missing art the safe fallback and keeps manifests independent", () => {
    const missing = cityAssetManifest(2, [], null, ["brussels pack", "brussels scene"]);
    expect(missing).toMatchObject({ city: "Brussels", country: "Belgium", fullResolution: [], thumbnail: SEASON_SCENE_FALLBACK, missing: ["brussels pack", "brussels scene"] });
    expect(cityAssetManifest(1, ["/scenes/paris/a.webp", "/scenes/paris/a.webp"], "/postcards/paris/thumb.webp", []).fullResolution).toEqual(["/scenes/paris/a.webp"]);
  });

  it("retains only current and next, releasing completed cities at transition", () => {
    expect(sceneAssetWindow(1)).toEqual({ current: 1, next: 2, release: [] });
    expect(sceneAssetWindow(2)).toEqual({ current: 2, next: 3, release: [1] });
    expect(sceneAssetWindow(14)).toEqual({ current: 14, next: null, release: Array.from({ length: 13 }, (_, i) => i + 1) });
  });

  it("refuses current, future, incomplete next, and shared-thumbnail cleanup", () => {
    const base = { day: 1, currentDay: 2, completed: true, nextComplete: true, thumbnail: "/postcards/paris/thumb.webp", fullResolution: ["/scenes/paris/full.webp"] };
    expect(cleanupEligible(base)).toBe(true);
    expect(cleanupEligible({ ...base, currentDay: 1 })).toBe(false);
    expect(cleanupEligible({ ...base, day: 2 })).toBe(false);
    expect(cleanupEligible({ ...base, nextComplete: false })).toBe(false);
    expect(cleanupEligible({ ...base, completed: false })).toBe(false);
    expect(cleanupEligible({ ...base, thumbnail: "/scenes/paris/full.webp" })).toBe(false);
  });
});
