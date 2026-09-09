import { describe, expect, it } from "vitest";
import { UNKNOWN_COUNTRY_CODE, countryFromHeader } from "./header";

describe("countryFromHeader", () => {
  it("keeps a well-formed edge code", () => {
    expect(countryFromHeader("GE")).toBe("GE");
  });

  it("normalizes case and surrounding whitespace", () => {
    expect(countryFromHeader(" ge ")).toBe("GE");
    expect(countryFromHeader("uz")).toBe("UZ");
  });

  it("falls back to the unknown country when the header is absent", () => {
    expect(countryFromHeader(null)).toBe(UNKNOWN_COUNTRY_CODE);
    expect(countryFromHeader(undefined)).toBe(UNKNOWN_COUNTRY_CODE);
  });

  it("refuses anything that is not two letters", () => {
    for (const value of ["", "G", "GEO", "G1", "12", "🇬🇪", "  "]) {
      expect(countryFromHeader(value)).toBe(UNKNOWN_COUNTRY_CODE);
    }
  });
});
