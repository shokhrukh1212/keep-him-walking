import { describe, expect, it } from "vitest";
import { validCronAuthorization } from "./cron-auth";

describe("rollover authorization", () => {
  it("requires the exact bearer secret", () => {
    process.env.CRON_SECRET = "cron-test-secret";
    expect(validCronAuthorization("Bearer cron-test-secret")).toBe(true);
    expect(validCronAuthorization("cron-test-secret")).toBe(false);
    expect(validCronAuthorization("Bearer wrong")).toBe(false);
    delete process.env.CRON_SECRET;
  });
});
