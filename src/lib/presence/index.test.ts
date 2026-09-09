import { describe, expect, it } from "vitest";
import { formatPaceRate, isLeaseActive, nextHeartbeatDelay } from ".";

describe("presence timing", () => {
  it("uses an exclusive TTL boundary", () => {
    expect(isLeaseActive(0, 49_999, 50)).toBe(true);
    expect(isLeaseActive(0, 50_000, 50)).toBe(false);
  });

  it("jitters heartbeats between 17 and 23 seconds", () => {
    expect(nextHeartbeatDelay(() => 0)).toBe(17_000);
    expect(nextHeartbeatDelay(() => 0.5)).toBe(20_000);
    expect(nextHeartbeatDelay(() => 1)).toBe(23_000);
  });

  it("formats whole pace values without a decimal and other values to one place", () => {
    expect(formatPaceRate(1)).toBe("1");
    expect(formatPaceRate(2.584_962_5)).toBe("2.6");
    expect(formatPaceRate(4)).toBe("4");
    expect(formatPaceRate(Number.NaN)).toBe("1");
  });
});
