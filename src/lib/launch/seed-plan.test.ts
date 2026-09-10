import { describe, expect, it } from "vitest";
import { tashkentCountryPackV5 } from "@/content/countries/tashkent.v5";
import { buildSeason1LaunchPlan, parseSeason1LaunchAt } from "./seed-plan";

describe("Season 1 launch plan", () => {
  it("builds thirty-day metadata, calibrated Day 1, the name vote and seven founding slots", () => {
    const launchAt = parseSeason1LaunchAt("2034-09-20T16:00:00Z");
    const plan = buildSeason1LaunchPlan(launchAt, tashkentCountryPackV5);
    expect(plan.journey).toMatchObject({ totalDays: 30, rolloverUtcHour: 16 });
    expect(plan.day).toMatchObject({ dayNumber: 1, scenePackId: "tashkent-v5" });
    expect(plan.day.endsAt).toBe("2034-09-21T16:00:00.000Z");
    expect(plan.vote.options.map((option) => option.label)).toEqual(["Milo", "Nur", "Sami", "Bek"]);
    expect(plan.founding).toMatchObject({ days: 7, priceCents: 2_900 });
  });

  it("refuses an ambiguous or off-rollover launch instant", () => {
    expect(() => parseSeason1LaunchAt("2034-09-20T16:00:00")).toThrow("explicit UTC offset");
    expect(() => parseSeason1LaunchAt("2034-09-20T15:59:00Z")).toThrow("16:00 UTC");
  });
});
