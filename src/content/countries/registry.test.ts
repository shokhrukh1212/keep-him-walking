import { describe, expect, it } from "vitest";
import { PACK_GEOGRAPHY } from "./geography";
import { getCountryPack, registeredCountryPacks } from "./registry";

describe("country pack registry", () => {
  const packs = registeredCountryPacks();

  it("gives every registered pack real coordinates", () => {
    // A pack at 0,0 silently disables the weather fetch and the vote's
    // distance fallback, which is how the hand-written packs slipped through.
    for (const pack of packs) {
      expect(pack.lat, `${pack.assetVersion} latitude`).not.toBe(0);
      expect(pack.lon, `${pack.assetVersion} longitude`).not.toBe(0);
      expect(Math.abs(pack.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(pack.lon)).toBeLessThanOrEqual(180);
    }
  });

  it("applies geography however the pack was authored", () => {
    // tashkent-v3 is hand-written; tashkent-v4 comes from the factory.
    for (const id of ["tashkent-v2", "tashkent-v3", "tashkent-v4"]) {
      const pack = getCountryPack(id);
      expect(pack?.lat).toBeCloseTo(41.2995, 4);
      expect(pack?.neighbours).toContain("dushanbe-v1");
    }
  });

  it("names only neighbours that are themselves registered", () => {
    const ids = new Set(packs.map((pack) => pack.assetVersion));
    for (const pack of packs) {
      for (const neighbour of pack.neighbours) {
        expect(ids.has(neighbour), `${pack.assetVersion} → ${neighbour}`).toBe(true);
      }
    }
  });

  it("never lists a country as its own neighbour", () => {
    for (const pack of packs) {
      for (const neighbour of pack.neighbours) {
        expect(getCountryPack(neighbour)?.countryCode).not.toBe(pack.countryCode);
      }
    }
  });

  it("keeps land borders symmetric between registered countries", () => {
    for (const pack of packs) {
      for (const neighbour of pack.neighbours) {
        const other = getCountryPack(neighbour);
        if (!other) continue;
        // The reverse edge must exist for some pack of this country.
        const reverse = packs
          .filter((candidate) => candidate.countryCode === pack.countryCode)
          .some((candidate) => other.neighbours.includes(candidate.assetVersion));
        expect(reverse, `${neighbour} → ${pack.countryCode}`).toBe(true);
      }
    }
  });

  it("has a geography entry for every registered pack", () => {
    for (const pack of packs) {
      expect(PACK_GEOGRAPHY[pack.assetVersion], pack.assetVersion).toBeDefined();
    }
  });
});
