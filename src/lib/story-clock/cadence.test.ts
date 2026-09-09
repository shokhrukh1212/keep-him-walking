import { describe, expect, it } from "vitest";
import { tashkentCountryPackV4 } from "@/content/countries/tashkent.v4";
import { missedMajorBeats, scheduleStoryBeats } from "./cadence";

describe("Phase 2 cadence", () => {
  it("keeps only departure time-based and starts it at rollover", () => {
    const start = new Date("2026-09-10T00:00:00.000Z");
    const end = new Date("2026-09-11T00:00:00.000Z");
    const beats = scheduleStoryBeats(tashkentCountryPackV4, start, end);
    expect(beats).toHaveLength(1);
    expect(beats[0]?.kind).toBe("departure");
    expect(beats[0]?.startsAt).toBe(end.toISOString());
    expect(missedMajorBeats(beats, end)).toHaveLength(0);
    expect(missedMajorBeats(beats, new Date(end.getTime() + 90_000))).toHaveLength(1);
  });
});
