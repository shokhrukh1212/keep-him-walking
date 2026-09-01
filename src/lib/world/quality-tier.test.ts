import { describe, expect, it } from "vitest";
import { chooseQualityTier } from "./quality-tier";

describe("device quality tiers", () => {
  it("protects constrained phones and preserves desktop quality", () => {
    expect(chooseQualityTier({ width: 320, devicePixelRatio: 3, hardwareConcurrency: 4 })).toBe("low");
    expect(chooseQualityTier({ width: 900, devicePixelRatio: 2, hardwareConcurrency: 8 })).toBe("medium");
    expect(chooseQualityTier({ width: 1_440, devicePixelRatio: 1, hardwareConcurrency: 12 })).toBe("high");
    expect(chooseQualityTier({ width: 1_440, devicePixelRatio: 1, reducedMotion: true })).toBe("low");
  });
});
