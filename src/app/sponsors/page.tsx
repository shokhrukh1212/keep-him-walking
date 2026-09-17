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
/** The published doubling ladder. The price actually charged is always the server's. */
const PRICE_LADDER = [1, 2, 4, 8, 16].map((step) => SEASON_SPONSOR_PRICE_CENTS * step);
export const metadata: Metadata = {
  title: "Sponsor a season",
  description: "Feature your product on Keep Him Walking — The Anniversary Journey. One featured sponsor at a time: $50 to begin, and each replacement pays twice the current price while the sponsor it replaces is refunded in full.",
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
          <span className={styles.eyebrow}>HOW THE PRICE MOVES</span>
          <h2 id="season-pricing">One featured placement. Each replacement pays double.</h2>
          <p>
            There is one featured sponsor at a time. The first pays {formatUsdCents(SEASON_SPONSOR_PRICE_CENTS)}.
            Anyone who wants that place next pays twice what the sponsor holding it paid, and the sponsor they
            replace is refunded in full. Nobody is ever outbid without getting their money back.
          </p>
        </div>
        <ol data-testid="season-price-ladder">
          {PRICE_LADDER.map((cents, index) => (
            <li key={cents} aria-current={cents === (offer?.priceCents ?? SEASON_SPONSOR_PRICE_CENTS) ? "true" : undefined}>
              <span>{index === 0 ? "First sponsor" : `Replacement ${index}`}</span>
              <strong>{formatUsdCents(cents)}</strong>
              <small>
                {cents === (offer?.priceCents ?? SEASON_SPONSOR_PRICE_CENTS)
                  ? "The price right now"
                  : index === 0 ? "Starting price, before applicable tax" : "Twice the price before it"}
              </small>
            </li>
          ))}
          <li>
            <span>And so on</span>
            <strong>×2</strong>
            <small>The doubling continues for as long as the journey runs</small>
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
              <li>Fill in the form: your product name, website, a short description, your logo and a contact email.</li>
              {checkoutEnabled ? <>
                <li>You go straight to secure checkout — there is no waiting for approval. The place is held for you for {seasonHoldMinutes()} minutes while you pay.</li>
                <li>The payment page shows the exact amount, plus any tax it calculates from your billing details, before you pay. Card details are handled by the payment processor; they never reach this website.</li>
                <li>Once the processor confirms the payment, your placement starts immediately and runs for the rest of the journey. Nothing appears on the site before that confirmation.</li>
                <li>If someone later replaces you at twice your price, they take the remaining period and you are refunded in full, automatically.</li>
              </> : <>
                <li>Payment is not open yet: our payment provider is still reviewing this advertising offer. Until then a request takes no payment and reserves nothing.</li>
                <li>Once the payment processor confirms payment, your placement starts for the remaining journey period. A replacement receives that period and the displaced sponsor receives a full refund.</li>
              </>}
            </ol>
            <p className={styles.detailNote}>
              We do not vet your material before you pay. We do keep the right to remove a placement and refund it if
              it breaks the <Link href="/content-moderation">Content &amp; Listing Moderation Policy</Link> — for
              example adult content, hate, weapons, drugs, scams or impersonation. Read it before you pay.
            </p>
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

      <LegalFooter lead="One featured sponsor at a time." />
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
