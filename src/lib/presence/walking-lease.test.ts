import { describe, expect, it } from "vitest";
import { confirmedWalkingLease, presenceReadIsCurrent, walkingLeaseIsActive } from "./walking-lease";

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

describe("a presence read replacing the walking lease", () => {
  const heartbeat = Date.parse("2026-09-10T17:34:29.858Z");

  it("ignores a read taken before the newest heartbeat", () => {
    // A slow or cached bootstrap that counted nobody, arriving after the heartbeat that
    // counted this visitor, must not stop him until the next beat.
    expect(presenceReadIsCurrent("2026-09-10T17:34:25.709Z", heartbeat)).toBe(false);
    expect(presenceReadIsCurrent("not a time", heartbeat)).toBe(false);
  });

  it("accepts a read at least as new as the newest heartbeat", () => {
    expect(presenceReadIsCurrent("2026-09-10T17:34:29.858Z", heartbeat)).toBe(true);
    expect(presenceReadIsCurrent("2026-09-10T17:35:56.661Z", heartbeat)).toBe(true);
  });

  it("accepts any read before the first heartbeat", () => {
    expect(presenceReadIsCurrent("2026-09-10T17:34:25.709Z", Number.NEGATIVE_INFINITY)).toBe(true);
  });
});
