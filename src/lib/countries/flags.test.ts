import { describe, expect, it } from "vitest";
import {
  UNKNOWN_COUNTRY_FLAG,
  countryDisplayName,
  flagEmoji,
  formatWatchDuration,
} from "./flags";

describe("flagEmoji", () => {
  it("renders regional indicators for a real country", () => {
    expect(flagEmoji("GE")).toBe("🇬🇪");
    expect(flagEmoji("UZ")).toBe("🇺🇿");
    expect(flagEmoji("uz")).toBe("🇺🇿");
  });

  it("renders the globe for the unknown country", () => {
    expect(flagEmoji("ZZ")).toBe(UNKNOWN_COUNTRY_FLAG);
    expect(flagEmoji("zz")).toBe(UNKNOWN_COUNTRY_FLAG);
  });

  it("never emits stray indicator letters for malformed input", () => {
    for (const value of ["", "G", "GEO", "12", null, undefined]) {
      expect(flagEmoji(value)).toBe(UNKNOWN_COUNTRY_FLAG);
    }
  });
});

describe("countryDisplayName", () => {
  it("names a real country", () => {
    expect(countryDisplayName("GE")).toBe("Georgia");
    expect(countryDisplayName("UZ")).toBe("Uzbekistan");
  });

  it("labels the unknown country without inventing a place", () => {
    expect(countryDisplayName("ZZ")).toBe("Unknown");
    expect(countryDisplayName("nonsense")).toBe("Unknown");
  });
});

describe("formatWatchDuration", () => {
  it("formats carried time as hh:mm", () => {
    expect(formatWatchDuration(0)).toBe("00:00");
    expect(formatWatchDuration(59)).toBe("00:00");
    expect(formatWatchDuration(60)).toBe("00:01");
    expect(formatWatchDuration(3_600)).toBe("01:00");
    expect(formatWatchDuration(3_661)).toBe("01:01");
    expect(formatWatchDuration(360_000)).toBe("100:00");
  });

  it("never renders a negative or non-finite duration", () => {
    expect(formatWatchDuration(-5)).toBe("00:00");
    expect(formatWatchDuration(Number.NaN)).toBe("00:00");
  });
});
