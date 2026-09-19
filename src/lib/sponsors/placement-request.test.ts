import { describe, expect, it } from "vitest";
import { normalizeSponsorUrl, placementRequestSchema } from "./placement-request";

describe("placement request", () => {
  it("normalizes schemeless websites and strips fragments", () => {
    expect(normalizeSponsorUrl("example.com/product#offer")).toBe("https://example.com/product");
  });

  it("rejects active, credentialed and malformed destinations", () => {
    for (const value of ["javascript:alert(1)", "http://example.com", "https://user:pass@example.com", "localhost"]) {
      expect(() => normalizeSponsorUrl(value)).toThrow();
    }
  });

  it("counts Unicode names consistently with Postgres char_length", () => {
    const base = { slotId: crypto.randomUUID(), productUrl: "example.com", description: "A product", rightsConfirmed: "true" };
    expect(placementRequestSchema.safeParse({ ...base, productName: "😀".repeat(32) }).success).toBe(true);
    expect(placementRequestSchema.safeParse({ ...base, productName: "😀".repeat(33) }).success).toBe(false);
  });
});
