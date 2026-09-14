import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SeasonRequestForm } from "@/components/sponsor/SeasonRequestForm";
import { seasonHoldMinutes, sponsorshipMode } from "@/lib/config/sponsorship";
import { loadSeasonOffer } from "@/lib/sponsors/season-data";
import { SEASON_OFFER_COPY, formatSeasonInstant, formatUsdCents, seasonTaxNote } from "@/lib/sponsors/season-offer";

export const revalidate = 60;
export const metadata: Metadata = {
  title: "Sponsor a season",
  description: "One sponsor. Seven days. $499. A disclosed placement beside the journey, in Journey and in the season recap.",
};

/**
 * The public offer, reachable without signing in even while checkout is closed, so a
 * payment reviewer sees exactly what is sold, when, for how much and on what terms.
 */
export default async function SponsorsPage() {
  // Daily mode keeps its in-app panel, as before.
  if (sponsorshipMode() !== "season") redirect("/?panel=sponsor");
  const offer = await loadSeasonOffer().catch(() => null);
  const season = offer?.season ?? null;
  const checkoutEnabled = offer?.checkout === "enabled";
  return <main className="content-page sponsors-page season-sponsor-page">
    <Link className="back-link" href="/">← Return to the walk</Link>
    <span className="eyebrow">SUPPORT THE JOURNEY</span>
    <h1>Sponsor a season</h1>
    <p className="season-offer-lead">{SEASON_OFFER_COPY.lead}</p>
    <p className="season-offer-headline">{SEASON_OFFER_COPY.headline}</p>
    <p>{SEASON_OFFER_COPY.body}</p>

    <section aria-labelledby="season-on-offer">
      <h2 id="season-on-offer">The season on offer</h2>
      {offer?.currentSponsor ? <p>Season {offer.currentSponsor.seasonNumber} is supported by {offer.currentSponsor.name}.</p> : null}
      {season ? <>
        <dl className="season-offer-facts" data-testid="season-offer-facts">
          <div><dt>Season</dt><dd>Season {season.number}</dd></div>
          <div><dt>Starts</dt><dd>{formatSeasonInstant(season.startsAt)}</dd></div>
          <div><dt>Ends</dt><dd>{formatSeasonInstant(season.endsAt)}</dd></div>
          {season.cities.length ? <div><dt>Cities</dt><dd>{season.cities.join(" · ")}</dd></div> : null}
          <div><dt>Booking closes</dt><dd>{formatSeasonInstant(season.saleClosesAt)}</dd></div>
          <div><dt>Price</dt><dd>{formatUsdCents(offer?.priceCents)}, one-time payment, no renewal</dd></div>
        </dl>
        <p>{seasonTaxNote(Boolean(offer?.priceIncludesTax))}</p>
      </> : <p className="booking-off" data-testid="season-offer-none">
        No season is open for sponsorship right now. The next season’s exact dates are published here as soon as it is scheduled.
      </p>}
    </section>

    <section aria-labelledby="placement">
      <h2 id="placement">What the placement is</h2>
      <ul>
        <li>A disclosed line, “Season supported by [your logo] [your name] ↗”, beside the journey on every day of the season, opening your website in a new tab.</li>
        <li>One row in Journey with your logo, name, a short factual description and “Visit website”.</li>
        <li>An acknowledgment as that season’s sponsor in the season recap, which stays published.</li>
      </ul>
      <h2>What it is not</h2>
      <ul>
        <li>It is advertising placement on this website only. It is not a donation, paid access, travel, or a resale of your product.</li>
        <li>Nothing appears in the traveler’s conversations, on his clothes or backpack, or as a large banner.</li>
        <li>No social media posts, impressions, leads or sales are promised. Audience size and results are not guaranteed.</li>
      </ul>
    </section>

    <section aria-labelledby="how">
      <h2 id="how">How booking works</h2>
      <ol>
        <li>Send your product name, website, a short description, your logo and a contact email.</li>
        <li>We review the material by hand. Approval is a content check only.</li>
        {checkoutEnabled
          ? <li>Approved material receives a secure payment link. The season is held for you for {seasonHoldMinutes()} minutes while you pay.</li>
          : <li>Payment is not open yet: our payment provider is still reviewing this advertising offer. Until then a request takes no payment and reserves nothing.</li>}
        <li>Once the payment processor confirms payment, your placement starts automatically when the season starts and ends when it ends.</li>
      </ol>
      <p>One sponsor per season. Material and booking close 24 hours before the season starts.</p>
    </section>

    {season ? <section id="request" aria-labelledby="request-title">
      <h2 id="request-title">Request Season {season.number}</h2>
      <SeasonRequestForm seasonId={season.id} checkoutEnabled={checkoutEnabled} />
    </section> : null}

    <nav className="legal-links">
      <Link href="/refund-policy">Refund policy</Link>
      <Link href="/sponsor-terms">Sponsor terms</Link>
      <Link href="/privacy">Privacy</Link>
      <Link href="/contact">Contact</Link>
    </nav>
  </main>;
}
