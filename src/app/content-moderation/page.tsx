import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Content and Listing Moderation Policy — Keep Him Walking",
  description: "Manual review and prohibited-content rules for sponsor names, logos, descriptions and destination URLs.",
};

export default function ContentModerationPage() {
  return (
    <LegalPage
      title="Content and Listing Moderation Policy"
      eyebrow="SPONSOR MATERIAL"
      testId="content-moderation-page"
      summary="This policy covers every sponsor-submitted name, logo, description and destination URL shown by Keep Him Walking."
    >
      <section>
        <span className="legal-section-number">01</span>
        <h2>No open publishing</h2>
        <p>Visitors cannot independently publish public posts or listings. Sponsor material is never automatically published. The corrections queue is private and does not publish visitor text.</p>
      </section>

      <section>
        <span className="legal-section-number">02</span>
        <h2>Manual review before payment or publication</h2>
        <p>Every sponsor submission is manually reviewed before approval and before it can proceed to payment or publication. Submission is only an application: it is not acceptance, a reservation or a purchase. Approval of material is not an endorsement of the sponsor, and Dodo Payments does not endorse or approve an individual sponsor merely because its payment service may be used.</p>
      </section>

      <section>
        <span className="legal-section-number">03</span>
        <h2>Rights and accuracy</h2>
        <p>Applicants must own or have permission to use the submitted name, logo, description and destination URL. Material must accurately identify the sponsor and destination, make only supportable claims, and match the product or organisation represented. Evidence of authority, rights or claims may be requested.</p>
      </section>

      <section>
        <span className="legal-section-number">04</span>
        <h2>Prohibited material</h2>
        <p>Illegal, fraudulent, deceptive, infringing, hateful, sexually explicit, malicious, impersonating or otherwise unsafe content is prohibited. This includes misleading or unverifiable claims; malware, phishing, credential theft, privacy violations or harmful destination links; piracy or unauthorised resale; fake engagement, spam, scraping or access-bypass tools; weapons or violence-oriented material; and products or services restricted by law, card networks or the applicable payment provider.</p>
        <p>Prohibited products also include illegal or age-restricted drugs, alcohol, tobacco, vapes and prescription medicine; unlicensed financial, legal, medical or other regulated advice or services; surveillance or stalking tools; donations, fundraising, ticketing, travel booking, multi-vendor resale, stored-value, lending, gambling, adult or intimacy services, and physical goods where the payment provider does not support them. This list is not exhaustive.</p>
      </section>

      <section>
        <span className="legal-section-number">05</span>
        <h2>Ongoing review and material changes</h2>
        <p>An approved submission may still be rejected, changed with the sponsor’s agreement, suspended or removed if it violates this policy, law, card-network rules or applicable payment-provider requirements, or if the destination later becomes unsafe or materially different. Approval does not prevent later enforcement.</p>
        <p>Any material change to the name, logo, description, destination URL, redirect chain, promoted product or claims requires renewed review before it appears. A sponsor must not switch an approved destination to unreviewed content.</p>
      </section>

      <section>
        <span className="legal-section-number">06</span>
        <h2>Reports, corrections and appeals</h2>
        <p>To report a sponsor listing or harmful destination, request a correction, or appeal a moderation decision, use the real configured method on the <Link href="/contact">Contact &amp; support page</Link>. Identify the sponsor or destination and explain the concern; do not send passwords, payment-card details or other sensitive information.</p>
        <p>Reports are reviewed manually. A listing may be hidden while it is checked. The applicant is told the decision when contact details are available and may submit one focused appeal with evidence or corrected material. Refund consequences follow the <Link href="/refund-policy">Refund and Cancellation Policy</Link>.</p>
      </section>
    </LegalPage>
  );
}
