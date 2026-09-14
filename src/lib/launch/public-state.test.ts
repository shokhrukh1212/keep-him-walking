import { describe, expect, it } from "vitest";
import { launchSwitchedOff, publicLaunchEnabled } from "./public-state";

describe("publicLaunchEnabled", () => {
  it("fails closed unless launch is explicitly enabled", () => {
    expect(publicLaunchEnabled({})).toBe(false);
    expect(publicLaunchEnabled({ LAUNCH_ENABLED: "false" })).toBe(false);
    expect(publicLaunchEnabled({ LAUNCH_ENABLED: "true" })).toBe(true);
  });
});

describe("launchSwitchedOff", () => {
  it("is the intentional prelaunch only in Production with either launch switch off", () => {
    expect(launchSwitchedOff({ VERCEL_ENV: "production" })).toBe(true);
    expect(launchSwitchedOff({ VERCEL_ENV: "production", PHASE2_ENABLED: "true" })).toBe(true);
    expect(launchSwitchedOff({ VERCEL_ENV: "production", LAUNCH_ENABLED: "true" })).toBe(true);
    expect(launchSwitchedOff({ VERCEL_ENV: "production", PHASE2_ENABLED: "true", LAUNCH_ENABLED: "true" })).toBe(false);
  });

  it("never treats Preview, local rehearsal or an unconfigured server as a deliberate prelaunch", () => {
    // Anywhere else a missing day is a real fault and must keep looking like one.
    expect(launchSwitchedOff({})).toBe(false);
    expect(launchSwitchedOff({ VERCEL_ENV: "preview" })).toBe(false);
    expect(launchSwitchedOff({ PHASE2_ENABLED: "true", PHASE2_REHEARSAL_MODE: "true" })).toBe(false);
  });
});
