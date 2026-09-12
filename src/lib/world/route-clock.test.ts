import { describe, expect, it } from "vitest";
import { tashkentCountryPackV4 } from "@/content/countries/tashkent.v4";
import {
  activeWalkingSecondsAt,
  deterministicVariant,
  extrapolatedRouteDistance,
  extrapolatedRouteSeconds,
  routePositionAt,
  scenePositionAt,
  SCENE_VISIT_SECONDS,
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
    expect(routePositionAt(tashkentCountryPackV4, distance)).toEqual({
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

  it("holds server-confirmed distance for a crowd action and resumes afterward", () => {
    const runtime = {
      globalActiveSeconds: 100,
      globalDistanceMetres: 250,
      paceRate: 2,
      authoritativeAt: "2026-09-01T00:00:00Z",
      walking: true,
    };
    const action = [{
      kind: "photo" as const,
      atActiveSecond: 102,
      endsAtActiveSecond: 106,
      frozenDistanceMetres: 255,
    }];
    expect(extrapolatedRouteDistance(runtime, Date.parse("2026-09-01T00:00:03Z"), action))
      .toBe(255);
    expect(extrapolatedRouteDistance(runtime, Date.parse("2026-09-01T00:00:08Z"), action))
      .toBe(260);
  });

  it("supports action rows from the rollback contract without new fields", () => {
    const runtime = {
      globalActiveSeconds: 0,
      globalDistanceMetres: 0,
      paceRate: 1,
      authoritativeAt: "2026-09-01T00:00:00Z",
      walking: true,
    };
    expect(extrapolatedRouteDistance(runtime, Date.parse("2026-09-01T00:00:08Z"), [
      { kind: "wave", atActiveSecond: 2 },
    ])).toBeCloseTo(6.875);
  });

  it("sanitizes invalid and negative distances", () => {
    expect(routePositionAt(tashkentCountryPackV4, Number.NaN))
      .toEqual(routePositionAt(tashkentCountryPackV4, 0));
    expect(routePositionAt(tashkentCountryPackV4, -10))
      .toEqual(routePositionAt(tashkentCountryPackV4, 0));
  });

  it("selects segment variants deterministically", () => {
    expect(deterministicVariant("zone:ground", 24, 2)).toBe(
      deterministicVariant("zone:ground", 24, 2),
    );
  });

  it("loops five paintings after 90 walking minutes without a landmark clamp", () => {
    expect(scenePositionAt(tashkentCountryPackV4, 0)).toMatchObject({ zoneIndex: 0, visitIndex: 0, cycleIndex: 0 });
    expect(scenePositionAt(tashkentCountryPackV4, SCENE_VISIT_SECONDS)).toMatchObject({ zoneIndex: 1, visitIndex: 1, cycleIndex: 0 });
    expect(scenePositionAt(tashkentCountryPackV4, SCENE_VISIT_SECONDS * 5)).toMatchObject({ zoneIndex: 0, visitIndex: 5, cycleIndex: 1 });
    expect(scenePositionAt(tashkentCountryPackV4, SCENE_VISIT_SECONDS * 8 + 540)).toMatchObject({
      zoneIndex: 3,
      visitIndex: 8,
      cycleIndex: 1,
      secondsIntoVisit: 540,
      visitProgress: 0.5,
    });
  });

  it("derives one global walking clock and unions stopping-action overlaps", () => {
    const actions = [
      { kind: "wave" as const, atActiveSecond: 10, endsAtActiveSecond: 12.5 },
      { kind: "photo" as const, atActiveSecond: 12, endsAtActiveSecond: 16 },
    ];
    expect(activeWalkingSecondsAt(9, actions)).toBe(9);
    expect(activeWalkingSecondsAt(14, actions)).toBe(10);
    expect(activeWalkingSecondsAt(20, actions)).toBe(14);
    // Viewer count and pace are deliberately not inputs to this function.
    expect(scenePositionAt(tashkentCountryPackV4, activeWalkingSecondsAt(20, actions)).zoneIndex).toBe(0);
  });
});
