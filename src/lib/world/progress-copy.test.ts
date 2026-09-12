import { describe, expect, it } from "vitest";
import { distanceProgress, formatDistanceKm, formatGoalKm, nextPlaceEta, stopLabel } from "./progress-copy";

describe("distance copy", () => {
  it("never rounds confirmed distance up to a goal", () => {
    expect(formatDistanceKm(4_349)).toBe("4.3");
    expect(formatDistanceKm(7_999)).toBe("7.9");
    expect(formatDistanceKm(-5)).toBe("0.0");
    expect(formatGoalKm(8_000)).toBe("8");
    expect(formatGoalKm(42_195)).toBe("42.2");
  });

  it("shows today's shared goal with its percentage, then the marathon", () => {
    expect(distanceProgress(4_320, 8_000, 42_195)).toMatchObject({
      goal: "daily",
      percent: 54,
      text: "4.3 / 8 km together · 54%",
      shortText: "4.3/8 km · 54%",
      nextGoalText: "After 8 km the next goal is a 42.2 km marathon.",
    });
    expect(distanceProgress(9_120, 8_000, 42_195)).toMatchObject({
      goal: "marathon",
      percent: 21,
      text: "9.1 / 42.2 km together · 21%",
      nextGoalText: null,
    });
    expect(distanceProgress(45_000, 8_000, 42_195)).toMatchObject({
      goal: "complete",
      fill: 1,
      text: "45.0 km together · marathon reached",
    });
  });
});

describe("place copy", () => {
  it("gives the next place in walking minutes, never kilometres", () => {
    expect(nextPlaceEta(245)).toEqual({
      minutes: 5,
      text: "Next place in ~5 walking min",
      shortText: "~5 walking min",
      ariaText: "Next place in about 5 minutes of walking",
    });
    expect(nextPlaceEta(61).ariaText).toBe("Next place in about 2 minutes of walking");
    expect(nextPlaceEta(60).minutes).toBe(1);
    expect(nextPlaceEta(12).shortText).toBe("<1 walking min");
  });

  it("names the stop within the manifest", () => {
    expect(stopLabel(2, 5)).toEqual({ text: "Stop 3 of 5", shortText: "3/5" });
    expect(stopLabel(9, 10).text).toBe("Stop 10 of 10");
    expect(stopLabel(12, 3).text).toBe("Stop 3 of 3");
  });
});
