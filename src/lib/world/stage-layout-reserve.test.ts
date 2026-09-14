import { describe, expect, it } from "vitest";
import { stageSchema } from "../content/schema";
import { RESERVED_GROUND_HEADROOM_FRAC, stageLayout } from "./stage-layout";
import { DEFAULT_CHARACTER_HEIGHT_TARGETS } from "./stage-targets";

const defaults = stageSchema.parse({});
const targets = DEFAULT_CHARACTER_HEIGHT_TARGETS;

describe("stage layout with a reserved caption band", () => {
  it("is exactly today's layout without a reserve", () => {
    for (const [w, h] of [[320, 568], [390, 844], [1440, 900]] as const) {
      const plain = stageLayout(w, h, 1600, 900, defaults, targets);
      expect(stageLayout(w, h, 1600, 900, defaults, targets, {})).toEqual(plain);
      expect(stageLayout(w, h, 1600, 900, defaults, targets, { groundReservePx: 0 })).toEqual(plain);
      for (const invalid of [-40, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(stageLayout(w, h, 1600, 900, defaults, targets, { groundReservePx: invalid })).toEqual(plain);
      }
    }
  });

  it("raises the ground on a phone so his feet stand above the band, at the same size", () => {
    const plain = stageLayout(390, 844, 3600, 1200, defaults, targets);
    const reserved = stageLayout(390, 844, 3600, 1200, defaults, targets, { groundReservePx: 230 });
    expect(reserved.groundY).toBe(844 - 230);
    expect(reserved.personHeightPx).toBe(plain.personHeightPx);
    expect(reserved.imageScale).toBe(plain.imageScale);
    // His horizontal place and the painting's never move; the painting follows his feet.
    expect(reserved.imageX).toBe(plain.imageX);
    expect(reserved.imageY + defaults.groundLineY * 1200 * reserved.imageScale).toBeCloseTo(reserved.groundY);
  });

  it("never lifts the ground when the band already fits, and never lifts his head into the header", () => {
    expect(stageLayout(390, 844, 1600, 900, defaults, targets, { groundReservePx: 100 }).groundY).toBeCloseTo(844 * 0.8);
    const short = stageLayout(320, 568, 1600, 900, defaults, targets, { groundReservePx: 520 });
    expect(short.groundY - short.personHeightPx).toBeCloseTo(568 * RESERVED_GROUND_HEADROOM_FRAC);
  });
});
