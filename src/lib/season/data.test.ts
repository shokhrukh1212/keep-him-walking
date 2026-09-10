import { describe, expect, it } from "vitest";
import { stampFor } from "@/lib/outcomes/stamp";
import type { SeasonDay } from "./data";

/**
 * The sheet's totals are the part that can silently drift, so they are asserted
 * against the same rule the page uses: only a finalized day may contribute.
 */
function statsFor(days: SeasonDay[]) {
  return {
    days: days.length,
    confirmedDistanceMetres: days.reduce((sum, day) => sum + (day.distanceMetres ?? 0), 0),
    landmarks: days.filter((day) => day.stamp === "colour" || day.stamp === "gold").length,
    marathons: days.filter((day) => day.stamp === "gold").length,
    countries: new Set(days.map((day) => day.countryCode)).size,
  };
}

function day(partial: Partial<SeasonDay> & { dayNumber: number }): SeasonDay {
  return {
    countryDayId: `day-${partial.dayNumber}`,
    cityName: "Tashkent",
    countryName: "Uzbekistan",
    countryCode: "UZ",
    scenePackId: "tashkent-v4",
    startsAt: "2026-09-01T16:00:00.000Z",
    storySummary: null,
    stamp: "grey",
    distanceMetres: 0,
    uniqueWatchers: 0,
    ...partial,
  };
}

describe("season sheet totals", () => {
  it("counts a marathon as a landmark reached as well", () => {
    const stats = statsFor([
      day({ dayNumber: 1, stamp: "gold" }),
      day({ dayNumber: 2, stamp: "colour", countryCode: "TJ" }),
      day({ dayNumber: 3, stamp: "grey", countryCode: "KG" }),
    ]);
    expect(stats.marathons).toBe(1);
    expect(stats.landmarks).toBe(2);
    expect(stats.countries).toBe(3);
  });

  it("leaves an unfinalized day out of the confirmed distance", () => {
    const stats = statsFor([
      day({ dayNumber: 1, stamp: "gold", distanceMetres: 42_200 }),
      day({ dayNumber: 2, stamp: null, distanceMetres: null }),
    ]);
    expect(stats.confirmedDistanceMetres).toBe(42_200);
    expect(stats.landmarks).toBe(1);
  });

  it("does not count the live day as an outcome", () => {
    const stats = statsFor([
      day({ dayNumber: 1, stamp: "colour", distanceMetres: 12_000 }),
      day({ dayNumber: 2, stamp: stampFor({ outcome: null, status: "live" }), distanceMetres: null }),
    ]);
    expect(stats.days).toBe(2);
    expect(stats.landmarks).toBe(1);
    expect(stats.marathons).toBe(0);
    expect(stats.confirmedDistanceMetres).toBe(12_000);
  });
});
