import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Refund and Cancellation Policy — Keep Him Walking", description: "Refund and cancellation rules for journey sponsor placements." };

export default function RefundPolicyPage() {
  return <LegalPage title="Refund and Cancellation Policy" eyebrow="SPONSOR PAYMENTS" testId="refund-policy-page"
    summary="A paid placement is a one-time journey purchase. The waiting period has no fixed maximum, and there is no voluntary cancellation right after activation except where law requires one.">
    <section><span className="legal-section-number">01</span><h2>Before activation</h2>
      <p>Opening a form does not reserve a place. Checkout submission creates a short hold while payment is completed. Failed or cancelled checkout does not activate a placement. A verified payment that cannot be matched to the correct journey, place, tier, currency or price is recorded for reconciliation and a full refund.</p></section>
    <section><span className="legal-section-number">02</span><h2>After activation</h2>
      <p>The purchase covers the waiting period and the following 14-day journey, or the journey’s remaining period if bought after launch. There is no voluntary refund after activation merely because the launch remains unscheduled, traffic is lower than hoped, or the sponsor changes its mind.</p></section>
    <section><span className="legal-section-number">03</span><h2>Full refunds</h2>
      <p>A full refund is due if the owner cancels the journey, the paid placement cannot be delivered, accepted material is removed under moderation, a payment or inventory conflict prevents fulfillment, or applicable law gives a non-waivable refund right. Refunds return through the payment provider; bank processing time may vary.</p></section>
    <section><span className="legal-section-number">04</span><h2>Disputes and earlier agreements</h2>
      <p>Chargebacks and provider disputes may suspend a placement while they are resolved. An earlier sponsorship keeps the promise and terms accepted when it was purchased; it is not silently transferred into this inventory. Contact <Link href="/contact">support</Link> with the private payment reference.</p></section>
  </LegalPage>;
}
