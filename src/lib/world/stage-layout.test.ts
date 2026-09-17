import { describe, expect, it } from "vitest";
import { stageSchema, readableCountryPackSchema } from "../content/schema";
import { registeredCountryPacks } from "@/content/countries/registry";
import {
  blendStageLayout,
  boundedPanoramaLayout,
  frameFitsViewport,
  stageLayout,
  stageScaleWarning,
} from "./stage-layout";
import {
  characterHeightTargetsFromEnv,
  DEFAULT_CHARACTER_HEIGHT_TARGETS,
  targetCharacterHeightPx,
} from "./stage-targets";

const defaults = stageSchema.parse({});
const targets = DEFAULT_CHARACTER_HEIGHT_TARGETS;
const viewports = [[320, 568], [390, 844], [1440, 900], [2560, 1080]] as const;

describe("stage layout", () => {
  it("pans a landmark painting once without wrapping or exposing an edge", () => {
    expect(boundedPanoramaLayout(1_800, 1_440, 0)).toEqual({ offset: 0, x: -0 });
    expect(boundedPanoramaLayout(1_800, 1_440, 0.5)).toEqual({ offset: 180, x: -180 });
    expect(boundedPanoramaLayout(1_800, 1_440, 1)).toEqual({ offset: 360, x: -360 });
    expect(boundedPanoramaLayout(1_800, 1_440, 99)).toEqual({ offset: 360, x: -360 });
    expect(boundedPanoramaLayout(1_200, 1_440, 0.5)).toEqual({ offset: 0, x: 120 });
    expect(boundedPanoramaLayout(1_800, 1_440, 0, true)).toEqual({ offset: 180, x: -180 });
  });

  it.each(viewports)("anchors %i × %i and scales the image to the viewport-sized actor", (w, h) => {
    for (const [iw, ih] of [[3600, 1200], [1600, 900], [1600, 1067]]) {
      const result = stageLayout(w, h, iw, ih, defaults, targets);
      const targetPx = h * (w <= 600 ? 0.28 : 0.30);
      expect(result.personHeightPx).toBe(targetPx);
      expect(result.requiredImageScale).toBeCloseTo(targetPx / (defaults.personHeightFrac * ih));
      expect(result.imageScale).toBeCloseTo(Math.max(
        w / iw,
        h / ih,
        Math.min(1.6, result.requiredImageScale),
      ));
      expect(iw * result.imageScale).toBeGreaterThanOrEqual(w);
      expect(ih * result.imageScale).toBeGreaterThanOrEqual(h);
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
      / viewports[index][1])).toEqual([0.28, 0.28, 0.30, 0.30]);
    expect(new Set(layouts.map((layout) => layout.requiredImageScale.toFixed(6))).size).toBe(4);
  });

  it("keeps the mobile boundary exact and fills the former empty sky strip", () => {
    const mobile = stageLayout(390, 844, 3600, 1200, defaults, targets);
    expect(mobile.imageY).toBeLessThanOrEqual(0);
    expect(stageLayout(600, 900, 1600, 900, defaults, targets).groundY).toBe(720);
    expect(stageLayout(601, 900, 1600, 900, defaults, targets).groundY).toBe(774);
  });

  it("reserves the measured footer and keeps the actor above it with a 16px gap", () => {
    const desktop = stageLayout(1440, 900, 1600, 900, defaults, targets, 190);
    expect(desktop.groundY).toBe(694);
    expect(900 - desktop.groundY).toBe(206);
    expect(desktop.personHeightPx).toBe(270);

    const mobile = stageLayout(390, 844, 1600, 900, defaults, targets, 220);
    expect(mobile.groundY).toBe(608);
    expect(844 - mobile.groundY).toBe(236);
    expect(mobile.personHeightPx).toBeCloseTo(844 * .28);
  });

  it("shrinks only when a short screen cannot fit the full target above the measured footer", () => {
    const short = stageLayout(800, 360, 1600, 900, defaults, targets, 260);
    expect(short.groundY).toBe(84);
    expect(short.personHeightPx).toBe(68);
    expect(short.groundY - short.personHeightPx).toBe(16);
  });

  it("keeps the character's scale when a pavement layer fills the band a tall footer opens", () => {
    // Gare du Nord (default stage, 3600 × 1200) at 1333 × 811 under a 209 px footer.
    const paved = stageLayout(1333, 811, 3600, 1200, defaults, targets, 209, true);
    expect(paved.groundY).toBe(586);
    expect(paved.imageScale).toBeCloseTo(paved.requiredImageScale);
    expect(paved.imageScale).toBeCloseTo(stageLayout(1333, 811, 3600, 1200, defaults, targets).imageScale);
    expect(paved.imageY).toBeLessThanOrEqual(0);
    // Without its own pavement the painting must still reach the bottom edge, so it grows.
    const painted = stageLayout(1333, 811, 3600, 1200, defaults, targets, 209);
    expect(painted.imageY + 1200 * painted.imageScale).toBeGreaterThanOrEqual(811 - 1e-9);
    expect(painted.imageScale).toBeGreaterThan(paved.imageScale * 1.4);
  });

  it.each(viewports)("never enlarges a paved painting for any footer height at %i × %i", (w, h) => {
    const noFooter = stageLayout(w, h, 3600, 1200, defaults, targets);
    for (let inset = 0; inset <= 400; inset += 25) {
      const layout = stageLayout(w, h, 3600, 1200, defaults, targets, inset, true);
      expect(layout.imageScale).toBeLessThanOrEqual(noFooter.imageScale * 1.05);
      expect(3600 * layout.imageScale).toBeGreaterThanOrEqual(w);
      expect(layout.imageY).toBeLessThanOrEqual(1e-9);
    }
  });

  it("clamps unusably distant artwork and produces the required warning", () => {
    const stage = stageSchema.parse({personHeightFrac: 0.05});
    const layout = stageLayout(1440, 900, 1600, 900, stage, targets);
    expect(layout.requiredImageScale).toBe(6);
    expect(layout.imageScale).toBe(1.6);
    expect(layout.imageScaleClamped).toBe(true);
    expect(layout.personHeightPx).toBe(270);
    expect(stageScaleWarning("sample-v1", "square", layout)).toBe(
      "pack sample-v1/square: master composed too far away (needs imageScale 6.000); regenerate at eye level",
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

  it("accepts a world frame that Pixi snapped to whole device pixels", () => {
    // 1333 × 811 and 1334 × 811 CSS pixels at 125 %, 150 % and the 25 % minimum zoom.
    for (const resolution of [1.25, 1.5, 0.25]) {
      const snap = (value: number) => Math.round(value * resolution) / resolution;
      for (const width of [1333, 1334]) {
        expect(frameFitsViewport({viewportW: snap(width), viewportH: snap(811)}, width, 811)).toBe(true);
      }
    }
    expect(frameFitsViewport({viewportW: 1333.3333, viewportH: 811.3333}, 1333, 811)).toBe(true);
  });

  it("still waits for a world frame that describes a different viewport", () => {
    // The host shrank without a window resize; the world has not redrawn yet.
    expect(frameFitsViewport({viewportW: 1280, viewportH: 720}, 1280, 640)).toBe(false);
    expect(frameFitsViewport({viewportW: 1600, viewportH: 900}, 1280, 800)).toBe(false);
    expect(frameFitsViewport({viewportW: 1283, viewportH: 800}, 1280, 800)).toBe(false);
    expect(frameFitsViewport({viewportW: NaN, viewportH: 811}, 1333, 811)).toBe(false);
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
    expect(characterHeightTargetsFromEnv({})).toEqual({desktop: 0.30, mobile: 0.28});
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

  it("validates every registered pack with and without stage blocks", () => {
    const packs = registeredCountryPacks();
    // V4 remains registered as the calibrated rollback for launch identity v5; the last
    // four are the Season 1 fallback cities (Brussels, Amsterdam, Cologne, Budapest).
    expect(packs).toHaveLength(22);
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
