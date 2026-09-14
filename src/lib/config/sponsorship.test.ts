import { describe, expect, it } from "vitest";
import {
  legacyPurchasesOpen,
  seasonCheckoutState,
  seasonHoldGraceMinutes,
  seasonHoldMinutes,
  seasonPriceIncludesTax,
  seasonSaleCutoffHours,
  sponsorshipMode,
} from "./sponsorship";

const dodo = {
  SPONSOR_BOOKING_ENABLED: "true",
  SPONSOR_PROVIDER_APPROVED: "true",
  SPONSOR_PAYMENT_PROVIDER: "dodo",
  DODO_PAYMENTS_API_KEY: "key",
  DODO_PAYMENTS_WEBHOOK_SECRET: "whsec_c2VjcmV0",
  DODO_SEASON_PRODUCT_ID: "pdt_season",
};

describe("sponsorship mode", () => {
  it("defaults to season and keeps daily recoverable with one explicit value", () => {
    expect(sponsorshipMode({})).toBe("season");
    expect(sponsorshipMode({ SPONSORSHIP_MODE: "season" })).toBe("season");
    expect(sponsorshipMode({ SPONSORSHIP_MODE: "daily" })).toBe("daily");
    expect(sponsorshipMode({ SPONSORSHIP_MODE: "DAILY" })).toBe("season");
  });

  it("closes the legacy day and Ticket purchase endpoints in season mode", () => {
    expect(legacyPurchasesOpen({})).toBe(false);
    expect(legacyPurchasesOpen({ SPONSORSHIP_MODE: "daily" })).toBe(true);
  });

  it("bounds the cutoff, hold, grace and tax settings", () => {
    expect(seasonSaleCutoffHours({})).toBe(24);
    expect(seasonSaleCutoffHours({ SEASON_SPONSOR_CUTOFF_HOURS: "2" })).toBe(24);
    expect(seasonSaleCutoffHours({ SEASON_SPONSOR_CUTOFF_HOURS: "72" })).toBe(72);
    expect(seasonHoldMinutes({})).toBe(30);
    expect(seasonHoldMinutes({ SPONSOR_RESERVATION_MINUTES: "500" })).toBe(120);
    expect(seasonHoldGraceMinutes({ SEASON_SPONSOR_HOLD_GRACE_MINUTES: "nope" })).toBe(30);
    expect(seasonPriceIncludesTax({})).toBe(false);
    expect(seasonPriceIncludesTax({ SEASON_SPONSOR_PRICE_INCLUDES_TAX: "true" })).toBe(true);
  });
});

describe("season checkout gate", () => {
  it("is a request-only offer until every switch is set", () => {
    expect(seasonCheckoutState({})).toEqual({ enabled: false, reason: "booking_disabled" });
    expect(seasonCheckoutState({ ...dodo, SPONSORSHIP_MODE: "daily" })).toEqual({ enabled: false, reason: "legacy_mode" });
    expect(seasonCheckoutState({ ...dodo, SPONSOR_PROVIDER_APPROVED: "false" })).toEqual({ enabled: false, reason: "provider_unapproved" });
    expect(seasonCheckoutState({ ...dodo, DODO_SEASON_PRODUCT_ID: "" })).toEqual({ enabled: false, reason: "provider_unconfigured" });
    expect(seasonCheckoutState({ ...dodo, SPONSOR_PAYMENT_PROVIDER: "lemonsqueezy" })).toEqual({ enabled: false, reason: "provider_unconfigured" });
  });

  it("enables Dodo in test mode by default and never serves test credentials to Production", () => {
    expect(seasonCheckoutState(dodo)).toEqual({ enabled: true, provider: "dodo", testMode: true });
    expect(seasonCheckoutState({ ...dodo, VERCEL_ENV: "production" })).toEqual({ enabled: false, reason: "test_mode_in_production" });
    expect(seasonCheckoutState({ ...dodo, VERCEL_ENV: "production", DODO_PAYMENTS_ENVIRONMENT: "live_mode" }))
      .toEqual({ enabled: true, provider: "dodo", testMode: false });
  });

  it("allows the no-money fixture only in an explicit non-production rehearsal", () => {
    const fixture = {
      SPONSOR_BOOKING_ENABLED: "true",
      SPONSOR_PROVIDER_APPROVED: "true",
      SPONSOR_PAYMENT_PROVIDER: "fixture",
      PHASE2_ENABLED: "true",
      PHASE2_REHEARSAL_MODE: "true",
      SPONSOR_FIXTURE_SECRET: "x".repeat(32),
    };
    expect(seasonCheckoutState(fixture)).toEqual({ enabled: true, provider: "fixture", testMode: true });
    expect(seasonCheckoutState({ ...fixture, VERCEL_ENV: "production" })).toEqual({ enabled: false, reason: "provider_unconfigured" });
  });
});
