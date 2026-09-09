import { describe, expect, it } from "vitest";
import {
  REACTION_KINDS,
  REACTION_MOTION_KIND,
  reactionThreshold,
} from "./threshold";

describe("reactionThreshold", () => {
  it("matches greatest(2, ceil(0.3 × watchers)) across the table", () => {
    const table: Array<[number, number]> = [
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 2],
      [6, 2],
      [7, 3],
      [10, 3],
      [11, 4],
      [20, 6],
      [100, 30],
      [1_000, 300],
    ];
    for (const [watchers, expected] of table) {
      expect(reactionThreshold(watchers)).toBe(expected);
    }
  });

  it("never asks for fewer than two people", () => {
    for (const watchers of [-5, 0, 1, Number.NaN]) {
      expect(reactionThreshold(watchers)).toBe(2);
    }
  });

  it("rises monotonically with the crowd", () => {
    let previous = 0;
    for (let watchers = 0; watchers <= 200; watchers += 1) {
      const threshold = reactionThreshold(watchers);
      expect(threshold).toBeGreaterThanOrEqual(previous);
      previous = threshold;
    }
  });
});

describe("reaction kinds", () => {
  it("maps every enum kind onto a motion the traveler can perform", () => {
    expect(REACTION_KINDS).toEqual(["wave", "water", "photo"]);
    expect(REACTION_MOTION_KIND).toEqual({ wave: "wave", water: "drink", photo: "photo" });
  });
});
