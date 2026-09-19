import { describe, expect, it } from "vitest";
import { RELAUNCH_JOURNEY, placementDurationCopy, placementPriceCents, relaunchPlan, tashkentLocalToUtc } from "./config";

describe("Paris relaunch configuration", () => {
  it("has one authoritative 14-day route beginning in Paris", () => {
    expect(RELAUNCH_JOURNEY.durationDays).toBe(14);
    expect(RELAUNCH_JOURNEY.days).toHaveLength(14);
    expect(RELAUNCH_JOURNEY.days[0]).toMatchObject({ cityName: "Paris", countryCode: "FR", scenePackId: "paris-v3" });
    expect(relaunchPlan().days).toBe(RELAUNCH_JOURNEY.days);
  });

  it("prices the fixed tiers without replacement arithmetic", () => {
    expect(placementPriceCents("regular")).toBe(5_000);
    expect(placementPriceCents("featured")).toBe(10_000);
  });

  it("does not invent a waiting deadline", () => {
    expect(placementDurationCopy({ state: "waiting", endsAt: null })).toContain("waiting period");
    expect(placementDurationCopy({ state: "waiting", endsAt: null })).not.toMatch(/date|deadline/i);
  });

  it("resolves owner-entered Tashkent wall time explicitly to UTC", () => {
    expect(tashkentLocalToUtc("2026-10-01T20:30")).toBe("2026-10-01T15:30:00.000Z");
    expect(tashkentLocalToUtc("not-a-date")).toBeNull();
  });
});
