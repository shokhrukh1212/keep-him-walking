/**
 * The public price formula from docs/plan/05-SPONSORS-AND-PRICING.md section 3.
 * Mirrors `public.sponsor_price_cents` / `public.sponsor_tier_price_cents` so the
 * page can explain a price without a round trip. The database remains the authority:
 * nothing here ever re-prices a purchase, whose snapshot is immutable.
 */
export type SponsorTier = "standard" | "premium";

export const SPONSOR_TIERS: SponsorTier[] = ["standard", "premium"];

export function isSponsorTier(value: unknown): value is SponsorTier {
  return value === "standard" || value === "premium";
}

/** P(day) = clamp(yesterday_unique_watchers × cents_per_unique, floor, cap). */
export function clampSponsorPrice(
  basisUniques: number,
  floorCents: number,
  centsPerUnique: number,
  capCents: number,
): number {
  const basis = Number.isFinite(basisUniques) ? Math.max(0, Math.floor(basisUniques)) : 0;
  const perUnique = Number.isFinite(centsPerUnique) ? Math.max(0, centsPerUnique) : 0;
  return Math.max(floorCents, Math.min(capCents, Math.round(basis * perUnique)));
}

/** Premium is a whole-dollar multiple so a published price never shows odd cents. */
export function tierPriceCents(priceCents: number, tier: SponsorTier, premiumMultiplier: number): number {
  if (tier !== "premium") return priceCents;
  return Math.max(100, Math.round(priceCents * premiumMultiplier / 100) * 100);
}

export function formatPriceUsd(priceCents: number): string {
  return priceCents % 100 === 0
    ? `$${priceCents / 100}`
    : `$${(priceCents / 100).toFixed(2)}`;
}

/**
 * The sentence that does the marketing: the number that set the price, next to it.
 * A founding day was priced before there was an audience, so it never claims one.
 */
export function priceBasisSentence(priceCents: number, basisUniques: number, founding: boolean): string {
  if (founding) return `${formatPriceUsd(priceCents)} · founding price`;
  if (basisUniques <= 0) return `${formatPriceUsd(priceCents)} · the floor price`;
  return `${formatPriceUsd(priceCents)} · set by ${basisUniques.toLocaleString("en-US")} watchers yesterday`;
}
