import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service — Keep Him Walking",
  description: "Terms for viewing and interacting with Keep Him Walking.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      eyebrow="THE VIEWING EXPERIENCE"
      testId="terms-page"
      summary="These terms apply when you view, react to, vote in, share or otherwise use Keep Him Walking. The service is operated by Shokhrukh Karimov."
    >
      <section>
        <span className="legal-section-number">01</span>
        <h2>What the service is</h2>
        <p>Keep Him Walking is a free, anonymous interactive viewing experience. A shared traveler advances only while at least one ready, visible browser is confirmed as watching. Seasons, cities, scenes, stories, votes and availability may change. The displayed status identifies whether information is live, reconnecting, extrapolated or last confirmed.</p>
      </section>

      <section>
        <span className="legal-section-number">02</span>
        <h2>Viewer interactions</h2>
        <p>You may use the available enum reactions, cast an eligible vote, create an eligible postcard, share public pages and submit a private correction. Interactions may be rate-limited, deduplicated per anonymous visitor, closed at a stated time, delayed by the shared action schedule or refused to preserve fairness and security. They have no cash value and do not create ownership or a promise that a requested action or vote outcome will occur.</p>
      </section>

      <section>
        <span className="legal-section-number">03</span>
        <h2>Acceptable use</h2>
        <p>Do not break the law; interfere with the service; bypass rate limits, access controls or payment gates; fabricate viewers, votes, reactions, clicks or metrics; probe private links or storage; upload malware; scrape at a harmful rate; impersonate another person or organisation; infringe rights; or use the service to threaten, deceive, harass or harm others. Automated traffic that distorts the shared journey is prohibited.</p>
      </section>

      <section>
        <span className="legal-section-number">04</span>
        <h2>Availability and changes</h2>
        <p>The service may be unavailable, delayed, inaccurate during reconnection, changed, suspended or discontinued. A season may be postponed or cancelled. Maintenance, infrastructure failures, safety concerns and legal or provider requirements may affect content or access. No uninterrupted availability, preservation of a contribution, postcard or vote, or particular route or season is promised.</p>
      </section>

      <section>
        <span className="legal-section-number">05</span>
        <h2>Content, sponsors and links</h2>
        <p>Site artwork, code, writing and branding remain owned by their respective rights holders. You may share the public links and generated share assets made available by the service, but may not falsely claim ownership, endorsement or affiliation.</p>
        <p>Sponsor placements are advertising and are manually reviewed, but Keep Him Walking does not guarantee or endorse a sponsor, its claims, products or destination. External websites are controlled by their operators. Report concerns through <Link href="/contact">Contact &amp; support</Link>. Sponsor submissions are governed by the <Link href="/sponsor-terms">Sponsor Terms</Link> and <Link href="/content-moderation">Content and Listing Moderation Policy</Link>.</p>
      </section>

      <section>
        <span className="legal-section-number">06</span>
        <h2>Privacy</h2>
        <p>The service uses an anonymous first-party cookie and the data practices described in the <Link href="/privacy">Privacy Policy</Link>. Do not submit personal, confidential or sensitive information through visitor interactions or corrections.</p>
      </section>

      <section>
        <span className="legal-section-number">07</span>
        <h2>Disclaimers and responsibility</h2>
        <p>To the fullest extent allowed by applicable law, the service and its content are provided “as is” and “as available,” without warranties of uninterrupted operation, accuracy, fitness for a particular purpose or non-infringement. Travel scenes, dialogue, maps and weather are illustrative or informational and are not travel, safety, legal, medical or financial advice.</p>
        <p>To the fullest extent allowed by applicable law, Shokhrukh Karimov is not liable for indirect, incidental, special, consequential or lost-profit damages arising from free use of the service or third-party links. Nothing in these terms excludes liability or rights that cannot legally be excluded.</p>
      </section>

      <section>
        <span className="legal-section-number">08</span>
        <h2>Changes, governing law and contact</h2>
        <p>These terms may be updated by publishing a new last-updated date. Material changes apply prospectively. A specific governing-law jurisdiction and forum have not yet been configured; no jurisdiction is invented here. That owner confirmation is required before paid checkout is enabled. Questions about these terms can be sent through <Link href="/contact">Contact &amp; support</Link>.</p>
      </section>
    </LegalPage>
  );
}
