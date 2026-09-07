import { describe, expect, it } from "vitest";
import { EXPERIMENTS, NON_EXPERIMENTAL_COPY, variantFor } from "./index";

describe("copy experiments", () => {
  it("assigns stable allowlisted variants", () => {
    const first = variantFor("shareCta", "opaque-seed");
    expect(variantFor("shareCta", "opaque-seed")).toBe(first);
    expect(EXPERIMENTS.shareCta.variants).toContain(first);
  });

  it("protects product-truth and safety copy", () => {
    expect(NON_EXPERIMENTAL_COPY).toContain("walking-rule");
    expect(NON_EXPERIMENTAL_COPY).toContain("sponsor-disclosure");
  });
});
