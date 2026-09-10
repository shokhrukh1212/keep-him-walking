import { describe, expect, it } from "vitest";
import { launchCountdown } from "./launch";

describe("launch countdown", () => {
  it("rounds up so the launch is never announced early", () => {
    expect(launchCountdown(61_001, 0)).toBe("in 1m 2s");
    expect(launchCountdown(90_000_000, 0)).toBe("in 1d 1h");
  });

  it("handles reached and invalid instants without inventing a date", () => {
    expect(launchCountdown(1_000, 1_000)).toBe("now");
    expect(launchCountdown(Number.NaN, 0)).toBe("soon");
  });
});
