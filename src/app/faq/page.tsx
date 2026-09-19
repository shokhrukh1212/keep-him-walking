import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "FAQ — Keep Him Walking", description: "Answers about the Paris relaunch, watching, sponsor placements and Views." };

export default function FaqPage() {
  return <LegalPage title="Frequently asked questions" eyebrow="PARIS RELAUNCH" testId="faq-page"
    summary="Short answers about the waiting room, the 14-day journey and fixed sponsor placements.">
    <section><span className="legal-section-number">01</span><h2>When does he start?</h2>
      <p>The host decides. “Waiting” has no launch date; “Scheduled” shows a real countdown. Sponsor sales never trigger launch. At actual launch, the 14-day calendar period begins and walking advances only while a valid viewer is watching.</p></section>
    <section><span className="legal-section-number">02</span><h2>What can I buy?</h2>
      <p>There are ten regular journey placements at USD 50 each and one separate featured placement at USD 100. They are one-time purchases, not auctions or subscriptions. Tax, if applicable, is calculated at checkout.</p></section>
    <section><span className="legal-section-number">03</span><h2>How long does a placement last?</h2>
      <p>A prelaunch purchase appears after confirmed payment during the waiting period and the following 14-day journey. A purchase during the journey lasts only for the remaining period. The waiting period has no fixed maximum.</p></section>
    <section><span className="legal-section-number">04</span><h2>What does “Views” mean?</h2>
      <p>It counts accepted deliberate opens of that product’s profile. It does not count logo visibility, carousel movement, page loads or outbound clicks, and it is not a unique-people or sales number.</p></section>
    <section><span className="legal-section-number">05</span><h2>Are audience or results guaranteed?</h2>
      <p>No. Visitor volume, profile Views, impressions, leads, conversions and sales are not guaranteed. See the <Link href="/sponsor-terms">Sponsor Terms</Link> and <Link href="/refund-policy">refund rules</Link>.</p></section>
    <section><span className="legal-section-number">06</span><h2>What happened to earlier sponsors?</h2>
      <p>Earlier paid promises remain separate. They are not deleted, downgraded, moved into a new place or charged again automatically. The owner reviews any legacy entitlement before enabling the new journey.</p></section>
  </LegalPage>;
}
