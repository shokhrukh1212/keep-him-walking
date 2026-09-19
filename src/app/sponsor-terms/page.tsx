import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Sponsor Terms — Keep Him Walking", description: "Terms for the ten regular and one featured fixed-price journey placements." };

export default function SponsorTermsPage() {
  return <LegalPage title="Sponsor Terms" eyebrow="JOURNEY PLACEMENTS" testId="sponsor-terms-page"
    summary="These terms govern ten USD 50 regular placements and one separate USD 100 featured placement for the Paris journey.">
    <section><span className="legal-section-number">01</span><h2>What is sold</h2>
      <p>Each purchase is one fixed place for one journey: ten regular places cost USD 50 each and the single featured place costs USD 100. Charges are one-time, with no subscription, renewal, auction, outbid, price doubling or displacement. Featured does not include a regular place.</p>
      <p>A paid placement appears while the traveler waits and throughout the 14 calendar days beginning at actual launch. A purchase after launch covers only the remaining time. The host controls launch; the waiting period has no fixed maximum and sponsor count never launches the journey automatically.</p></section>
    <section><span className="legal-section-number">02</span><h2>Checkout and activation</h2>
      <p>Dodo Payments collects billing/contact details and calculates any applicable tax at checkout. Keep Him Walking activates nothing from a browser success page: a place is published only after server-verified payment matches its order, journey, slot, tier, currency and configured product/price. Flagged material remains private and pending review.</p></section>
    <section><span className="legal-section-number">03</span><h2>What appears</h2>
      <p>The sponsor supplies one HTTPS product URL, one PNG/JPEG/WebP logo, a product name up to 32 characters and a plain-text description up to 160 characters. The public profile shows those items, a website link and “Views”. Views are accepted profile opens, can include repeat opens, and are not unique people, logo impressions or sales.</p></section>
    <section><span className="legal-section-number">04</span><h2>Rights, review and removal</h2>
      <p>The sponsor confirms it owns or has permission to use every submitted item and is responsible for its claims and destination. Material is subject to the <Link href="/content-moderation">Content and Listing Moderation Policy</Link>. Valid material publishes promptly after confirmed payment; automated flags or later reports can cause review, removal and a full refund.</p></section>
    <section><span className="legal-section-number">05</span><h2>No promised result</h2>
      <p>No visitor volume, uptime, profile Views, logo impressions, leads, conversions or sales are guaranteed. Publication is not endorsement by Keep Him Walking or Dodo Payments. Refund rules are in the <Link href="/refund-policy">Refund and Cancellation Policy</Link>.</p></section>
    <section><span className="legal-section-number">06</span><h2>Earlier agreements and contact</h2>
      <p>Any earlier paid sponsorship keeps its original promise and is not automatically moved, downgraded or charged again. Questions, reports and refund requests can be sent through <Link href="/contact">Contact &amp; support</Link>.</p></section>
  </LegalPage>;
}
