import { describe, expect, it } from "vitest";
import { weatherEffect } from "./effects";

describe("weatherEffect", () => {
  it("maps the whole WMO table from 02 §7", () => {
    const table: Array<[number, Partial<ReturnType<typeof weatherEffect>>]> = [
      [0, { precipitation: "none", fog: false, flash: false, contrastScale: 1 }],
      [1, { precipitation: "none", contrastScale: 1 }],
      [2, { precipitation: "none", contrastScale: 1 }],
      [3, { precipitation: "none", contrastScale: 0.9 }],
      [45, { fog: true, precipitation: "none" }],
      [48, { fog: true, precipitation: "none" }],
      [51, { precipitation: "rain" }],
      [61, { precipitation: "rain" }],
      [67, { precipitation: "rain" }],
      [71, { precipitation: "snow" }],
      [77, { precipitation: "snow" }],
      [80, { precipitation: "rain" }],
      [82, { precipitation: "rain" }],
      [85, { precipitation: "snow" }],
      [86, { precipitation: "snow" }],
      [95, { precipitation: "rain", flash: true }],
      [99, { precipitation: "rain", flash: true }],
    ];
    for (const [code, expected] of table) {
      expect(weatherEffect(code)).toMatchObject(expected);
    }
  });

  it("only thunderstorms flash", () => {
    for (let code = 0; code <= 94; code += 1) {
      expect(weatherEffect(code).flash).toBe(false);
    }
    for (let code = 95; code <= 99; code += 1) {
      expect(weatherEffect(code).flash).toBe(true);
    }
  });

  it("names the weather in the status pill only when it matters", () => {
    expect(weatherEffect(0).pillFragment).toBeNull();
    expect(weatherEffect(3).pillFragment).toBeNull();
    expect(weatherEffect(61).pillFragment).toBe("in the rain");
    expect(weatherEffect(73).pillFragment).toBe("in the snow");
    expect(weatherEffect(45).pillFragment).toBe("in the fog");
    expect(weatherEffect(96).pillFragment).toBe("through a thunderstorm");
  });

  it("speeds the world up only above thirty kilometres an hour", () => {
    expect(weatherEffect(0, 0).windScale).toBe(1);
    expect(weatherEffect(0, 30).windScale).toBe(1);
    expect(weatherEffect(0, 60).windScale).toBeCloseTo(1.5, 5);
    expect(weatherEffect(0, 1_000).windScale).toBe(2);
    expect(weatherEffect(0, -20).windScale).toBe(1);
  });

  it("treats an unknown or missing code as clear weather", () => {
    for (const code of [Number.NaN, -1, 200]) {
      expect(weatherEffect(code)).toMatchObject({
        precipitation: "none",
        fog: false,
        flash: false,
        contrastScale: 1,
      });
    }
  });
});
