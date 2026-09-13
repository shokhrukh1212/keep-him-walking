import { describe, expect, it } from "vitest";
import { publicLaunchEnabled } from "./public-state";

describe("publicLaunchEnabled", () => {
  it("fails closed unless launch is explicitly enabled", () => {
    expect(publicLaunchEnabled({})).toBe(false);
    expect(publicLaunchEnabled({ LAUNCH_ENABLED: "false" })).toBe(false);
    expect(publicLaunchEnabled({ LAUNCH_ENABLED: "true" })).toBe(true);
  });
});
