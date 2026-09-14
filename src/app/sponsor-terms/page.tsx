import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";
import { seasonPriceIncludesTax, seasonSaleCutoffHours } from "@/lib/config/sponsorship";

export const metadata: Metadata = {
  title: "Sponsor Terms — Keep Him Walking",
  description: "The exact Season 1 sponsorship offer, review, delivery and payment terms.",
};

export default function SponsorTermsPage() {
  return (
    <LegalPage
      title="Sponsor Terms"
      eyebrow="ONE SPONSOR · SEVEN DAYS"
      testId="sponsor-terms-page"
      summary="These terms govern the exclusive Season 1 sponsor placement offered by Shokhrukh Karimov through Keep Him Walking."
    >
      <section>
        <span className="legal-section-number">01</span>
        <h2>The offer</h2>
        <p>Season 1 has one exclusive sponsor for one seven-day season. The one-time price is USD 499.00 before applicable tax, with no subscription or renewal. {seasonPriceIncludesTax() ? "The configured checkout price includes any tax collected by the payment processor." : "Any applicable sales tax or VAT is calculated from billing details and shown before payment."}</p>
        <p>The exact start, end, cities and booking cutoff are shown on the <Link href="/sponsors">Sponsor a Season page</Link> when Season 1 is scheduled. The placement runs from the stored season start until its end seven days later.</p>
      </section>

      <section>
        <span className="legal-section-number">02</span>
        <h2>The promised placements</h2>
        <ul>
          <li>A disclosed “Season supported by” line with the approved logo, name and website link beside the journey on each of the seven season days.</li>
          <li>One row in Journey with the approved logo, name, short factual description and “Visit website” link.</li>
          <li>An acknowledgment as Season 1 sponsor in the season recap that remains published.</li>
        </ul>
        <p>Those are the complete promised placements. The offer does not include a backpack, clothing, bottle or café placement, a banner, conversations, social media posts, exclusivity outside Season 1, or creative services.</p>
      </section>

      <section>
        <span className="legal-section-number">03</span>
        <h2>No promised audience or outcome</h2>
        <p>The sponsorship is advertising space on this website. No traffic, uptime level, impressions, clicks, watch time, leads, conversions or sales are guaranteed. Any first-party view and click counts are informational, privacy-protected measurements rather than billing commitments. Watching, reactions and votes remain free.</p>
      </section>

      <section>
        <span className="legal-section-number">04</span>
        <h2>Submission and manual review</h2>
        <p>A request is an application only. It is not acceptance, a reservation or a purchase. The sponsor must own or have permission to use every submitted name, logo, description and destination URL. Every submission is manually reviewed under the <Link href="/content-moderation">Content and Listing Moderation Policy</Link> before approval, payment or publication. Material changes require renewed review.</p>
        <p>Material and booking close {seasonSaleCutoffHours()} hours before the season starts. Approval is only a content decision; it does not reserve the season.</p>
      </section>

      <section>
        <span className="legal-section-number">05</span>
        <h2>Payment and exclusivity</h2>
        <p>Payment does not begin until checkout is enabled after payment-provider approval. Until then, requests take no payment and reserve nothing. Once enabled, only an approved request can proceed to checkout. The season is sold only after the payment processor confirms the correct one-time payment. A return page or submitted payment attempt is not confirmation.</p>
        <p>The database permits one paid sponsor. Late, duplicate, wrong-amount or otherwise unusable payments follow the <Link href="/refund-policy">Refund and Cancellation Policy</Link>.</p>
      </section>

      <section>
        <span className="legal-section-number">06</span>
        <h2>Delivery, changes and removal</h2>
        <p>Keep Him Walking may make layout or technical changes that do not materially reduce the three promised placements. Sponsor material may be rejected, edited with the sponsor’s agreement, or removed if it becomes unlawful, unsafe, misleading, infringing or incompatible with the moderation policy or applicable payment-provider requirements. Dodo Payments does not endorse or approve an individual sponsor merely because its payment service may be used.</p>
        <p>Cancellation, postponement, interrupted delivery, removal and refunds are governed by the <Link href="/refund-policy">Refund and Cancellation Policy</Link>.</p>
      </section>

      <section>
        <span className="legal-section-number">07</span>
        <h2>Privacy, responsibility and contact</h2>
        <p>Sponsor contact details are used privately for review, payment and support. Approved listing material is public. See the <Link href="/privacy">Privacy Policy</Link>.</p>
        <p>The sponsor is responsible for its material, destination and legal compliance and will cooperate with correction, takedown, refund or payment-provider inquiries. Keep Him Walking is operated by Shokhrukh Karimov. A governing-law jurisdiction and forum have not yet been configured; checkout remains disabled and those details require owner confirmation before payment begins. Questions can be sent through <Link href="/contact">Contact &amp; support</Link>.</p>
      </section>
    </LegalPage>
  );
}
