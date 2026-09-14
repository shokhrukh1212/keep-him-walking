/** The public season offer, narrowed to the two facts the sponsor line depends on. */
type OfferAnswer = { season?: { number?: unknown } | null; currentSponsor?: unknown };

const OFFER_TIMEOUT_MS = 8_000;

/**
 * Whether this season is genuinely open to a sponsorship request right now, read from the
 * same public offer the Sponsor modal shows. A failure, a timeout, a different season or an
 * existing sponsor all mean no.
 */
export async function seasonSponsorshipOpen(
  seasonNumber: number,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OFFER_TIMEOUT_MS);
  try {
    const response = await fetcher("/api/season-sponsor/offer", { signal: controller.signal });
    if (!response.ok) return false;
    const offer = await response.json() as OfferAnswer;
    return offer.season?.number === seasonNumber && !offer.currentSponsor;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
