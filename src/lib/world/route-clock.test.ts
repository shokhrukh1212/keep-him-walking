import { describe, expect, it } from "vitest";
import { tashkentCountryPackV3 as tashkentCountryPackV2 } from "@/content/countries/tashkent.v3";
import {
  deterministicVariant,
  extrapolatedRouteDistance,
  extrapolatedRouteSeconds,
  routePositionAt,
} from "./route-clock";

describe("route clock", () => {
  it.each([
    [0, "route", 0, 0, 0, 8_000, 0],
    [1_199, "route", 0, 1_199 / 1_200, 1_199, 6_801, 1_199 / 42_195],
    [1_200, "route", 1, 0, 0, 6_800, 1_200 / 42_195],
    [2_800, "route", 2, 0, 0, 5_200, 2_800 / 42_195],
    [4_400, "route", 3, 0, 0, 3_600, 4_400 / 42_195],
    [5_800, "route", 4, 0, 0, 2_200, 5_800 / 42_195],
    [8_000, "evening", 4, 0, 0, 0, 8_000 / 42_195],
    [10_201, "evening", 4, 1 / 2_200, 1, 0, 10_201 / 42_195],
    [42_195, "evening", 4, 1_195 / 2_200, 1_195, 0, 1],
  ] as const)("maps %s metres onto the route and evening loop", (
    distance, phase, zoneIndex, zoneProgress, metresIntoZone, remaining, marathon,
  ) => {
    expect(routePositionAt(tashkentCountryPackV2, distance)).toEqual({
      phase,
      zoneIndex,
      zoneProgress,
      metresIntoZone,
      remainingToLandmark: remaining,
      marathonProgress: marathon,
    });
  });

  it("freezes when no watcher is active and caps disconnected extrapolation", () => {
    const paused = {
      globalActiveSeconds: 50,
      globalDistanceMetres: 125,
      paceRate: 2,
      authoritativeAt: "2026-09-01T00:00:00Z",
      walking: false,
    };
    const walking = { ...paused, walking: true };
    const later = new Date("2026-09-01T00:01:00Z").getTime();
    expect(extrapolatedRouteSeconds(paused, later)).toBe(50);
    expect(extrapolatedRouteSeconds(walking, later)).toBe(110);
    expect(extrapolatedRouteDistance(paused, later)).toBe(125);
    expect(extrapolatedRouteDistance(walking, later)).toBe(275);
  });

  it("sanitizes invalid and negative distances", () => {
    expect(routePositionAt(tashkentCountryPackV2, Number.NaN))
      .toEqual(routePositionAt(tashkentCountryPackV2, 0));
    expect(routePositionAt(tashkentCountryPackV2, -10))
      .toEqual(routePositionAt(tashkentCountryPackV2, 0));
  });

  it("selects segment variants deterministically", () => {
    expect(deterministicVariant("zone:ground", 24, 2)).toBe(
      deterministicVariant("zone:ground", 24, 2),
    );
  });
});
