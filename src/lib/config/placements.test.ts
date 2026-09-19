import { describe, expect, it } from "vitest";
import { placementCheckoutState, placementProductId } from "./placements";

describe("placement checkout gate", () => {
  it("requires a placement-specific provider approval", () => {
    expect(placementCheckoutState({ SPONSOR_PLACEMENTS_ENABLED: "true" })).toEqual({ enabled: false, reason: "provider_unapproved" });
  });

  it("requires both fixed Dodo products", () => {
    const base = {
      SPONSOR_PLACEMENTS_ENABLED: "true", SPONSOR_PROVIDER_APPROVED_FOR_PLACEMENTS: "true",
      SPONSOR_PAYMENT_PROVIDER: "dodo", DODO_PAYMENTS_API_KEY: "key", DODO_PAYMENTS_WEBHOOK_SECRET: "secret",
    };
    expect(placementCheckoutState(base)).toEqual({ enabled: false, reason: "provider_unconfigured" });
    expect(placementCheckoutState({ ...base, DODO_REGULAR_PLACEMENT_PRODUCT_ID: "r", DODO_FEATURED_PLACEMENT_PRODUCT_ID: "f" })).toMatchObject({ enabled: true, provider: "dodo" });
  });

  it("uses one configured product per tier", () => {
    const env = { DODO_REGULAR_PLACEMENT_PRODUCT_ID: "regular", DODO_FEATURED_PLACEMENT_PRODUCT_ID: "featured" };
    expect(placementProductId("regular", env)).toBe("regular");
    expect(placementProductId("featured", env)).toBe("featured");
  });
});
