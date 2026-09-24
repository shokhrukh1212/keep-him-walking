import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy — Keep Him Walking", description: "How Keep Him Walking handles viewer and analytics data." };

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" eyebrow="YOUR DATA" testId="privacy-page"
    summary="This policy describes the data used to run the viewing experience, interactions, analytics and operational security.">
    <section><span className="legal-section-number">01</span><h2>Who is responsible</h2>
      <p>Keep Him Walking is operated by Shokhrukh Karimov. Privacy questions and requests can be sent through <Link href="/contact">Contact &amp; support</Link>.</p></section>
    <section><span className="legal-section-number">02</span><h2>Viewing, voting and reactions</h2>
      <p>No viewer account, name or email is required. A first-party <code>khw_visitor</code> cookie contains a random identifier for up to one year; the server stores keyed hashes of it for presence, contribution, vote, reaction, postcard, rate-limit and sponsor-view records. A tab-session identifier avoids duplicate tabs. Hosting infrastructure supplies network and country information; raw IP addresses are not written to the application database, but keyed network hashes are used for abuse limits.</p>
      <p>Name ballots are stored per journey and hashed browser identity. Waiting actions and live reactions store their enum and timing. Sound and dialogue-history choices may be held in browser storage.</p></section>
    <section><span className="legal-section-number">03</span><h2>Earlier sponsor records</h2>
      <p>New sponsor purchases are paused. Records from earlier sponsor submissions and payments are retained for delivery, reconciliation, support and legal obligations.</p>
      <p>A sponsor submission stores its product URL, product name, description, logo, logo-fit choice, journey/slot identifiers and rights acknowledgment. Pending logos remain in private Supabase Storage; an approved logo copy is public. Dodo Payments collects billing/contact and tax information. Full card details do not reach Keep Him Walking, but customer email, provider checkout/payment/refund/dispute identifiers, amounts, currency, status and reconciliation reasons are stored privately for delivery and support.</p>
      <p>The retired coffee/supporter controls are hidden, but historical supporter or transaction records are not erased by that UI change.</p></section>
    <section><span className="legal-section-number">04</span><h2>Analytics and infrastructure</h2>
      <p>When configured, Vemetric receives page URLs, referrers, event names and limited journey/device details with analytics cookies disabled. DataFast receives page/referrer, campaign, browser/device and network-derived location data and sets its own visitor cookie. Sentry may receive errors and sampled traces with default personally identifying data disabled; Better Stack may receive redacted operational logs. Vercel hosts requests, Supabase hosts database and storage, and Cloudflare R2 serves public scene assets.</p></section>
    <section><span className="legal-section-number">05</span><h2>Retention, sharing and choices</h2>
      <p>Presence and short abuse records are pruned on operational schedules; day contribution hashes can remain up to 400 days and postcards up to 365 days. No fixed deletion period is configured for sponsor submissions, payment records, profile-view events, moderation history, corrections, incidents or vendor logs; they are retained as needed for delivery, reconciliation, disputes, security and legal obligations.</p>
      <p>Data is shared with the providers described above when configured and when required by law; visitor personal information is not sold. Blocking cookies/storage may prevent accurate one-browser voting, reactions or rate limits. Access, correction or deletion requests may be made through support, subject to transaction/security retention needs.</p></section>
  </LegalPage>;
}
