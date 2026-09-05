import { describe, expect, it } from "vitest";
import { confirmedWalkingLease, walkingLeaseIsActive } from "./walking-lease";

describe("confirmed walking lease", () => {
  it("keeps movement alive through a brief reconnect", () => {
    const lease = confirmedWalkingLease(true, 50, 1_000);
    expect(walkingLeaseIsActive(lease, 49_000)).toBe(true);
    expect(walkingLeaseIsActive(lease, 51_001)).toBe(false);
  });

  it("stops immediately after the server confirms zero watchers", () => {
    const lease = confirmedWalkingLease(false, 50, 1_000);
    expect(walkingLeaseIsActive(lease, 1_001)).toBe(false);
  });

  it("renews cleanly when a watcher returns", () => {
    const expired = confirmedWalkingLease(true, 5, 1_000);
    expect(walkingLeaseIsActive(expired, 7_000)).toBe(false);
    const renewed = confirmedWalkingLease(true, 50, 7_000);
    expect(walkingLeaseIsActive(renewed, 56_999)).toBe(true);
  });
});
