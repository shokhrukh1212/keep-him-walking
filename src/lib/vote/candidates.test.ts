import { describe, expect, it } from "vitest";
import { registeredCountryPacks, getCountryPack } from "@/content/countries/registry";
import type { CountryPack } from "@/lib/content/schema";
import {
  applyBallotPairPolicy,
  buildDestinationCandidates,
  haversineKm,
} from "./candidates";

const packs = registeredCountryPacks();

function pack(id: string): CountryPack {
  const found = getCountryPack(id);
  if (!found) throw new Error(`missing pack ${id}`);
  return found;
}

function codes(result: { candidates: CountryPack[] }) {
  return result.candidates.map((candidate) => candidate.countryCode);
}

describe("buildDestinationCandidates", () => {
  it("offers the current country's real land neighbours", () => {
    const result = buildDestinationCandidates({
      currentPack: pack("tashkent-v4"),
      packs,
      visitedCountryCodes: ["UZ"],
    });
    expect(result.usedFallback).toBe(false);
    expect(codes(result).sort()).toEqual(["KG", "KZ", "TJ"]);
  });

  it("never offers the country he is already in", () => {
    const result = buildDestinationCandidates({
      currentPack: pack("tbilisi-v1"),
      packs,
      visitedCountryCodes: [],
    });
    expect(codes(result)).not.toContain("GE");
  });

  it("excludes countries already visited this season", () => {
    const result = buildDestinationCandidates({
      currentPack: pack("tashkent-v4"),
      packs,
      visitedCountryCodes: ["UZ", "KZ", "KG"],
    });
    expect(codes(result)).not.toContain("KZ");
    expect(codes(result)).not.toContain("KG");
  });

  it("never offers more than three candidates", () => {
    for (const current of packs) {
      const result = buildDestinationCandidates({
        currentPack: current,
        packs,
        visitedCountryCodes: [],
      });
      expect(result.candidates.length).toBeLessThanOrEqual(3);
    }
  });

  it("offers one pack per country, never the same flag twice", () => {
    const result = buildDestinationCandidates({
      currentPack: pack("dushanbe-v1"),
      packs,
      visitedCountryCodes: ["TJ"],
    });
    expect(new Set(codes(result)).size).toBe(result.candidates.length);
  });

  it("falls back to the nearest ready packs when neighbours run out", () => {
    // Prague borders only Slovakia and Austria among the registered packs.
    const result = buildDestinationCandidates({
      currentPack: pack("prague-v1"),
      packs,
      visitedCountryCodes: ["CZ", "SK", "AT"],
    });
    expect(result.usedFallback).toBe(true);
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    // Ljubljana is the closest remaining city to Prague.
    expect(codes(result)[0]).toBe("SI");
  });

  it("never offers a pack that is not review-ready", () => {
    const notReady = packs.map((candidate) => candidate.schemaVersion === 3
      ? { ...candidate, culturalReview: { ...candidate.culturalReview, status: "pending" as const } }
      : candidate) as CountryPack[];
    const result = buildDestinationCandidates({
      currentPack: pack("tashkent-v4"),
      packs: notReady,
      visitedCountryCodes: ["UZ"],
    });
    expect(result.candidates).toHaveLength(0);
  });

  it("returns a deterministic ballot for identical inputs", () => {
    const input = {
      currentPack: pack("istanbul-v1"),
      packs,
      visitedCountryCodes: ["TR"],
    };
    expect(codes(buildDestinationCandidates(input)))
      .toEqual(codes(buildDestinationCandidates(input)));
  });
});

describe("applyBallotPairPolicy", () => {
  function stub(countryCode: string, assetVersion: string): CountryPack {
    return { ...pack("tashkent-v4"), countryCode, assetVersion } as CountryPack;
  }

  it("drops the later half of a blocked pair", () => {
    const kept = applyBallotPairPolicy([stub("AM", "a-v1"), stub("AZ", "b-v1"), stub("GE", "c-v1")]);
    expect(kept.map((row) => row.countryCode)).toEqual(["AM", "GE"]);
  });

  it("drops every blocked country outright", () => {
    const kept = applyBallotPairPolicy([stub("RU", "a-v1"), stub("IL", "b-v1"), stub("GE", "c-v1")]);
    expect(kept.map((row) => row.countryCode)).toEqual(["GE"]);
  });

  it("keeps a ballot with no blocked relationship intact", () => {
    const kept = applyBallotPairPolicy([stub("KZ", "a-v1"), stub("KG", "b-v1"), stub("TJ", "c-v1")]);
    expect(kept).toHaveLength(3);
  });
});

describe("haversineKm", () => {
  it("measures a known city pair", () => {
    // Vienna to Bratislava is roughly 55 km.
    const distance = haversineKm({ lat: 48.2082, lon: 16.3738 }, { lat: 48.1486, lon: 17.1077 });
    expect(distance).toBeGreaterThan(45);
    expect(distance).toBeLessThan(65);
  });

  it("is zero for the same point", () => {
    expect(haversineKm({ lat: 41.3, lon: 69.2 }, { lat: 41.3, lon: 69.2 })).toBeCloseTo(0, 6);
  });
});
