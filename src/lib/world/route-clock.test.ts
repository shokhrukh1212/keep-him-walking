import { describe, expect, it } from "vitest";
import { tashkentCountryPackV4 } from "@/content/countries/tashkent.v4";
import type { CountryPack } from "@/lib/content/schema";
import {
  activeWalkingSecondsAt,
  deterministicVariant,
  extrapolatedRouteDistance,
  extrapolatedRouteSeconds,
  projectedRouteDistance,
  routePositionAt,
  scenePositionAt,
  sceneVisitSecondsFor,
} from "./route-clock";

function withPlaces(count: number, sceneVisitSeconds?: number): CountryPack {
  const zones = Array.from({ length: count }, (_, index) => ({
    ...tashkentCountryPackV4.route.zones[index % tashkentCountryPackV4.route.zones.length]!,
    id: `place-${index}`,
  }));
  return {
    ...tashkentCountryPackV4,
    route: { ...tashkentCountryPackV4.route, zones, ...(sceneVisitSeconds ? { sceneVisitSeconds } : {}) },
  };
}

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
  ] as const)("keeps the legacy metre position for %s metres", (
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

  it("holds distance through a scheduled stop that plants no distance of its own", () => {
    const runtime = {
      globalActiveSeconds: 100,
      globalDistanceMetres: 250,
      paceRate: 2,
      authoritativeAt: "2026-09-01T00:00:00Z",
      walking: true,
    };
    const conversation = [{ kind: "conversation" as const, atActiveSecond: 102, endsAtActiveSecond: 122, source: "system" as const }];
    expect(projectedRouteDistance(runtime, 2, conversation)).toBe(255);
    expect(projectedRouteDistance(runtime, 10, conversation)).toBe(255);
    expect(projectedRouteDistance(runtime, 30, conversation)).toBe(275);
    expect(projectedRouteDistance(runtime, 30, [{ ...conversation[0]!, cancelled: true }])).toBe(325);
  });

  it("supports action rows from the rollback contract without new fields", () => {
    const runtime = {
      globalActiveSeconds: 0,
      globalDistanceMetres: 0,
      paceRate: 1,
      authoritativeAt: "2026-09-01T00:00:00Z",
      walking: true,
    };
    // A wave without an end second lasts its natural take: 1.2 s stop plus 4.73 s wave.
    expect(extrapolatedRouteDistance(runtime, Date.parse("2026-09-01T00:00:08Z"), [
      { kind: "wave", atActiveSecond: 2 },
    ])).toBeCloseTo((8 - 5.93) * 1.25);
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
});

describe("scene position", () => {
  it("shows each place for seven walking minutes and loops without a landmark clamp", () => {
    const pack = tashkentCountryPackV4;
    expect(sceneVisitSecondsFor(pack)).toBe(420);
    expect(scenePositionAt(pack, 0)).toEqual({
      zoneIndex: 0, visitIndex: 0, cycleIndex: 0, secondsIntoVisit: 0, visitProgress: 0,
      placeCount: 5, visitSeconds: 420, nextZoneIndex: 1, secondsToNextVisit: 420,
    });
    expect(scenePositionAt(pack, 420)).toMatchObject({ zoneIndex: 1, visitIndex: 1, cycleIndex: 0 });
    expect(scenePositionAt(pack, 420 * 5)).toMatchObject({ zoneIndex: 0, visitIndex: 5, cycleIndex: 1 });
    expect(scenePositionAt(pack, 420 * 8 + 210)).toMatchObject({
      zoneIndex: 3,
      visitIndex: 8,
      cycleIndex: 1,
      secondsIntoVisit: 210,
      visitProgress: 0.5,
      nextZoneIndex: 4,
      secondsToNextVisit: 210,
    });
  });

  it.each([1, 3, 10, 24])("loops a manifest of %i places in order", (count) => {
    const pack = withPlaces(count);
    for (let visit = 0; visit < count * 3; visit += 1) {
      const position = scenePositionAt(pack, visit * 420 + 1);
      expect(position.zoneIndex).toBe(visit % count);
      expect(position.cycleIndex).toBe(Math.floor(visit / count));
      expect(position.nextZoneIndex).toBe((visit + 1) % count);
      expect(position.placeCount).toBe(count);
    }
  });

  it("refuses an empty manifest and honours a pinned visit length", () => {
    expect(() => scenePositionAt(withPlaces(0), 0)).toThrow(RangeError);
    expect(scenePositionAt(withPlaces(5, 60), 60).zoneIndex).toBe(1);
  });
});

describe("walking clock", () => {
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

  it("stays on the server anchor when old rows are no longer sent", () => {
    const clock = { anchorActiveSeconds: 1_000, heldActiveSeconds: 300 };
    const rows = [
      { kind: "phone" as const, atActiveSecond: 990, endsAtActiveSecond: 1_005, source: "system" as const },
      { kind: "conversation" as const, atActiveSecond: 1_010, endsAtActiveSecond: 1_040, source: "system" as const },
    ];
    expect(activeWalkingSecondsAt(1_000, rows, clock)).toBe(700);
    // A viewer slightly behind the anchor, inside the stop the anchor already counted.
    expect(activeWalkingSecondsAt(995, rows, clock)).toBe(700);
    expect(activeWalkingSecondsAt(1_003, rows, clock)).toBe(700);
    expect(activeWalkingSecondsAt(1_008, rows, clock)).toBe(703);
    expect(activeWalkingSecondsAt(1_020, rows, clock)).toBe(705);
    expect(activeWalkingSecondsAt(1_050, rows, clock)).toBe(715);
    expect(activeWalkingSecondsAt(980, [], clock)).toBe(680);
  });

  it("ignores cancelled stops and an inconsistent anchor", () => {
    const cancelled = [{ kind: "phone" as const, atActiveSecond: 10, endsAtActiveSecond: 34.77, cancelled: true }];
    expect(activeWalkingSecondsAt(20, cancelled)).toBe(20);
    expect(activeWalkingSecondsAt(20, [], { anchorActiveSeconds: 10, heldActiveSeconds: 11 })).toBe(20);
  });
});
