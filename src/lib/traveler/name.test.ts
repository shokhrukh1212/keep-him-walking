import { describe, expect, it } from "vitest";
import { UNNAMED_TRAVELER, travelerDisplayName, travelerSubject } from "./name";

describe("travelerDisplayName", () => {
  it("uses the voted name once it exists", () => {
    expect(travelerDisplayName("Milo")).toBe("Milo");
    expect(travelerDisplayName("  Nur  ")).toBe("Nur");
  });

  it("never invents a name before the vote closes", () => {
    for (const value of [null, undefined, "", "   "]) {
      expect(travelerDisplayName(value)).toBe(UNNAMED_TRAVELER);
    }
  });
});

describe("travelerSubject", () => {
  it("capitalizes only the placeholder", () => {
    expect(travelerSubject(null)).toBe("The traveler");
    expect(travelerSubject("Bek")).toBe("Bek");
  });
});
