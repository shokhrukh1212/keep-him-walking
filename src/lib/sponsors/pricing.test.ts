import { describe, expect, it } from "vitest";
import {
  clampSponsorPrice,
  formatPriceUsd,
  isSponsorTier,
  priceBasisSentence,
  tierPriceCents,
} from "./pricing";

const FLOOR = 4_900;
const CAP = 299_900;
const PER_UNIQUE = 1;

describe("sponsor price formula", () => {
  it.each([
    [0, 4_900],
    [4_900, 4_900],
    [12_000, 12_000],
    [40_000, 40_000],
    [150_000, 150_000],
    [500_000, 299_900],
  ])("prices %i unique watchers at %i cents", (uniques, expected) => {
    expect(clampSponsorPrice(uniques, FLOOR, PER_UNIQUE, CAP)).toBe(expected);
  });

  it("never prices below the floor, so a slot is never worthless", () => {
    expect(clampSponsorPrice(10, FLOOR, PER_UNIQUE, CAP)).toBe(FLOOR);
  });

  it("treats a missing or negative audience as no audience", () => {
    expect(clampSponsorPrice(Number.NaN, FLOOR, PER_UNIQUE, CAP)).toBe(FLOOR);
    expect(clampSponsorPrice(-500, FLOOR, PER_UNIQUE, CAP)).toBe(FLOOR);
  });
});

describe("tier pricing", () => {
  it("preserves the exact cent result", () => {
    expect(tierPriceCents(4_900, "premium", 1.5)).toBe(7_350);
    expect(tierPriceCents(2_900, "premium", 1.5)).toBe(4_350);
    expect(tierPriceCents(12_000, "premium", 1.5)).toBe(18_000);
  });

  it("leaves standard untouched", () => {
    expect(tierPriceCents(4_900, "standard", 1.5)).toBe(4_900);
  });

  it("matches the published Standard $49 / Premium $73.50 pair", () => {
    expect(formatPriceUsd(tierPriceCents(4_900, "standard", 1.5))).toBe("$49");
    expect(formatPriceUsd(tierPriceCents(4_900, "premium", 1.5))).toBe("$73.50");
  });
});

describe("price provenance copy", () => {
  it("names the audience that set the price", () => {
    expect(priceBasisSentence(40_000, 40_120, false)).toBe("$400 · set by 40,120 watchers yesterday");
  });

  it("does not invent an audience for a founding or floor-priced day", () => {
    expect(priceBasisSentence(2_900, 0, true)).toBe("$29 · founding price");
    expect(priceBasisSentence(4_900, 0, false)).toBe("$49 · the floor price");
  });
});

describe("tier guard", () => {
  it("accepts only the two published tiers", () => {
    expect(isSponsorTier("standard")).toBe(true);
    expect(isSponsorTier("premium")).toBe(true);
    expect(isSponsorTier("gold")).toBe(false);
  });
});
