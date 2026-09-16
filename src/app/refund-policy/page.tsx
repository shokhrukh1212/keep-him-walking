import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Refund and Cancellation Policy — Keep Him Walking",
  description: "Refunds for Keep Him Walking: no sponsorship is currently sold, the proposed replacement refund, and voluntary Buy Me a Coffee support.",
};

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund and Cancellation Policy"
      eyebrow="PAYMENTS AND SUPPORT"
      testId="refund-policy-page"
      summary="No sponsorship is currently sold through Keep Him Walking, so no sponsorship payment is taken here and there is nothing to refund. Watching and voting are free."
    >
      <section>
        <span className="legal-section-number">01</span>
        <h2>Sponsorship payments</h2>
        <p>Checkout is unavailable while a proposed sponsorship awaits payment-provider approval. No bid, request, payment or reservation is accepted through the site, so nothing is charged or refundable. Any sponsorship agreed before this policy was updated keeps the refund terms accepted at that time.</p>
      </section>

      <section>
        <span className="legal-section-number">02</span>
        <h2>The proposed replacement refund</h2>
        <p>Under the proposed future rule, a sponsor displaced by a replacement sponsor would receive a full refund. Full refund steps, timing and method would be published before any sponsorship payment is accepted.</p>
      </section>

      <section>
        <span className="legal-section-number">03</span>
        <h2>Buy Me a Coffee</h2>
        <p>Coffee contributions are voluntary support, processed by Buy Me a Coffee under its own terms and policies. They do not buy sponsorship, a placement, a vote or any service. If you made a contribution by mistake, contact Buy Me a Coffee or use <Link href="/contact">Contact &amp; support</Link>.</p>
      </section>

      <section>
        <span className="legal-section-number">04</span>
        <h2>Your rights</h2>
        <p>Nothing here limits a non-waivable consumer or payment right. Questions can be sent through <Link href="/contact">Contact &amp; support</Link>.</p>
      </section>
    </LegalPage>
  );
}
