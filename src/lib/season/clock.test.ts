import { describe, expect, it } from "vitest";
import { formatSeasonCountdown, seasonClockLine, seasonClockParts, seasonPhaseAt, type SeasonRecord } from "./clock";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const start = Date.parse("2026-09-23T16:00:00Z");

function season(number: number, startsAtMs: number, status: SeasonRecord["status"]): SeasonRecord {
  return {
    id: `season-${number}`,
    number,
    title: `Season ${number}`,
    status,
    startsAt: new Date(startsAtMs).toISOString(),
    endsAt: new Date(startsAtMs + 7 * DAY).toISOString(),
    totalDays: 7,
  };
}

describe("seasonPhaseAt", () => {
  it("has no phase before any season is configured", () => {
    expect(seasonPhaseAt([], start)).toEqual({ kind: "none", needsReconcile: false });
  });

  it("is prelaunch before the first season starts, and live from its exact start", () => {
    const one = season(1, start, "draft");
    expect(seasonPhaseAt([one], start - 1)).toMatchObject({ kind: "prelaunch", next: one, needsReconcile: false });
    expect(seasonPhaseAt([one], start)).toMatchObject({ kind: "live", current: one, next: null, needsReconcile: true });
  });

  it("stays live through Day 7 and completes at the boundary", () => {
    const one = season(1, start, "active");
    expect(seasonPhaseAt([one], start + 7 * DAY - 1)).toMatchObject({ kind: "live", needsReconcile: false });
    expect(seasonPhaseAt([one], start + 7 * DAY)).toMatchObject({ kind: "completed", last: one, next: null, needsReconcile: true });
    expect(seasonPhaseAt([{ ...one, status: "completed" }], start + 7 * DAY)).toMatchObject({ kind: "completed", needsReconcile: false });
  });

  it("offers a configured next season from the completed state and begins it on time", () => {
    const one = season(1, start, "completed");
    const two = season(2, start + 10 * DAY, "draft");
    expect(seasonPhaseAt([two, one], start + 8 * DAY)).toMatchObject({ kind: "completed", last: one, next: two });
    expect(seasonPhaseAt([one, two], start + 10 * DAY)).toMatchObject({ kind: "live", current: two, needsReconcile: true });
  });

  it("flags a missed scheduler run that left a whole week unsettled", () => {
    const one = season(1, start, "draft");
    expect(seasonPhaseAt([one], start + 12 * DAY)).toMatchObject({ kind: "completed", needsReconcile: true });
  });

  it("ignores paused and malformed seasons", () => {
    const paused = season(1, start, "paused");
    const broken = { ...season(2, start, "active"), endsAt: "not a date" };
    expect(seasonPhaseAt([paused, broken], start + DAY).kind).toBe("none");
  });
});

describe("season clock line", () => {
  const base = {
    number: 1,
    totalDays: 7,
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + 7 * DAY).toISOString(),
    dayNumber: null,
  };

  it("counts down to the start before the season", () => {
    expect(seasonClockLine({ ...base, state: "prelaunch", nowMs: start - 2 * DAY - 4 * HOUR })).toBe("Season 1 · Starts in 2d 4h");
    expect(seasonClockLine({ ...base, state: "prelaunch", nowMs: start + 1 })).toBe("Season 1 · Starting now");
  });

  it("names the shared day and the wall-clock end while live", () => {
    const nowMs = start + 2 * DAY + 18 * HOUR;
    expect(seasonClockLine({ ...base, state: "live", dayNumber: 3, nowMs })).toBe("Season 1 · Day 3 of 7 · Ends in 4d 6h");
    expect(seasonClockLine({ ...base, state: "live", dayNumber: 7, nowMs: start + 7 * DAY - 30 * 60_000 })).toBe("Season 1 · Day 7 of 7 · Ends in 30m");
    expect(seasonClockLine({ ...base, state: "live", dayNumber: 7, nowMs: start + 7 * DAY })).toBe("Season 1 · Day 7 of 7 · Ending now");
  });

  it("splits into the season and its countdown for a narrow header", () => {
    const nowMs = start + 2 * DAY + 18 * HOUR;
    expect(seasonClockParts({ ...base, state: "live", dayNumber: 3, nowMs })).toEqual({ where: "Season 1 · Day 3 of 7", when: "Ends in 4d 6h" });
    expect(seasonClockParts({ ...base, state: "completed", nowMs })).toEqual({ where: "Season 1", when: "Season complete" });
  });

  it("never names a day past the last one", () => {
    expect(seasonClockLine({ ...base, state: "live", dayNumber: 9, nowMs: start })).toContain("Day 7 of 7");
  });

  it("says the season is complete after the end, with no resetting urgency", () => {
    expect(seasonClockLine({ ...base, state: "completed", nowMs: start + 30 * DAY })).toBe("Season 1 · Season complete");
  });

  it("formats every countdown scale", () => {
    expect(formatSeasonCountdown(4 * DAY + 6 * HOUR + 59 * 60_000)).toBe("4d 6h");
    expect(formatSeasonCountdown(6 * HOUR + 12 * 60_000)).toBe("6h 12m");
    expect(formatSeasonCountdown(12 * 60_000 + 59_000)).toBe("12m");
    expect(formatSeasonCountdown(59_000)).toBe("under 1m");
    expect(formatSeasonCountdown(-5)).toBe("under 1m");
    expect(formatSeasonCountdown(Number.NaN)).toBe("under 1m");
  });
});
