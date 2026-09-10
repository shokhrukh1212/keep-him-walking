import { describe, expect, it } from "vitest";
import { correctionBodySchema, correctionModerationSchema } from "./api";

describe("correction validation", () => {
  it("accepts only the private queue contract", () => {
    expect(correctionBodySchema.parse({ packId: "tashkent-v4", zoneId: null, category: "place", body: " Check this name. " }).body)
      .toBe("Check this name.");
    expect(() => correctionBodySchema.parse({ packId: "tashkent-v4", category: "other", body: "x".repeat(281) })).toThrow();
    expect(() => correctionBodySchema.parse({ packId: "tashkent-v4", category: "other", body: "ok", email: "visitor@example.com" })).toThrow(/Unrecognized key/);
  });

  it("keeps moderation to two explicit decisions", () => {
    expect(correctionModerationSchema.parse({ status: "accepted" })).toEqual({ status: "accepted" });
    expect(() => correctionModerationSchema.parse({ status: "new" })).toThrow();
  });
});
