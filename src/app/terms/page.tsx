import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Terms of Service — Keep Him Walking", description: "Terms for viewing and interacting with Keep Him Walking." };

export default function TermsPage() {
  return <LegalPage title="Terms of Service" eyebrow="THE VIEWING EXPERIENCE" testId="terms-page"
    summary="These terms apply when you view, react to, vote in or share Keep Him Walking, operated by Shokhrukh Karimov.">
    <section><span className="legal-section-number">01</span><h2>What the service is</h2>
      <p>Keep Him Walking is an illustrated virtual journey. During a live journey, the shared traveler advances only while at least one ready, visible browser is confirmed as watching. The Paris relaunch first remains in a waiting state until the host schedules or starts it; waiting has no implied launch date and no travel progress. Once started, the journey runs for 14 calendar days.</p>
      <p>Scenes, dialogue, routes and weather are illustrative. Status labels identify waiting, scheduled, live, reconnecting, extrapolated or last-confirmed information.</p></section>
    <section><span className="legal-section-number">02</span><h2>Viewer interactions</h2>
      <p>Available reactions and name votes are free and may be rate-limited, deduplicated, delayed by the shared action schedule or closed. A name vote is scoped to this journey and one anonymous browser identity may update its ballot while voting is open. Interactions have no cash value and do not guarantee a requested action or vote outcome.</p></section>
    <section><span className="legal-section-number">03</span><h2>Free viewing</h2>
      <p>Watching, voting, reacting and sharing require no payment. New sponsor purchases are paused. Existing paid arrangements, if any, retain their original terms and can be raised through <Link href="/contact">Contact &amp; support</Link>.</p></section>
    <section><span className="legal-section-number">04</span><h2>Acceptable use</h2>
      <p>Do not break the law; interfere with the service; bypass rate limits or access controls; fabricate viewers, votes, reactions or metrics; probe private links or storage; upload malware; impersonate others; infringe rights; or use the service to deceive, harass or harm. Automated traffic that distorts the journey is prohibited.</p></section>
    <section><span className="legal-section-number">05</span><h2>Availability, links and responsibility</h2>
      <p>The service may be delayed, changed, suspended or discontinued. A journey may be postponed or cancelled. To the fullest extent allowed by applicable law, the service is provided “as is” and “as available”; nothing excludes rights or liability that cannot legally be excluded.</p></section>
    <section><span className="legal-section-number">06</span><h2>Privacy and contact</h2>
      <p>Use of the service is subject to the <Link href="/privacy">Privacy Policy</Link>. These terms may be updated prospectively by publishing a new date. No governing-law jurisdiction is invented here. Questions can be sent through <Link href="/contact">Contact &amp; support</Link>.</p></section>
  </LegalPage>;
}
