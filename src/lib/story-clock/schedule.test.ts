import { describe, expect, it } from "vitest";
import { buildSevenDaySchedule, DAY_MS, resolveJourneyMoment, scaledStoryNow } from "./schedule";

describe("Phase 2 seven-day story schedule", () => {
  const start = new Date("2026-09-10T00:00:00.000Z");

  it("builds seven contiguous immutable UTC windows", () => {
    const schedule = buildSevenDaySchedule(start);
    expect(schedule).toHaveLength(7);
    expect(schedule.map((day) => day.scenePackId)).toEqual([
      "tashkent-v4", "dushanbe-v1", "bishkek-v1", "almaty-v1", "baku-v1", "tbilisi-v1", "istanbul-v1",
    ]);
    schedule.slice(1).forEach((day, index) => expect(day.startsAt).toBe(schedule[index]?.endsAt));
  });

  it("resolves exact UTC boundaries without client timezone assumptions", () => {
    expect(resolveJourneyMoment(start, new Date(start.getTime() - 1)).journeyState).toBe("prelaunch");
    expect(resolveJourneyMoment(start, new Date(start.getTime() + DAY_MS)).countryDay?.scenePackId).toBe("dushanbe-v1");
    expect(resolveJourneyMoment(start, new Date(start.getTime() + 7 * DAY_MS)).journeyState).toBe("completed");
  });

  it("maps a ten-minute real rehearsal day to one story day at 144x", () => {
    const story = scaledStoryNow(new Date(start.getTime() + 10 * 60_000), start, start, 144);
    expect(story.getTime() - start.getTime()).toBe(DAY_MS);
  });

  it("uses real time without anchors and rejects unsafe scales", () => {
    const now = new Date("2026-09-10T01:00:00.000Z");
    expect(scaledStoryNow(now, null, null, 144)).toEqual(now);
    expect(() => scaledStoryNow(now, start, start, 0)).toThrow(/between 1 and 144/);
    expect(() => buildSevenDaySchedule(new Date("invalid"))).toThrow(/valid timestamp/);
  });
});
