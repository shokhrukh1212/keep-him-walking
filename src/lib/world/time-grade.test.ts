import { describe, expect, it } from "vitest";
import {
  combineGrade,
  gradeForHour,
  localHourFraction,
  nightMix,
  normalizeHour,
} from "./time-grade";

describe("localHourFraction", () => {
  it("reads the city clock, not the viewer's", () => {
    const instant = new Date("2026-09-24T09:52:00Z");
    expect(localHourFraction(instant, "Asia/Tashkent")).toBeCloseTo(14.8667, 3);
    expect(localHourFraction(instant, "Europe/Prague")).toBeCloseTo(11.8667, 3);
    expect(localHourFraction(instant, "UTC")).toBeCloseTo(9.8667, 3);
  });

  it("falls back to UTC rather than blanking the world", () => {
    const instant = new Date("2026-09-24T09:00:00Z");
    expect(localHourFraction(instant, "Not/AZone")).toBeCloseTo(9, 3);
  });

  it("never returns a value outside the day", () => {
    for (const zone of ["Pacific/Kiritimati", "Pacific/Niue", "UTC"]) {
      const hour = localHourFraction(new Date("2026-09-24T23:30:00Z"), zone);
      expect(hour).toBeGreaterThanOrEqual(0);
      expect(hour).toBeLessThan(24);
    }
  });
});

describe("gradeForHour", () => {
  it("holds the day master through the working day", () => {
    for (const hour of [7, 10, 13, 16]) {
      const grade = gradeForHour(hour);
      expect(grade.exposure).toBeCloseTo(1, 5);
      expect(grade.tint).toEqual({ r: 1, g: 1, b: 1 });
    }
  });

  it("warms toward evening and cools at night", () => {
    const golden = gradeForHour(18);
    expect(golden.tint.r).toBeGreaterThan(golden.tint.b);

    const night = gradeForHour(23);
    expect(night.tint.b).toBeGreaterThan(night.tint.r);
    expect(night.exposure).toBeLessThan(gradeForHour(12).exposure);
  });

  it("interpolates between keyframes rather than stepping", () => {
    const seventeenThirty = gradeForHour(17.5);
    expect(seventeenThirty.tint.r).toBeGreaterThan(1);
    expect(seventeenThirty.tint.r).toBeLessThan(gradeForHour(19).tint.r);
  });

  it("is continuous across every hour, including the midnight wrap", () => {
    let previous = gradeForHour(0);
    for (let hour = 0.05; hour <= 24; hour += 0.05) {
      const grade = gradeForHour(hour % 24);
      expect(Math.abs(grade.exposure - previous.exposure)).toBeLessThan(0.05);
      expect(Math.abs(grade.tint.r - previous.tint.r)).toBeLessThan(0.05);
      previous = grade;
    }
    // Hour 24 and hour 0 are the same instant and must grade identically.
    expect(gradeForHour(24)).toEqual(gradeForHour(0));
  });

  it("wraps any out-of-range hour", () => {
    expect(gradeForHour(-1)).toEqual(gradeForHour(23));
    expect(gradeForHour(25)).toEqual(gradeForHour(1));
    expect(normalizeHour(Number.NaN)).toBe(12);
  });
});

describe("nightMix", () => {
  it("is fully day through the middle of the day", () => {
    for (const hour of [8, 12, 17, 18.9]) expect(nightMix(hour)).toBe(0);
  });

  it("is fully night after dusk and before dawn", () => {
    for (const hour of [21, 23, 0, 3, 4.9]) expect(nightMix(hour)).toBe(1);
  });

  it("ramps across dusk and dawn", () => {
    expect(nightMix(20)).toBeCloseTo(0.5, 5);
    expect(nightMix(6)).toBeCloseTo(0.5, 5);
    expect(nightMix(19)).toBe(0);
    expect(nightMix(7)).toBe(0);
  });

  it("never leaves the zero-to-one range", () => {
    for (let hour = 0; hour < 24; hour += 0.1) {
      const mix = nightMix(hour);
      expect(mix).toBeGreaterThanOrEqual(0);
      expect(mix).toBeLessThanOrEqual(1);
    }
  });
});

describe("combineGrade", () => {
  it("dims the hour's exposure by the weather", () => {
    const combined = combineGrade(gradeForHour(12), 0.9);
    expect(combined.exposure).toBeCloseTo(0.9, 5);
    expect(combined.tint).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("never inverts or blanks the scene", () => {
    expect(combineGrade(gradeForHour(12), 0).exposure).toBeCloseTo(0.1, 5);
    expect(combineGrade(gradeForHour(12), Number.NaN).exposure).toBeCloseTo(1, 5);
  });
});
