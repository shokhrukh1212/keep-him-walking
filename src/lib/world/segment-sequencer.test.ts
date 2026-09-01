import { describe, expect, it } from "vitest";
import { composedSegmentSignature } from "./segment-sequencer";

describe("segment sequencer", () => {
  it("does not repeat a three-layer composition inside twelve segments", () => {
    const signatures = Array.from({ length: 24 }, (_, index) =>
      composedSegmentSignature("chorsu-market", index, [3, 3, 3]),
    );
    for (let index = 0; index < signatures.length; index += 1) {
      expect(signatures.slice(Math.max(0, index - 11), index)).not.toContain(signatures[index]);
    }
  });

  it("advances the first variable layer when a panorama has one segment", () => {
    const signatures = Array.from({ length: 3 }, (_, index) =>
      composedSegmentSignature("arrival-boulevard", index, [1, 3]),
    );
    expect(new Set(signatures).size).toBe(3);
  });
});
