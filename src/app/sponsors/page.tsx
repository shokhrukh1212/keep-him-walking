import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SeasonRequestForm } from "@/components/sponsor/SeasonRequestForm";
import { LegalFooter } from "@/components/legal/LegalFooter";
import { SponsorInquiry } from "@/components/sponsor/SponsorInquiry";
import { SEASON_SPONSOR_PRICE_CENTS, seasonHoldMinutes, seasonSponsorXUrl, sponsorshipMode } from "@/lib/config/sponsorship";
import { SPONSOR_INQUIRY_COPY } from "@/lib/sponsors/inquiry";
import { loadSeasonOffer } from "@/lib/sponsors/season-data";
import { SEASON_OFFER_COPY, formatSeasonInstant, formatUsdCents, seasonOfferHeadline, seasonTaxNote } from "@/lib/sponsors/season-offer";
import styles from "../public-pages.module.css";

export const revalidate = 60;
export const metadata: Metadata = {
  title: "Sponsor a season",
  description: "Feature your product on Keep Him Walking — The Anniversary Journey. Proposed starting price $50, one featured sponsor at a time, pending payment-provider approval. Message me on X; no payment is taken here.",
};

/**
 * The public offer, reachable without signing in even while checkout is closed, so a
 * payment reviewer sees exactly what is sold, when, for how much and on what terms.
 */
export default async function SponsorsPage() {
  const mode = sponsorshipMode();
  if (mode === "inquiry") return <SponsorInquiryPage />;
  // Daily mode keeps its in-app panel, as before.
  if (mode !== "season") redirect("/?panel=sponsor");
  const offer = await loadSeasonOffer().catch(() => null);
  const season = offer?.season ?? null;
  const checkoutEnabled = offer?.checkout === "enabled";
  return <main className={`${styles.publicPage} ${styles.sponsorPage}`} data-testid="sponsors-page">
    <div className={styles.pageFrame}>
      <header className={styles.siteHeader}>
        <Link className={styles.backLink} href="/">← Return to the walk</Link>
        <span className={styles.wordmark}>KEEP HIM WALKING</span>
      </header>

      <section className={styles.sponsorHero} aria-labelledby="sponsor-title">
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>SUPPORT THE JOURNEY</span>
          <h1 id="sponsor-title">Sponsor a season</h1>
          <p className={styles.heroLead}>{SEASON_OFFER_COPY.lead}</p>
          <p className={styles.offerHeadline}>{seasonOfferHeadline(offer?.priceCents)}</p>
          <p className={styles.heroBody}>{SEASON_OFFER_COPY.body}</p>
        </div>

        <section className={styles.offerCard} aria-labelledby="season-on-offer">
          <div className={styles.sectionHeading}>
            <span className={styles.sectionNumber}>01</span>
            <h2 id="season-on-offer">The season on offer</h2>
          </div>
          {offer?.currentSponsor ? <p>Season {offer.currentSponsor.seasonNumber} is supported by {offer.currentSponsor.name}.</p> : null}
          {season ? <>
            <dl className={styles.offerFacts} data-testid="season-offer-facts">
              <div><dt>Season</dt><dd>Season {season.number}</dd></div>
              <div><dt>Starts</dt><dd>{formatSeasonInstant(season.startsAt)}</dd></div>
              <div><dt>Ends</dt><dd>{formatSeasonInstant(season.endsAt)}</dd></div>
              {season.cities.length ? <div><dt>Cities</dt><dd>{season.cities.join(" · ")}</dd></div> : null}
              <div><dt>Booking closes</dt><dd>{formatSeasonInstant(season.saleClosesAt)}</dd></div>
              <div><dt>Price</dt><dd>{formatUsdCents(offer?.priceCents)}, one-time payment, no renewal</dd></div>
            </dl>
            <p className={styles.taxNote}>{seasonTaxNote(Boolean(offer?.priceIncludesTax), offer?.priceCents)}</p>
          </> : <p className={styles.bookingOff} data-testid="season-offer-none">
            No season is open for sponsorship right now. The next season’s exact dates are published here as soon as it is scheduled.
          </p>}
        </section>
      </section>

      <section className={styles.priceSchedule} aria-labelledby="season-pricing">
        <div>
          <span className={styles.eyebrow}>SEASON 1 PRICE</span>
          <h2 id="season-pricing">One placement for all seven days</h2>
        </div>
        <ol>
          <li>
            <span>Season 1</span>
            <strong>{formatUsdCents(SEASON_SPONSOR_PRICE_CENTS)}</strong>
            <small>One-time price before applicable tax</small>
          </li>
        </ol>
      </section>

      <div className={styles.sponsorLayout}>
        <div className={styles.sponsorDetails}>
          <section className={styles.detailCard} aria-labelledby="placement">
            <div className={styles.sectionHeading}>
              <span className={styles.sectionNumber}>02</span>
              <h2 id="placement">What the placement is</h2>
            </div>
            <ul className={styles.featureList}>
              <li>A disclosed line, “Season supported by [your logo] [your name] ↗”, beside the journey on every day of the season, opening your website in a new tab.</li>
              <li>One row in Journey with your logo, name, a short factual description and “Visit website”.</li>
              <li>An acknowledgment as that season’s sponsor in the season recap, which stays published.</li>
            </ul>
            <h3>What it is not</h3>
            <ul className={styles.featureList}>
              <li>It is advertising placement on this website only. It is not a donation, paid access, travel, or a resale of your product.</li>
              <li>Nothing appears in the traveler’s conversations, on his clothes or backpack, or as a large banner.</li>
              <li>No social media posts, impressions, leads or sales are promised. Audience size and results are not guaranteed.</li>
            </ul>
          </section>

          <section className={styles.detailCard} aria-labelledby="how">
            <div className={styles.sectionHeading}>
              <span className={styles.sectionNumber}>03</span>
              <h2 id="how">How booking works</h2>
            </div>
            <ol className={styles.stepList}>
              <li>Send your product name, website, a short description, your logo and a contact email.</li>
              <li>We manually review the name, logo, description and destination website. Nothing is published or sent to payment before approval.</li>
              {checkoutEnabled
                ? <li>Approved material receives a secure payment link. The season is held for you for {seasonHoldMinutes()} minutes while you pay.</li>
                : <li>Payment is not open yet: our payment provider is still reviewing this advertising offer. Until then a request takes no payment and reserves nothing.</li>}
              <li>Once the payment processor confirms payment, your placement starts automatically when the season starts and ends when it ends.</li>
            </ol>
            <p className={styles.detailNote}>One sponsor per season. Material and booking close 24 hours before the season starts.</p>
          </section>
        </div>

        {season ? <aside className={styles.requestColumn}>
          <section className={styles.requestCard} id="request" aria-labelledby="request-title">
            <span className={styles.eyebrow}>SPONSOR REQUEST</span>
            <h2 id="request-title">Request Season {season.number}</h2>
            <SeasonRequestForm seasonId={season.id} checkoutEnabled={checkoutEnabled} priceCents={offer?.priceCents ?? SEASON_SPONSOR_PRICE_CENTS} />
          </section>
        </aside> : null}
      </div>

      <LegalFooter lead="One sponsor. Seven days. One journey." />
    </div>
  </main>;
}

/** Inquiry mode: the proposed offer and the X contact. No form, no offer read, no checkout. */
function SponsorInquiryPage() {
  return <main className={`${styles.publicPage} ${styles.sponsorPage}`} data-testid="sponsors-page">
    <div className={styles.pageFrame}>
      <header className={styles.siteHeader}>
        <Link className={styles.backLink} href="/">← Return to the walk</Link>
        <span className={styles.wordmark}>KEEP HIM WALKING</span>
      </header>
      <section className={styles.sponsorHero} aria-labelledby="sponsor-title">
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>SUPPORT THE JOURNEY</span>
          <h1 id="sponsor-title">Sponsor a season</h1>
          <p className={styles.heroLead}>{SPONSOR_INQUIRY_COPY.headline}</p>
          <p className={styles.heroBody}>{SPONSOR_INQUIRY_COPY.pending}</p>
        </div>
        <section className={styles.offerCard} aria-label="Proposed sponsorship">
          <SponsorInquiry xUrl={seasonSponsorXUrl()} />
        </section>
      </section>
      <LegalFooter lead="Keep Him Walking — The Anniversary Journey" />
    </div>
  </main>;
}
