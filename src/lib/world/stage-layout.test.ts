import { describe, expect, it } from "vitest";
import { stageSchema, readableCountryPackSchema } from "../content/schema";
import { registeredCountryPacks } from "@/content/countries/registry";
import { blendStageLayout, stageLayout, stageScaleWarning } from "./stage-layout";
import {
  characterHeightTargetsFromEnv,
  DEFAULT_CHARACTER_HEIGHT_TARGETS,
  targetCharacterHeightPx,
} from "./stage-targets";

const defaults = stageSchema.parse({});
const targets = DEFAULT_CHARACTER_HEIGHT_TARGETS;
const viewports = [[320, 568], [390, 844], [1440, 900], [2560, 1080]] as const;

describe("stage layout", () => {
  it.each(viewports)("anchors %i × %i and scales the image to the viewport-sized actor", (w, h) => {
    for (const [iw, ih] of [[3600, 1200], [1600, 900], [1600, 1067]]) {
      const result = stageLayout(w, h, iw, ih, defaults, targets);
      const targetPx = h * (w <= 600 ? 0.20 : 0.24);
      expect(result.personHeightPx).toBe(targetPx);
      expect(result.requiredImageScale).toBeCloseTo(targetPx / (defaults.personHeightFrac * ih));
      expect(result.imageScale).toBe(Math.min(1.6, result.requiredImageScale));
      expect(result.imageX).toBeCloseTo((w - iw * result.imageScale) / 2);
      expect(result.imageY + defaults.groundLineY * ih * result.imageScale).toBeCloseTo(result.groundY);
      expect(result.groundY).toBeCloseTo(h * (w <= 600 ? 0.8 : 0.86));
      expect(result.pxPerMetre * 1.78).toBeCloseTo(result.personHeightPx);
      expect(result.characterImageScale).toBeCloseTo(result.requiredImageScale / (w / iw));
    }
  });

  it("uses the exact target at every required viewport while image scale varies", () => {
    const layouts = viewports.map(([w, h]) => stageLayout(w, h, 1600, 900, defaults, targets));
    expect(layouts.map((layout, index) => layout.personHeightPx
      / viewports[index][1])).toEqual([0.20, 0.20, 0.24, 0.24]);
    expect(new Set(layouts.map((layout) => layout.requiredImageScale.toFixed(6))).size).toBe(4);
  });

  it("keeps the mobile boundary exact and can expose sky above the centered painting", () => {
    const mobile = stageLayout(390, 844, 3600, 1200, defaults, targets);
    expect(mobile.imageY).toBeGreaterThan(0);
    expect(stageLayout(600, 900, 1600, 900, defaults, targets).groundY).toBe(720);
    expect(stageLayout(601, 900, 1600, 900, defaults, targets).groundY).toBe(774);
  });

  it("clamps unusably distant artwork and produces the required warning", () => {
    const stage = stageSchema.parse({personHeightFrac: 0.05});
    const layout = stageLayout(1440, 900, 1600, 900, stage, targets);
    expect(layout.requiredImageScale).toBe(4.8);
    expect(layout.imageScale).toBe(1.6);
    expect(layout.imageScaleClamped).toBe(true);
    expect(layout.personHeightPx).toBe(216);
    expect(stageScaleWarning("sample-v1", "square", layout)).toBe(
      "pack sample-v1/square: master composed too far away (needs imageScale 4.800); regenerate at eye level",
    );
    expect(stageScaleWarning("sample-v1", "square",
      stageLayout(1440, 900, 1600, 900, defaults, targets))).toBeNull();
  });

  it("rejects unmeasured or invalid dimensions", () => {
    for (const value of [0, -1, NaN, Infinity]) {
      expect(() => stageLayout(value, 900, 1600, 900, defaults, targets)).toThrow(RangeError);
      expect(() => stageLayout(1440, 900, 1600, value, defaults, targets)).toThrow(RangeError);
    }
  });

  it("blends from the displayed layout for exactly 400 ms", () => {
    const from = stageLayout(390, 844, 1600, 900, defaults, targets);
    const to = stageLayout(1440, 900, 1600, 1067, stageSchema.parse({personHeightFrac: 0.2}), targets);
    expect(blendStageLayout(from, to, -10).personHeightPx).toBe(from.personHeightPx);
    expect(blendStageLayout(from, to, 200).personHeightPx).toBeCloseTo((from.personHeightPx + to.personHeightPx) / 2);
    for (const ms of [0, 100, 200, 399, 400, 500]) {
      const frame = blendStageLayout(from, to, ms);
      expect(frame.imageY - to.imageY).toBeCloseTo(frame.groundY - to.groundY);
      expect(frame.pxPerMetre * 1.78).toBeCloseTo(frame.personHeightPx);
    }
    expect(blendStageLayout(from, to, 400)).toEqual(to);
    expect(blendStageLayout(from, to, 800)).toEqual(to);
  });
});

describe("character height environment", () => {
  it("uses documented defaults and accepts explicit fractions", () => {
    expect(characterHeightTargetsFromEnv({})).toEqual({desktop: 0.24, mobile: 0.20});
    const custom = characterHeightTargetsFromEnv({
      TARGET_CHARACTER_HEIGHT_FRAC: "0.25",
      TARGET_CHARACTER_HEIGHT_FRAC_MOBILE: "0.21",
    });
    expect(custom).toEqual({desktop: 0.25, mobile: 0.21});
    expect(targetCharacterHeightPx(600, 900, custom)).toBe(189);
    expect(targetCharacterHeightPx(601, 900, custom)).toBe(225);
  });

  it.each(["0", "-1", "1.1", "human", "Infinity"])("rejects invalid fraction %s", (value) => {
    expect(() => characterHeightTargetsFromEnv({TARGET_CHARACTER_HEIGHT_FRAC: value})).toThrow(RangeError);
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
