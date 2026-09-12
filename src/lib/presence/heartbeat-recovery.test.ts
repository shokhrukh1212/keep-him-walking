import { describe, expect, it } from "vitest";
import { heartbeatRecoveryDecision, type HeartbeatWatchState } from "./heartbeat-recovery";

const watching: HeartbeatWatchState = {
  live: true, sceneReady: true, visible: true, online: true, inFlightSinceMs: null, nextDueMs: 20_000,
};

describe("heartbeat recovery", () => {
  it("does nothing while the chain is healthy", () => {
    expect(heartbeatRecoveryDecision(watching, 15_000)).toBe("none");
    expect(heartbeatRecoveryDecision({ ...watching, inFlightSinceMs: 12_000 }, 15_000)).toBe("none");
  });

  it("restarts a chain that has nothing scheduled or missed its beat", () => {
    expect(heartbeatRecoveryDecision({ ...watching, nextDueMs: null }, 15_000)).toBe("send");
    expect(heartbeatRecoveryDecision(watching, 30_001)).toBe("send");
  });

  it("aborts a stalled request before retrying", () => {
    expect(heartbeatRecoveryDecision({ ...watching, inFlightSinceMs: 1_000 }, 11_001)).toBe("abort_and_send");
  });

  it("never beats for a hidden, offline, not-ready or non-live page", () => {
    for (const blocked of [{ visible: false }, { online: false }, { sceneReady: false }, { live: false }]) {
      expect(heartbeatRecoveryDecision({ ...watching, nextDueMs: null, ...blocked }, 99_000)).toBe("none");
    }
  });
});
