import { describe, expect, it } from "vitest";
import { distanceProgress, formatDistanceKm, formatGoalKm, fullDayGoalMetres, nextPlaceEta, stopLabel } from "./progress-copy";

describe("distance copy", () => {
  it("never rounds confirmed distance up to a goal", () => {
    expect(formatDistanceKm(4_349)).toBe("4.3");
    expect(formatDistanceKm(7_999)).toBe("7.9");
    expect(formatDistanceKm(-5)).toBe("0.0");
    expect(formatGoalKm(8_000)).toBe("8");
    expect(formatGoalKm(42_195)).toBe("42.2");
  });

  it("makes today's goal the whole day walked at his pace", () => {
    // 24 hours at 1.5 m/s: the most a fully watched day can cover.
    expect(fullDayGoalMetres("2026-09-24T18:00:00Z", "2026-09-25T18:00:00Z", 1.5)).toBe(129_600);
    expect(formatGoalKm(129_600)).toBe("129.6");
    // A shorter scheduled day gets a shorter goal, never the 24-hour one.
    expect(fullDayGoalMetres("2026-09-24T18:00:00Z", "2026-09-25T06:00:00Z", 1.5)).toBe(64_800);
    // Unreadable bounds fall back to a 24-hour day rather than a zero goal.
    expect(fullDayGoalMetres("not a date", "2026-09-25T18:00:00Z", 1.5)).toBe(129_600);
    expect(fullDayGoalMetres("2026-09-25T18:00:00Z", "2026-09-24T18:00:00Z", 1.5)).toBe(129_600);
  });

  it("counts against the whole day and passes the marathon on the way", () => {
    expect(distanceProgress(4_320, 129_600, 42_195)).toMatchObject({
      goal: "daily",
      percent: 3,
      marathonReached: false,
      text: "4.3 / 129.6 km today · 3%",
      shortText: "4.3/129.6 km · 3%",
      nextGoalText: "The 42.2 km marathon is a milestone on the way.",
    });
    // Past 8 km the goal does not change: that was the old fixed goal he outgrew.
    expect(distanceProgress(9_120, 129_600, 42_195)).toMatchObject({ goal: "daily", percent: 7 });
    expect(distanceProgress(45_000, 129_600, 42_195)).toMatchObject({
      goal: "daily",
      percent: 34,
      marathonReached: true,
      text: "45.0 / 129.6 km today · 34% · marathon reached",
      nextGoalText: null,
    });
    expect(distanceProgress(129_600, 129_600, 42_195)).toMatchObject({
      goal: "complete",
      fill: 1,
      text: "129.6 km today · whole day walked",
    });
  });

  it("never promises a marathon a short day cannot reach", () => {
    expect(distanceProgress(1_000, 30_000, 42_195).nextGoalText).toBeNull();
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
