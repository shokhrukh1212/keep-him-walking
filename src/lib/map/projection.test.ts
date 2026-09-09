import { describe, expect, it } from "vitest";
import { mapPointString, projectEquirectangular } from "./projection";

describe("projectEquirectangular", () => {
  it("maps the world bounds and origin into the fixed viewBox", () => {
    expect(projectEquirectangular({ lat: 90, lon: -180 })).toEqual({ x: 0, y: 0 });
    expect(projectEquirectangular({ lat: 0, lon: 0 })).toEqual({ x: 500, y: 250 });
    expect(projectEquirectangular({ lat: -90, lon: 180 })).toEqual({ x: 1_000, y: 500 });
  });

  it("clamps bad geographic bounds and formats stable SVG points", () => {
    expect(projectEquirectangular({ lat: 100, lon: -200 })).toEqual({ x: 0, y: 0 });
    expect(mapPointString({ lat: 41.3111, lon: 69.2797 })).toBe("692.44,135.25");
  });
});
