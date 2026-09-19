import { RELAUNCH_JOURNEY, type SponsorPlacementTier } from "@/lib/relaunch/config";

export type PlacementPaymentProvider = "dodo" | "fixture";

export function placementProductId(
  tier: SponsorPlacementTier,
  environment: Record<string, string | undefined> = process.env,
): string {
  return tier === "featured"
    ? environment.DODO_FEATURED_PLACEMENT_PRODUCT_ID ?? ""
    : environment.DODO_REGULAR_PLACEMENT_PRODUCT_ID ?? "";
}

export function placementProviderProductId(
  tier: SponsorPlacementTier,
  provider: PlacementPaymentProvider,
  environment: Record<string, string | undefined> = process.env,
): string {
  return provider === "fixture" ? `fixture_${tier}_placement` : placementProductId(tier, environment);
}

export function placementCheckoutState(environment: Record<string, string | undefined> = process.env) {
  if (environment.SPONSOR_PLACEMENTS_ENABLED !== "true") return { enabled: false as const, reason: "disabled" as const };
  if (environment.SPONSOR_PROVIDER_APPROVED_FOR_PLACEMENTS !== "true") {
    return { enabled: false as const, reason: "provider_unapproved" as const };
  }
  const provider: PlacementPaymentProvider = environment.SPONSOR_PAYMENT_PROVIDER === "fixture" ? "fixture" : "dodo";
  if (provider === "fixture") {
    const allowed = environment.NODE_ENV !== "production" && Boolean(environment.SPONSOR_FIXTURE_SECRET);
    return allowed
      ? { enabled: true as const, provider, testMode: true }
      : { enabled: false as const, reason: "provider_unconfigured" as const };
  }
  const configured = Boolean(
    environment.DODO_PAYMENTS_API_KEY
    && environment.DODO_PAYMENTS_WEBHOOK_SECRET
    && placementProductId("regular", environment)
    && placementProductId("featured", environment),
  );
  if (!configured) return { enabled: false as const, reason: "provider_unconfigured" as const };
  const testMode = environment.DODO_PAYMENTS_ENVIRONMENT !== "live_mode";
  if (testMode && environment.VERCEL_ENV === "production") {
    return { enabled: false as const, reason: "test_mode_in_production" as const };
  }
  return { enabled: true as const, provider, testMode };
}

export const PLACEMENT_PROVISIONAL_HOLD_MINUTES = 10;
export const PLACEMENT_CHECKOUT_LIFETIME_MINUTES = RELAUNCH_JOURNEY.checkoutLifetimeMinutes;
