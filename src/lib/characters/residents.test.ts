import { describe, expect, it } from "vitest";
import { registeredCountryPacks } from "@/content/countries/registry";
import type { CountryPack } from "@/lib/content/schema";
import { CHARACTER_MANIFEST, RESIDENT_TYPES, candidateResident } from "./manifest";
import { packResidentType, walkerResidentType } from "./residents";

describe("resident per city", () => {
  it("uses the resident each route pack names", () => {
    const packs = registeredCountryPacks();
    const types = new Set<string>();
    for (const pack of packs) {
      if (pack.schemaVersion !== 3) throw new Error("Expected a route pack");
      expect(packResidentType(pack)).toBe(pack.npcSystem.baseType);
      types.add(packResidentType(pack));
    }
    expect([...types].sort()).toEqual([...RESIDENT_TYPES]);
  });

  it("gives a pack without a resident choice the original host", () => {
    expect(packResidentType({ schemaVersion: 2 } as CountryPack)).toBe("resident-a");
  });

  it("declares a distinct model and its own takes for each resident", () => {
    const [a, b] = RESIDENT_TYPES.map((type) => CHARACTER_MANIFEST.residents[type]);
    expect(a).toMatchObject({ url: "/characters/v3/resident-a.glb", animationUrl: "/characters/v3/resident-a-animations.glb" });
    expect(b).toMatchObject({ url: "/characters/v3/resident-b.glb", animationUrl: "/characters/v3/resident-b-animations.glb" });
    expect(b!.heightMetres).toBeLessThan(CHARACTER_MANIFEST.traveler.heightMetres);
    expect(candidateResident("v2", "resident-b")).toBe(b);
    expect(candidateResident("v1", "resident-b")).toBeUndefined();
  });
});

describe("background walker residents", () => {
  const seed = "sample-v1";

  it("never sends out a second walker as the same model", () => {
    for (const type of RESIDENT_TYPES) {
      const other = RESIDENT_TYPES.find((candidate) => candidate !== type);
      expect(walkerResidentType([type], seed, 30)).toBe(other);
    }
    expect(() => walkerResidentType([...RESIDENT_TYPES], seed, 30)).toThrow(RangeError);
  });

  it("gives every viewer the same first walker for a whole appearance", () => {
    const first = walkerResidentType([], seed, 240);
    for (const second of [240.5, 270, 359.9]) expect(walkerResidentType([], seed, second)).toBe(first);
  });

  it("lets both residents lead across a watch", () => {
    const leaders = new Set(Array.from({ length: 24 }, (_, block) => walkerResidentType([], seed, block * 120 + 10)));
    expect([...leaders].sort()).toEqual([...RESIDENT_TYPES]);
  });

  it("treats an unusable clock as the start of the watch", () => {
    expect(walkerResidentType([], seed, Number.NaN)).toBe(walkerResidentType([], seed, 0));
    expect(walkerResidentType([], seed, -50)).toBe(walkerResidentType([], seed, 0));
  });
});
