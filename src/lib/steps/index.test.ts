import { describe, expect, it } from "vitest";
import { reconcileWalkingTime, stepsFromActiveSeconds } from ".";

describe("global walking time", () => {
  it("advances once while any lease remains active", () => {
    expect(
      reconcileWalkingTime(
        {
          lastAccountedAtMs: 0,
          globalActiveSeconds: 10,
          latestActiveLeaseExpiresAtMs: 50_000,
        },
        20_000,
      ).globalActiveSeconds,
    ).toBe(30);
  });

  it("caps abandoned walking at the final lease expiry", () => {
    const result = reconcileWalkingTime(
      {
        lastAccountedAtMs: 10_000,
        globalActiveSeconds: 0,
        latestActiveLeaseExpiresAtMs: 50_000,
      },
      200_000,
    );
    expect(result.globalActiveSeconds).toBe(40);
    expect(result.lastAccountedAtMs).toBe(200_000);
  });

  it("does not multiply steps by viewer count", () => {
    expect(stepsFromActiveSeconds(20, 1.8)).toBe(36);
  });
});
