import { describe, expect, it } from "vitest";
import { tashkentCountryPackV4 } from "@/content/countries/tashkent.v4";
import { missedMajorBeats, scheduleStoryBeats } from "./cadence";

describe("Phase 2 cadence", () => {
  it("orders four or more beats within a country-day", () => {
    const start = new Date("2026-09-10T00:00:00.000Z");
    const end = new Date("2026-09-11T00:00:00.000Z");
    const beats = scheduleStoryBeats(tashkentCountryPackV4, start, end);
    expect(beats).toHaveLength(5);
    expect(beats.every((beat) => beat.startsAt >= start.toISOString() && beat.startsAt < end.toISOString())).toBe(true);
    expect(missedMajorBeats(beats, new Date("2026-09-10T12:00:00.000Z")).length).toBeGreaterThan(1);
  });
});
