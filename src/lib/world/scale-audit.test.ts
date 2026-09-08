import { describe, expect, it } from "vitest";
import { stageSchema } from "../content/schema";
import { DEFAULT_CHARACTER_HEIGHT_TARGETS } from "./stage-targets";
import {
  assertCharacterScaleWithinTolerance,
  auditZoneScale,
  formatScaleAudit,
  SCALE_SANITY_VIEWPORTS,
} from "./scale-audit";

describe("content scale audit", () => {
  it("audits all five requested widths and reports the unclamped reference scale", () => {
    expect(SCALE_SANITY_VIEWPORTS.map((viewport) => viewport.width)).toEqual([320, 390, 768, 1440, 2560]);
    const row = auditZoneScale("Example", "example-v1", "square", 1600, 900,
      stageSchema.parse({personHeightFrac: 0.05}), DEFAULT_CHARACTER_HEIGHT_TARGETS);
    expect(row.requiredImageScale).toBe(4.8);
    expect(row.characterPx).toBe(216);
    expect(row.needsRegeneration).toBe(true);
    expect(row.sanityErrors).toHaveLength(4);
    expect(row.sanityErrors[0]).toContain("example-v1/square at 390px");
  });

  it("hard-errors outside the 1.6× target tolerance", () => {
    expect(() => assertCharacterScaleWithinTolerance(160, 100, "upper")).not.toThrow();
    expect(() => assertCharacterScaleWithinTolerance(62.5, 100, "lower")).not.toThrow();
    expect(() => assertCharacterScaleWithinTolerance(160.01, 100, "upper")).toThrow("upper");
    expect(() => assertCharacterScaleWithinTolerance(62.49, 100, "lower")).toThrow("lower");
  });

  it("sorts the worst city and zone first and records totals", () => {
    const markdown = formatScaleAudit([
      {city: "Near", packId: "near-v1", zoneId: "b", personHeightFrac: 0.3, requiredImageScale: 0.8, characterPx: 216, needsRegeneration: false, sanityErrors: []},
      {city: "Far", packId: "far-v1", zoneId: "okay", personHeightFrac: 0.2, requiredImageScale: 1.2, characterPx: 216, needsRegeneration: false, sanityErrors: []},
      {city: "Far", packId: "far-v1", zoneId: "bad", personHeightFrac: 0.1, requiredImageScale: 2.4, characterPx: 216, needsRegeneration: true, sanityErrors: ["bad"]},
    ], "2026-09-09");
    expect(markdown).toContain("**Total:** 3 registered zones; **NEEDS REGENERATION:** 1.");
    expect(markdown.indexOf("## Far")).toBeLessThan(markdown.indexOf("## Near"));
    expect(markdown.indexOf("far-v1 / bad")).toBeLessThan(markdown.indexOf("far-v1 / okay"));
    expect(markdown).toContain("ERROR (1 viewports)");
  });
});
