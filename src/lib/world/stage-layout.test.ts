import { describe, expect, it } from "vitest";
import { stageSchema, readableCountryPackSchema } from "../content/schema";
import { registeredCountryPacks } from "@/content/countries/registry";
import { stageLayout, blendStageLayout } from "./stage-layout";

const defaults = stageSchema.parse({});

describe("stage layout", () => {
  it.each([[320, 568], [390, 844], [1440, 900], [2560, 1080]])("anchors %i × %i without vertical centering", (w, h) => {
    for (const [iw, ih] of [[3600, 1200], [1600, 900], [1600, 1067]]) {
      const result = stageLayout(w, h, iw, ih, defaults);
      expect(result.imageScale * iw).toBeCloseTo(w);
      expect(result.imageX).toBe(0);
      expect(result.imageY + defaults.groundLineY * ih * result.imageScale).toBeCloseTo(result.groundY);
      expect(result.groundY).toBeCloseTo(h * (w <= 600 ? 0.8 : 0.86));
      expect(result.personHeightPx).toBeCloseTo(defaults.personHeightFrac * ih * result.imageScale);
      expect(result.pxPerMetre * 1.78).toBeCloseTo(result.personHeightPx);
    }
  });
  it("leaves sky space above a short panorama, including at the mobile boundary", () => {
    expect(stageLayout(390, 844, 3600, 1200, defaults).imageY).toBeGreaterThan(500);
    expect(stageLayout(600, 900, 1600, 900, defaults).groundY).toBe(720);
    expect(stageLayout(601, 900, 1600, 900, defaults).groundY).toBe(774);
  });
  it("rejects unmeasured or invalid dimensions", () => {
    for (const value of [0, -1, NaN, Infinity]) {
      expect(() => stageLayout(value, 900, 1600, 900, defaults)).toThrow(RangeError);
      expect(() => stageLayout(1440, 900, 1600, value, defaults)).toThrow(RangeError);
    }
  });
  it("blends from the displayed layout for exactly 400 ms with consistent ground and scale", () => {
    const from = stageLayout(390, 844, 1600, 900, defaults);
    const to = stageLayout(1440, 900, 1600, 1067, stageSchema.parse({personHeightFrac: 0.2}));
    expect(blendStageLayout(from, to, -10).personHeightPx).toBe(from.personHeightPx);
    expect(blendStageLayout(from, to, 200).personHeightPx).toBeCloseTo((from.personHeightPx + to.personHeightPx) / 2);
    for (const ms of [0, 100, 200, 399, 400, 500]) {
      const frame = blendStageLayout(from, to, ms);
      expect(frame.imageY - to.imageY).toBeCloseTo(frame.groundY - to.groundY);
      expect(frame.pxPerMetre * 1.78).toBeCloseTo(frame.personHeightPx);
    }
    expect(blendStageLayout(from, to, 400)).toEqual(to);
    expect(blendStageLayout(from, to, 800)).toEqual(to);
    // A second transition starts from the current interpolated height, not an old target.
    const mid = blendStageLayout(from, to, 150);
    expect(blendStageLayout(mid, from, 0).personHeightPx).toBe(mid.personHeightPx);
  });
});

describe("backward compatible stage metadata", () => {
  it("applies every specified default, including partial nested blocks", () => {
    expect(defaults).toEqual({ groundLineY: 0.82, horizonY: 0.55, personHeightFrac: 0.28,
      walkableX: [0.15, 0.85], palette: ["#b9a27a", "#6f7a5a", "#2e3a4f"], lightDir: "left",
      parallax: {far: 0.35, mid: 0.7, near: 1.25} });
    expect(stageSchema.parse({parallax: {mid: 0.6}}).parallax).toEqual({far: 0.35, mid: 0.6, near: 1.25});
  });
  it("validates all 16 packs with and without stage blocks", () => {
    const packs = registeredCountryPacks();
    expect(packs).toHaveLength(16);
    for (const pack of packs) {
      expect(readableCountryPackSchema.safeParse(pack).success).toBe(true);
      const legacy = JSON.parse(JSON.stringify(pack));
      for (const zone of legacy.route.zones) delete zone.stage;
      const parsed = readableCountryPackSchema.parse(legacy);
      if (parsed.schemaVersion === 1) throw new Error("Expected a route pack");
      expect(parsed.route.zones.every((zone) => JSON.stringify(zone.stage) === JSON.stringify(defaults))).toBe(true);
    }
  });
  it.each([{groundLineY: 1.1}, {personHeightFrac: 0}, {walkableX: [0.9, 0.1]},
    {palette: ["red", "blue", "black"]}, {parallax: {near: -1}}, {lightDir: "bottom"}])("rejects malformed calibration %j", (value) => {
    expect(stageSchema.safeParse(value).success).toBe(false);
  });
});
