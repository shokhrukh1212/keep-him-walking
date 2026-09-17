import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";
import { SPONSOR_INQUIRY_COPY, formatLadder, replacementPriceLadder, PROPOSED_STARTING_PRICE_USD } from "@/lib/sponsors/inquiry";

export const metadata: Metadata = {
  title: "Sponsor Terms — Keep Him Walking",
  description: "The sponsor terms for Keep Him Walking: one featured sponsor at a time, $50 to begin, each replacement pays double and the sponsor it replaces is refunded in full.",
};

export default function SponsorTermsPage() {
  return (
    <LegalPage
      title="Sponsor Terms"
      eyebrow="IN EFFECT"
      testId="sponsor-terms-page"
      summary="These terms govern the one featured sponsorship sold through Keep Him Walking by Shokhrukh Karimov. Payment is taken by Dodo Payments; a placement exists only once that processor confirms the payment."
    >
      <section>
        <span className="legal-section-number">01</span>
        <h2>Current status</h2>
        <p>Checkout is open. A sponsor enters its details on <Link href="/sponsors">Sponsor a season</Link> and continues straight to the payment page; nothing is reviewed or approved beforehand. Submitting details is not an agreement, a reservation or a purchase: the placement exists only once Dodo Payments confirms the payment.</p>
      </section>

      <section>
        <span className="legal-section-number">02</span>
        <h2>What is sold</h2>
        <p>{SPONSOR_INQUIRY_COPY.headline}. The starting price is USD {PROPOSED_STARTING_PRICE_USD}. {SPONSOR_INQUIRY_COPY.oneAtATime}</p>
        <p>Each replacement sponsor pays twice the current sponsor’s price ({formatLadder(replacementPriceLadder(PROPOSED_STARTING_PRICE_USD, 4))}), and the doubling continues from there. The displaced sponsor receives a full refund and the replacement receives the remaining travel period. The exact price, dates, tax handling and refund steps are published on <Link href="/sponsors">Sponsor a season</Link> and shown at checkout before payment.</p>
      </section>

      <section>
        <span className="legal-section-number">03</span>
        <h2>No promised audience or outcome</h2>
        <p>Sponsorship is advertising space on this website. No traffic, uptime level, impressions, clicks, watch time, leads, conversions or sales are guaranteed. Any first-party view and click counts are informational, privacy-protected measurements rather than billing commitments. Watching, reactions and votes remain free, and sponsorship never influences a vote.</p>
      </section>

      <section>
        <span className="legal-section-number">04</span>
        <h2>Review</h2>
        <p>A sponsor name, logo, description and destination URL are not reviewed before payment. They are checked against the <Link href="/content-moderation">Content and Listing Moderation Policy</Link> once live and may be removed at any time, with a refund, if they break it. The sponsor must own or have permission to use every item it provides.</p>
      </section>

      <section>
        <span className="legal-section-number">05</span>
        <h2>Earlier agreements and voluntary support</h2>
        <p>Any sponsorship agreed before these terms were updated remains governed by the terms accepted at that time. Buy Me a Coffee contributions are separate, voluntary support and do not buy a sponsor slot. Dodo Payments does not endorse or approve an individual sponsor merely because its payment service may be used.</p>
      </section>

      <section>
        <span className="legal-section-number">06</span>
        <h2>Privacy, responsibility and contact</h2>
        <p>Sponsor contact details are used privately for payment, moderation and support, and are never published. See the <Link href="/privacy">Privacy Policy</Link>.</p>
        <p>A sponsor is responsible for its material, destination and legal compliance. Keep Him Walking is operated by Shokhrukh Karimov. Questions, removal requests and refund requests can be sent through <Link href="/contact">Contact &amp; support</Link>.</p>
      </section>
    </LegalPage>
  );
}
