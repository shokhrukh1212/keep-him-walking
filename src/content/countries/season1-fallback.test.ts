import { describe, expect, it } from "vitest";
import { SEASON_ONE_ROUTE } from "@/lib/season/anniversary";
import { SEASON_SCENE_FALLBACK } from "@/lib/season/asset-manifest";
import { isVoteReadyPack } from "@/lib/content/schema";
import { buildAnniversaryPlan } from "@/lib/season/plan";
import { getCountryPack } from "./registry";
import { SEASON_ONE_FALLBACK_IDS } from "./season1-fallback";

describe("the complete Season 1 route", () => {
  it("resolves every configured city to matching geography and a valid timezone", () => {
    for (const stop of SEASON_ONE_ROUTE) {
      const pack = getCountryPack(stop.packId);
      expect(pack).not.toBeNull();
      expect(pack).toMatchObject({ countryCode: stop.code, countryName: stop.country, cityName: stop.city, timeZone: stop.timeZone, lat: stop.lat, lon: stop.lon });
      expect(() => new Intl.DateTimeFormat("en", { timeZone: stop.timeZone })).not.toThrow();
    }
  });

  it("uses the one safe generic scene and no Paris claims for the four missing cities", () => {
    expect(SEASON_ONE_FALLBACK_IDS.size).toBe(4);
    for (const id of SEASON_ONE_FALLBACK_IDS) {
      const pack = getCountryPack(id);
      expect(pack?.schemaVersion).toBe(3);
      if (!pack || pack.schemaVersion !== 3) continue;
      expect(isVoteReadyPack(pack)).toBe(false);
      expect(pack.culturalReview.status).toBe("pending");
      expect(pack.route.zones).toHaveLength(1);
      expect(pack.route.zones[0]?.fallbackUrl).toBe(SEASON_SCENE_FALLBACK);
      expect(JSON.stringify(pack)).not.toContain("/scenes/paris/");
      expect(JSON.stringify(pack.encounters)).not.toMatch(/Bonjour|Camille|Seine|Paris/);
    }
  });

  it("builds all 14 days from the real registry and names the last transfer as a flight", () => {
    const packs = SEASON_ONE_ROUTE.map((stop) => getCountryPack(stop.packId));
    expect(packs.every((pack) => pack?.schemaVersion === 3)).toBe(true);
    const plan = buildAnniversaryPlan(packs as Parameters<typeof buildAnniversaryPlan>[0]);
    expect(plan.days.map((day) => day.countryCode)).toEqual(SEASON_ONE_ROUTE.map((stop) => stop.code));
    expect(plan.days[13]?.arrivalMode).toBe("flight");
    expect(plan.days.slice(1, 13).every((day) => day.arrivalMode === "walk")).toBe(true);
  });
});
