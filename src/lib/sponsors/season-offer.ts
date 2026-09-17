import { SEASON_SPONSOR_PRICE_CENTS } from "@/lib/config/sponsorship";

/** The offer, word for word. Nothing here promises traffic, posts, leads or sales. */
export const SEASON_OFFER_COPY = {
  lead: "Feature your product on the journey.",
  headline: "One featured sponsor. $50 to begin.",
  body: "One featured sponsor appears beside the journey. A replacement pays twice the current sponsor's price and the displaced sponsor receives a full refund. Material is reviewed before payment. One-time payment; no renewal. Audience size and results are not guaranteed.",
} as const;

export type OfferSeason = {
  id: string;
  number: number;
  title: string;
  status: string;
  startsAt: string;
  endsAt: string;
  cities: string[];
};

const HOUR_MS = 3_600_000;

/** Booking (and material for review) closes this long before the season starts. */
export function saleClosesAt(startsAt: string, cutoffHours: number): string {
  return new Date(Date.parse(startsAt) - cutoffHours * HOUR_MS).toISOString();
}

/**
 * The one journey on offer: a featured placement remains available until the journey
 * ends, including while an incumbent is live. The caller supplies an empty paid set for
 * the replacement offer; retaining the parameter keeps the retired fixed-season caller
 * compatible while its records are serviced.
 */
export function earliestEligibleSeason(
  seasons: readonly OfferSeason[],
  paidJourneyIds: ReadonlySet<string>,
  nowMs: number,
  cutoffHours: number,
): OfferSeason | null {
  // Kept in the signature for the retired fixed-season caller; replacements use the journey end.
  void cutoffHours;
  return [...seasons]
    .filter((season) => ["draft", "preview", "active"].includes(season.status))
    .filter((season) => Date.parse(season.endsAt) > nowMs)
    .filter((season) => !paidJourneyIds.has(season.id))
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt))[0] ?? null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "Wed 23 Sep 2026, 16:00 UTC": exact, with the time zone, never the visitor's clock.
 * Built by hand so every server and browser prints the same words.
 */
export function formatSeasonInstant(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, `
    + `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

export function formatUsdCents(cents: number = SEASON_SPONSOR_PRICE_CENTS): string {
  return `USD ${(cents / 100).toFixed(2)}`;
}

export function seasonOfferHeadline(cents: number = SEASON_SPONSOR_PRICE_CENTS): string {
  return `One featured sponsor. $${(cents / 100).toFixed(0)}.`;
}

/** Tax is whatever the approved processor is configured to do; the price never claims more. */
export function seasonTaxNote(priceIncludesTax: boolean, cents: number = SEASON_SPONSOR_PRICE_CENTS): string {
  return priceIncludesTax
    ? `${formatUsdCents(cents)} includes any tax the payment processor collects.`
    : `${formatUsdCents(cents)} is before tax. Any sales tax or VAT is calculated by the payment processor from your billing details and shown at checkout before you pay.`;
}
