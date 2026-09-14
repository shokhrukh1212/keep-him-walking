import { fixturePaymentsAllowed, type DeploymentEnvironment } from "@/lib/config/phase2-policy";

/**
 * The single sponsorship switch. `season` (the default) sells one sponsor for a
 * whole seven-day season. `daily` restores the earlier per-day inventory, pricing
 * and checkout, which stay in the code and the database for that purpose and for
 * servicing any transaction made under it.
 */
export type SponsorshipMode = "season" | "daily";

export function sponsorshipMode(environment: DeploymentEnvironment = process.env): SponsorshipMode {
  return environment.SPONSORSHIP_MODE === "daily" ? "daily" : "season";
}

/** The legacy day and Ticket purchase endpoints accept requests only in daily mode. */
export function legacyPurchasesOpen(environment: DeploymentEnvironment = process.env): boolean {
  return sponsorshipMode(environment) === "daily";
}

/** One fixed launch price, in USD minor units. Never read from a request. */
export const SEASON_SPONSOR_PRICE_CENTS = 49_900;
export const SEASON_SPONSOR_CURRENCY = "USD";

function wholeNumber(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

/** Material must be in (and booking closes) this many hours before a season starts. */
export function seasonSaleCutoffHours(environment: DeploymentEnvironment = process.env): number {
  return wholeNumber(environment.SEASON_SPONSOR_CUTOFF_HOURS, 24, 24, 720);
}

/** How long an approved sponsor's checkout holds the season. */
export function seasonHoldMinutes(environment: DeploymentEnvironment = process.env): number {
  return wholeNumber(environment.SPONSOR_RESERVATION_MINUTES, 30, 10, 120);
}

/**
 * How long past its hold an unanswered checkout keeps the season before another
 * sponsor may take it. It absorbs webhook retries; ambiguous payments are also
 * checked with the provider before a hold is released.
 */
export function seasonHoldGraceMinutes(environment: DeploymentEnvironment = process.env): number {
  return wholeNumber(environment.SEASON_SPONSOR_HOLD_GRACE_MINUTES, 30, 5, 1_440);
}

/** Whether the processor's product price already includes tax. Off unless configured. */
export function seasonPriceIncludesTax(environment: DeploymentEnvironment = process.env): boolean {
  return environment.SEASON_SPONSOR_PRICE_INCLUDES_TAX === "true";
}

export type SeasonPaymentProvider = "dodo" | "fixture";

export type SeasonCheckoutState =
  | { enabled: true; provider: SeasonPaymentProvider; testMode: boolean }
  | {
    enabled: false;
    reason: "legacy_mode" | "booking_disabled" | "provider_unapproved" | "provider_unconfigured" | "test_mode_in_production";
  };

/**
 * Real checkout needs every switch: season mode, booking enabled, an explicit
 * statement that the provider approved this offer, and a configured provider. Until
 * then the offer takes a no-payment request instead. Test credentials never serve
 * Production.
 */
export function seasonCheckoutState(environment: DeploymentEnvironment = process.env): SeasonCheckoutState {
  if (sponsorshipMode(environment) !== "season") return { enabled: false, reason: "legacy_mode" };
  if (environment.SPONSOR_BOOKING_ENABLED !== "true") return { enabled: false, reason: "booking_disabled" };
  if (environment.SPONSOR_PROVIDER_APPROVED !== "true") return { enabled: false, reason: "provider_unapproved" };
  const provider = environment.SPONSOR_PAYMENT_PROVIDER;
  if (provider === "fixture") {
    return fixturePaymentsAllowed(environment)
      ? { enabled: true, provider: "fixture", testMode: true }
      : { enabled: false, reason: "provider_unconfigured" };
  }
  if (provider === "dodo") {
    const configured = [
      environment.DODO_PAYMENTS_API_KEY,
      environment.DODO_PAYMENTS_WEBHOOK_SECRET,
      environment.DODO_SEASON_PRODUCT_ID,
    ].every(Boolean);
    if (!configured) return { enabled: false, reason: "provider_unconfigured" };
    const testMode = environment.DODO_PAYMENTS_ENVIRONMENT !== "live_mode";
    if (testMode && environment.VERCEL_ENV === "production") {
      return { enabled: false, reason: "test_mode_in_production" };
    }
    return { enabled: true, provider: "dodo", testMode };
  }
  return { enabled: false, reason: "provider_unconfigured" };
}
