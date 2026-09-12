import { describe, expect, it } from "vitest";
import { parisCountryPackV1 } from "@/content/countries/paris.v1";
import { buildSeason1LaunchPlan, parseSeason1LaunchAt } from "./seed-plan";

describe("Season 1 launch plan", () => {
  it("builds thirty-day metadata, calibrated Day 1, the name vote and seven founding slots", () => {
    const launchAt = parseSeason1LaunchAt("2034-09-20T16:00:00Z");
    const plan = buildSeason1LaunchPlan(launchAt, parisCountryPackV1);
    expect(plan.journey).toMatchObject({ totalDays: 30, rolloverUtcHour: 16 });
    expect(plan.day).toMatchObject({ dayNumber: 1, scenePackId: "paris-v1", cityName: "Paris" });
    expect(plan.day.endsAt).toBe("2034-09-21T16:00:00.000Z");
    expect(plan.vote.options.map((option) => option.label)).toEqual(["Milo", "Nur", "Sami", "Bek"]);
    expect(plan.founding).toMatchObject({ days: 7, priceCents: 2_900 });
  });

  it("refuses an ambiguous or off-rollover launch instant", () => {
    expect(() => parseSeason1LaunchAt("2034-09-20T16:00:00")).toThrow("explicit UTC offset");
    expect(() => parseSeason1LaunchAt("2034-09-20T15:59:00Z")).toThrow("16:00 UTC");
  });

  it("derives Day 1 identity from the reviewed pack instead of a fixed country", () => {
    const london = {
      ...parisCountryPackV1,
      assetVersion: "london-v1",
      countryCode: "GB",
      countryName: "United Kingdom",
      cityName: "London",
      timeZone: "Europe/London",
      postcardBackgroundUrl: "/postcards/london/v1/background.webp",
    };
    expect(buildSeason1LaunchPlan(
      parseSeason1LaunchAt("2034-09-20T16:00:00Z"),
      london,
    ).day).toMatchObject({
      countryCode: "GB",
      cityName: "London",
      scenePackId: "london-v1",
    });
  });
});
