import { describe, expect, it } from "vitest";
import { watcherBucket } from "./bucket";

describe("watcherBucket", () => {
  it.each([
    [0, "0 watching"],
    [9, "9 watching"],
    [10, "0–24 watching"],
    [49, "25–49 watching"],
    [100, "100–199 watching"],
    [1_234, "1,000–1,999 watching"],
  ])("buckets %i confirmed watchers without rounding up", (count, label) => {
    expect(watcherBucket(count)).toBe(label);
  });
});
