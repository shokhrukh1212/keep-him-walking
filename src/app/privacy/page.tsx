import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy — Keep Him Walking",
  description: "How Keep Him Walking handles visitor, sponsor, analytics and infrastructure data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      eyebrow="YOUR DATA"
      testId="privacy-page"
      summary="This policy describes the data used to run the anonymous viewing experience, moderate sponsor requests, measure reliability and process a future sponsorship payment."
    >
      <section>
        <span className="legal-section-number">01</span>
        <h2>Who is responsible</h2>
        <p>Keep Him Walking is operated by Shokhrukh Karimov. Privacy questions, access requests and deletion requests can be sent through the real support method on the <Link href="/contact">Contact &amp; support page</Link>.</p>
      </section>

      <section>
        <span className="legal-section-number">02</span>
        <h2>Anonymous viewing and interactions</h2>
        <p>No visitor account, name or email is required to watch. The application sets one first-party <code>khw_visitor</code> cookie containing a random identifier; analytics cookies are described in section 05. It is HttpOnly, SameSite=Lax, secure in production and lasts up to one year. The server converts it to a keyed one-way hash before storing presence, contribution, vote, reaction, postcard or sponsor-metric records in Supabase.</p>
        <p>A random tab-session identifier is used while the page is open to avoid counting duplicate tabs. The hosting edge supplies a two-letter country code for the audience display. Raw IP addresses are not written to the application database; short abuse limits use a keyed one-way hash of the edge-reported network address.</p>
        <p>The sound choice is kept in browser local storage. Vemetric uses a random session-storage context while the tab session lasts. These browser values are not accounts.</p>
      </section>

      <section>
        <span className="legal-section-number">03</span>
        <h2>Sponsor and correction submissions</h2>
        <p>A season sponsorship request stores the submitted product or company name, HTTPS website, short description, contact name, contact email and a re-encoded WebP copy of the logo. Unapproved material stays in a private Supabase Storage bucket. Only an approved name, description, website and public logo copy can be published; contact details are not published.</p>
        <p>The private corrections queue is the only visitor free-text feature outside sponsor requests. It stores the correction, category, referenced city pack and optional place, country code and anonymous visitor hash. Correction text is never automatically published.</p>
      </section>

      <section>
        <span className="legal-section-number">04</span>
        <h2>Payments</h2>
        <p>Checkout is currently disabled. If it is enabled after provider approval, approved sponsors are sent to Dodo Payments for a one-time payment. The site sends the approved contact name and email, season and booking identifiers, and the configured product. Dodo handles card, billing and tax details; full card details do not reach Keep Him Walking. Payment, refund, webhook and dispute identifiers and status are kept in Supabase so the booking can be fulfilled, reconciled and supported.</p>
        <p>The optional Buy Me a Coffee link opens the operator&apos;s profile on Buy Me a Coffee; its site handles that contribution. When Supporters is opened, Keep Him Walking reads the creator&apos;s supporter list directly from Buy Me a Coffee using a server-only creator token. It projects only a display name, contribution date and exact coffee count when provided. Emails, payment identifiers and messages are neither stored nor published. Records marked anonymous or private by Buy Me a Coffee are shown as “Anonymous supporter.”</p>
      </section>

      <section>
        <span className="legal-section-number">05</span>
        <h2>Analytics, logs and infrastructure</h2>
        <p>Vemetric is enabled only when its public token is configured. It receives page URLs, referrers, a session context, event names and limited event details such as city, route zone, rendering quality and sponsor identifiers. It is initialized with analytics cookies disabled. Private sponsor-request, legacy report and postcard tokens are masked from analytics page URLs.</p>
        <p>DataFast measures visits on every page. Its script, loaded from <code>datafa.st</code>, receives page URLs, referrers and campaign parameters, browser, operating system and device details, and a location derived from the network address, and it sets DataFast cookies such as <code>datafast_visitor_id</code> to tell new visitors from returning ones. The number of people shown as watching is DataFast&apos;s count of visitors active in the last ten minutes; the server reads it with a private key and the browser receives only the totals.</p>
        <p>Sentry is enabled only when its DSN is configured and receives errors and sampled performance traces with default personally identifying data disabled. Better Stack is enabled only when its source token is configured and receives structured operational logs. Application logging redacts cookies, authorization values, tokens, visitor identifiers, email fields, payloads and signatures. Vercel hosts the application and necessarily processes web requests and operational logs.</p>
        <p>Supabase hosts the database, Realtime channel and private/public object storage. Cloudflare R2 serves public city, character and audio assets from <code>assets.keephimwalking.com</code>; it does not receive sponsor form submissions from this app.</p>
      </section>

      <section>
        <span className="legal-section-number">06</span>
        <h2>Retention, sharing and choices</h2>
        <p>The visitor cookie lasts up to one year. Day-scoped contribution hashes expire after up to 400 days. Postcard records and public postcard access expire after 365 days, although an expired asset may remain in storage until operational cleanup. Short presence, reaction and abuse-limit records are pruned on much shorter operational schedules.</p>
        <p>No fixed deletion period is configured for sponsor requests, approved sponsor material, payment records, aggregate sponsor metrics, corrections, operational incidents or vendor logs. They are kept as needed to review submissions, deliver and document the placement, handle refunds or disputes, maintain security and meet legal obligations. Supporter information is not retained by Keep Him Walking; corrections and removals are made in Buy Me a Coffee. Contact support to request access, correction or deletion; some transaction or security records may have to be retained.</p>
        <p>Data is shared only with the infrastructure and service providers described above when their configuration is enabled, and when required by law. Keep Him Walking does not sell visitor personal information. You may block browser storage, but the site may then be unable to keep an accurate one-person vote, reaction, contribution or postcard record.</p>
      </section>
    </LegalPage>
  );
}
