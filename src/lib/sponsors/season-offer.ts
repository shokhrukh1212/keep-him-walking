import { SEASON_SPONSOR_PRICE_CENTS } from "@/lib/config/sponsorship";

/** The offer, word for word. Nothing here promises traffic, posts, leads or sales. */
export const SEASON_OFFER_COPY = {
  lead: "Sponsor the next journey.",
  headline: "One sponsor. Seven days. $499.",
  body: "Your product appears beside the journey throughout the season, in Journey, and in the season recap. Includes your logo, name and website link. One-time payment; no renewal. Audience size and results are not guaranteed.",
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
 * The one season on offer: the earliest configured future season that nobody has
 * paid for and that still leaves the full review window. A season that already
 * started is never sold as seven days, and no calendar of future weeks is built.
 */
export function earliestEligibleSeason(
  seasons: readonly OfferSeason[],
  paidJourneyIds: ReadonlySet<string>,
  nowMs: number,
  cutoffHours: number,
): OfferSeason | null {
  return [...seasons]
    .filter((season) => ["draft", "preview", "active"].includes(season.status))
    .filter((season) => Date.parse(saleClosesAt(season.startsAt, cutoffHours)) > nowMs)
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

/** Tax is whatever the approved processor is configured to do; the price never claims more. */
export function seasonTaxNote(priceIncludesTax: boolean): string {
  return priceIncludesTax
    ? `${formatUsdCents()} includes any tax the payment processor collects.`
    : `${formatUsdCents()} is before tax. Any sales tax or VAT is calculated by the payment processor from your billing details and shown at checkout before you pay.`;
}
