import { describe, expect, it } from "vitest";
import { DAY_PHOTO_HEIGHT, DAY_PHOTO_WIDTH, photoCropRect } from "./capture";

describe("photoCropRect", () => {
  it("keeps the 16:9 shape of the published photograph", () => {
    const crop = photoCropRect(1_920, 1_080, 960, 540);
    expect(crop.width / crop.height).toBeCloseTo(DAY_PHOTO_WIDTH / DAY_PHOTO_HEIGHT, 2);
  });

  it("centres on him when the canvas is wider than the photograph", () => {
    // 3000x600 crops to 1067x600, so there is room to pan horizontally.
    const crop = photoCropRect(3_000, 600, 1_000, 300);
    // An odd crop width cannot centre exactly; one pixel is close enough.
    expect(Math.abs(crop.x + crop.width / 2 - 1_000)).toBeLessThanOrEqual(1);
  });

  it("uses the whole width when the canvas is taller than 16:9", () => {
    const crop = photoCropRect(2_000, 1_200, 800, 600);
    expect(crop.x).toBe(0);
    expect(crop.width).toBe(2_000);
  });

  it("never runs off the canvas when he is near an edge", () => {
    for (const focusX of [-500, 0, 40, 1_960, 5_000]) {
      const crop = photoCropRect(1_920, 1_080, focusX, 540);
      expect(crop.x).toBeGreaterThanOrEqual(0);
      expect(crop.x + crop.width).toBeLessThanOrEqual(1_920);
      expect(crop.y).toBeGreaterThanOrEqual(0);
      expect(crop.y + crop.height).toBeLessThanOrEqual(1_080);
    }
  });

  it("fits inside a canvas that is taller than 16:9", () => {
    const crop = photoCropRect(800, 1_600, 400, 800);
    expect(crop.width).toBe(800);
    expect(crop.height).toBe(450);
    expect(crop.height).toBeLessThanOrEqual(1_600);
  });

  it("fits inside a canvas that is wider than 16:9", () => {
    const crop = photoCropRect(3_000, 600, 1_500, 300);
    expect(crop.height).toBe(600);
    expect(crop.width).toBe(1_067);
    expect(crop.width).toBeLessThanOrEqual(3_000);
  });

  it("falls back to the middle when the focus is not a number", () => {
    const crop = photoCropRect(1_920, 1_080, Number.NaN, Number.NaN);
    expect(crop.x + crop.width / 2).toBeCloseTo(960, 0);
  });
});
