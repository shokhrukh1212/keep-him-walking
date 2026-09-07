import { describe, expect, it } from "vitest";
import { RATE_LIMITS, rateLimitedResponse } from "./rate-limit";

describe("launch rate limits", () => {
  it("keeps high-frequency presence above normal heartbeat cadence", () => {
    expect(RATE_LIMITS.presence.limit).toBeGreaterThanOrEqual(30);
    expect(RATE_LIMITS.vote.limit).toBeLessThan(RATE_LIMITS.presence.limit);
  });

  it("returns a machine-readable response and retry guidance", async () => {
    const response = rateLimitedResponse(17);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "RATE_LIMITED" } });
  });
});
