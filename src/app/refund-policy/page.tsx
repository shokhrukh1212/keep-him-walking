import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Refund and Cancellation Policy — Keep Him Walking",
  description: "Cancellation, postponement, removal and refund terms for the Season 1 sponsorship.",
};

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund and Cancellation Policy"
      eyebrow="SEASON SPONSORSHIP"
      testId="refund-policy-page"
      summary="This policy covers the single Season 1 sponsorship: one exclusive placement for seven days at USD 499.00 before applicable tax, paid once with no renewal."
    >
      <section>
        <span className="legal-section-number">01</span>
        <h2>Before checkout is enabled</h2>
        <p>Payment does not begin until checkout is enabled. A request or approval takes no money, accepts no purchase and reserves no season. You may withdraw a request through <Link href="/contact">Contact &amp; support</Link>; there is nothing to refund.</p>
      </section>

      <section>
        <span className="legal-section-number">02</span>
        <h2>Review and rejected material</h2>
        <p>Material is manually reviewed before checkout. Rejected material may be corrected and resubmitted before the booking deadline. If a payment is ever confirmed for material or dates that cannot be accepted or delivered, that payment is refunded in full.</p>
      </section>

      <section>
        <span className="legal-section-number">03</span>
        <h2>Sponsor cancellation</h2>
        <p>After payment, ask to cancel as soon as possible. A cancellation received before the published booking cutoff receives a full refund. At or after that cutoff, or after the season starts, the placement is already committed and sponsor-requested cancellation is not refundable except where required by law. We will still remove the placement on request.</p>
      </section>

      <section>
        <span className="legal-section-number">04</span>
        <h2>Platform cancellation or postponement</h2>
        <p>If Keep Him Walking cancels the season or placement before delivery begins, the sponsor receives a full refund. If the season is postponed, the sponsor may accept the replacement dates or cancel for a full refund. A material date change is never treated as automatic acceptance.</p>
      </section>

      <section>
        <span className="legal-section-number">05</span>
        <h2>Interrupted delivery</h2>
        <p>If a material part of the approved placement is not delivered, the sponsor may choose either a proportional refund for the undelivered part of the seven-day season or the same promised placement in a mutually agreed later season. Short outages, ordinary maintenance and audience fluctuations do not by themselves create a refund.</p>
      </section>

      <section>
        <span className="legal-section-number">06</span>
        <h2>Removal for a policy breach</h2>
        <p>Material may be changed or removed if the sponsor changes it without renewed review, the content or destination becomes unsafe or unlawful, or it violates the <Link href="/content-moderation">Content and Listing Moderation Policy</Link> or a payment-provider requirement. No refund is due for a removal caused by the sponsor’s breach, except where required by law. If removal is required for a platform reason not caused by the sponsor, the undelivered part is refunded proportionally.</p>
      </section>

      <section>
        <span className="legal-section-number">07</span>
        <h2>Duplicate, late or unusable payments</h2>
        <p>A duplicate payment, wrong-amount payment, or payment confirmed after the season has been sold, booking has closed or the season has started is refunded in full. Refunds go back through the processor to the original payment method. Processing time depends on the processor and the sponsor’s financial institution.</p>
        <p>Nothing here limits a non-waivable consumer or payment right. To request a cancellation or refund, use <Link href="/contact">Contact &amp; support</Link> and include the private sponsorship reference.</p>
      </section>
    </LegalPage>
  );
}
