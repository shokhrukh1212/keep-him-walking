import { describe, expect, it } from "vitest";
import { horizontalEdgeMismatch } from "./seam-audit";

describe("horizontalEdgeMismatch", () => {
  it("accepts matching edge strips even when the centre differs", () => {
    const pixels = new Uint8Array([
      20, 20, 200, 100, 20, 20,
      40, 40, 180, 120, 40, 40,
    ]);
    expect(horizontalEdgeMismatch(pixels, 6, 2, 1, 2)).toBe(0);
  });

  it("reports a fully visible edge discontinuity", () => {
    const pixels = new Uint8Array([0, 0, 50, 100, 255, 255]);
    expect(horizontalEdgeMismatch(pixels, 6, 1, 1, 2)).toBe(1);
  });

  it("rejects incomplete buffers", () => {
    expect(() => horizontalEdgeMismatch(new Uint8Array(3), 8, 1, 1))
      .toThrow("Invalid image buffer");
  });
});
