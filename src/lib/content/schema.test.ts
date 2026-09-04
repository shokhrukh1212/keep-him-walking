import { describe, expect, it } from "vitest";
import { tashkentCountryPackV3 } from "@/content/countries/tashkent.v3";
import { phase3EditorialBufferOrder, registeredCountryPacks } from "@/content/countries/registry";
import { countryPackV3Schema } from "./schema";
import { countryPackSchema } from "./schema";
import type { CountryPackV3 } from "./schema";

describe("Tashkent content pack", () => {
  it("satisfies the production-compatible asset contract", () => {
    expect(countryPackSchema.parse(tashkentCountryPackV3).assetVersion).toBe("tashkent-v3");
    expect(tashkentCountryPackV3.route.zones).toHaveLength(5);
    expect(tashkentCountryPackV3.route.zones.every((zone) => zone.layers.length >= 2)).toBe(true);
    expect(tashkentCountryPackV3.route.zones.every((zone) => zone.props.every((prop) => prop.assetUrl))).toBe(true);
    expect(tashkentCountryPackV3.ambientActions).toHaveLength(4);
    expect(tashkentCountryPackV3.encounters[0]?.lines).toHaveLength(4);
  });

  it("keeps dialogue outside animation files", () => {
    expect(tashkentCountryPackV3.encounters[0]?.lines.every((line) => line.text.length > 0)).toBe(true);
    expect(tashkentCountryPackV3.traveler.riveUrl).toBeNull();
    expect(tashkentCountryPackV3.traveler.walkCycle?.frames).toHaveLength(8);
  });
});

describe("Phase 2 country packs", () => {
  const packs = registeredCountryPacks().filter((pack): pack is CountryPackV3 => pack.schemaVersion === 3 && !phase3EditorialBufferOrder.includes(pack.assetVersion as typeof phase3EditorialBufferOrder[number]));

  it("registers the immutable seven-country route", () => {
    expect(packs.map((pack) => pack.assetVersion)).toEqual([
      "tashkent-v4", "dushanbe-v1", "bishkek-v1", "almaty-v1", "baku-v1", "tbilisi-v1", "istanbul-v1",
    ]);
    for (const pack of packs) expect(countryPackV3Schema.parse(pack)).toBeTruthy();
  });

  it("keeps environment ownership, cadence and review gates explicit", () => {
    const sceneUrls = packs.flatMap((pack) =>
      pack.route.zones.flatMap((zone) =>
        zone.layers.flatMap((layer) => layer.segments.map((segment) => segment.url)),
      ),
    );
    expect(new Set(sceneUrls).size).toBe(175);
    expect(packs.every((pack) => pack.storyBeats.length >= 4)).toBe(true);
    expect(packs[0]?.culturalReview.status).toBe("approved");
    expect(packs.slice(1).every((pack) => pack.culturalReview.status === "provisional_preview")).toBe(true);
    expect(new Set(packs.map((pack) => pack.npcSystem.baseType))).toEqual(new Set(["resident-a", "resident-b"]));
  });
});

describe("Phase 3 editorial buffer", () => {
  const packs = phase3EditorialBufferOrder.map((packId) => registeredCountryPacks().find((pack) => pack.assetVersion === packId));

  it("registers seven unpublished, validated and distinct country packs", () => {
    expect(packs.every((pack) => pack?.schemaVersion === 3)).toBe(true);
    const typed = packs.filter((pack): pack is NonNullable<typeof pack> => Boolean(pack));
    expect(typed.map((pack) => pack.assetVersion)).toEqual(phase3EditorialBufferOrder);
    expect(typed.every((pack) => pack.schemaVersion === 3 && pack.route.zones.length === 5 && pack.culturalReview.status === "provisional_preview")).toBe(true);
    expect(new Set(typed.map((pack) => pack.countryCode)).size).toBe(7);
  });
});
