import { describe, expect, it } from "vitest";
import { formatTemperature, weatherGlyph } from "./format";

describe("weatherGlyph", () => {
  it("shows the sun by day and the moon by night when it is clear", () => {
    expect(weatherGlyph(0, true)).toBe("☀");
    expect(weatherGlyph(0, false)).toBe("☾");
  });

  it("matches the effect table for every other sky", () => {
    expect(weatherGlyph(2)).toBe("⛅");
    expect(weatherGlyph(3)).toBe("☁");
    expect(weatherGlyph(45)).toBe("🌫");
    expect(weatherGlyph(61)).toBe("🌧");
    expect(weatherGlyph(73)).toBe("❄");
    expect(weatherGlyph(95)).toBe("⛈");
  });
});

describe("formatTemperature", () => {
  it("rounds to whole degrees", () => {
    expect(formatTemperature(21.4)).toBe("21°");
    expect(formatTemperature(21.6)).toBe("22°");
    expect(formatTemperature(-3.2)).toBe("-3°");
  });

  it("never invents a temperature", () => {
    expect(formatTemperature(Number.NaN)).toBe("—°");
  });
});
