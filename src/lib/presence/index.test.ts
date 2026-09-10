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

describe("adaptive heartbeat interval", () => {
  // The server decides the interval from the crowd it counted; the client only
  // spreads arrivals out so a large crowd does not knock in unison.
  it("jitters the server's interval by six seconds either side", () => {
    expect(nextHeartbeatDelay(() => 0, 30_000)).toBe(27_000);
    expect(nextHeartbeatDelay(() => 0.5, 30_000)).toBe(30_000);
    expect(nextHeartbeatDelay(() => 1, 30_000)).toBe(33_000);
  });

  it("falls back to twenty seconds when the server names no interval", () => {
    expect(nextHeartbeatDelay(() => 0.5)).toBe(20_000);
    expect(nextHeartbeatDelay(() => 0.5, 0)).toBe(20_000);
    expect(nextHeartbeatDelay(() => 0.5, Number.NaN)).toBe(20_000);
  });

  it("always asks again well before a lease that outlives two beats expires", () => {
    for (const [heartbeatSeconds, ttlSeconds] of [[20, 50], [30, 70], [40, 90]]) {
      const worst = nextHeartbeatDelay(() => 1, heartbeatSeconds * 1_000);
      expect(worst * 2).toBeLessThan(ttlSeconds * 1_000);
    }
  });
});
