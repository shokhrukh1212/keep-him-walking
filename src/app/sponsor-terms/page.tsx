import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";
import { SPONSOR_INQUIRY_COPY, formatLadder, replacementPriceLadder, PROPOSED_STARTING_PRICE_USD } from "@/lib/sponsors/inquiry";

export const metadata: Metadata = {
  title: "Sponsor Terms — Keep Him Walking",
  description: "The proposed sponsorship for Keep Him Walking: not yet available, pending payment-provider approval, inquiries by message on X.",
};

export default function SponsorTermsPage() {
  return (
    <LegalPage
      title="Sponsor Terms"
      eyebrow="PROPOSED · NOT YET AVAILABLE"
      testId="sponsor-terms-page"
      summary="Sponsorship is not currently sold through Keep Him Walking. These terms describe the proposed sponsorship offered by Shokhrukh Karimov, which is awaiting payment-provider approval."
    >
      <section>
        <span className="legal-section-number">01</span>
        <h2>Current status</h2>
        <p>Checkout is unavailable while the payment provider reviews the proposal. No bid, request, payment or reservation is accepted through the site. Sponsorship can be discussed by message on X through <Link href="/contact">Contact &amp; support</Link>. A conversation is not an agreement, a reservation or a purchase.</p>
      </section>

      <section>
        <span className="legal-section-number">02</span>
        <h2>The proposal</h2>
        <p>{SPONSOR_INQUIRY_COPY.headline}. The proposed starting price is USD {PROPOSED_STARTING_PRICE_USD}. {SPONSOR_INQUIRY_COPY.oneAtATime}</p>
        <p>Under the proposed future rule, each replacement sponsor would pay twice the current sponsor’s price ({formatLadder(replacementPriceLadder(PROPOSED_STARTING_PRICE_USD, 4))}). The displaced sponsor would receive a full refund, and the replacement would receive the remaining travel period. The placement, dates, tax handling and refund steps would be published in full before any payment is accepted, and the proposal may change before then.</p>
      </section>

      <section>
        <span className="legal-section-number">03</span>
        <h2>No promised audience or outcome</h2>
        <p>Any sponsorship would be advertising space on this website. No traffic, uptime level, impressions, clicks, watch time, leads, conversions or sales are guaranteed. Any first-party view and click counts are informational, privacy-protected measurements rather than billing commitments. Watching, reactions and votes remain free, and sponsorship never influences a vote.</p>
      </section>

      <section>
        <span className="legal-section-number">04</span>
        <h2>Review</h2>
        <p>Any sponsor name, logo, description and destination URL would be manually reviewed under the <Link href="/content-moderation">Content and Listing Moderation Policy</Link> before publication. The sponsor must own or have permission to use every item it provides.</p>
      </section>

      <section>
        <span className="legal-section-number">05</span>
        <h2>Earlier agreements and voluntary support</h2>
        <p>Any sponsorship agreed before these terms were updated remains governed by the terms accepted at that time. Buy Me a Coffee contributions are separate, voluntary support and do not buy a sponsor slot. Dodo Payments does not endorse or approve an individual sponsor merely because its payment service may be used.</p>
      </section>

      <section>
        <span className="legal-section-number">06</span>
        <h2>Privacy, responsibility and contact</h2>
        <p>Sponsorship inquiries on X are handled under X’s own terms and privacy policy. Any sponsor contact details later shared would be used privately for review, payment and support. See the <Link href="/privacy">Privacy Policy</Link>.</p>
        <p>A sponsor would be responsible for its material, destination and legal compliance. Keep Him Walking is operated by Shokhrukh Karimov. A governing-law jurisdiction and forum have not yet been configured; checkout remains disabled and those details require owner confirmation before payment begins. Questions can be sent through <Link href="/contact">Contact &amp; support</Link>.</p>
      </section>
    </LegalPage>
  );
}
