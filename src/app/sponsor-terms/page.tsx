import Link from "next/link";
import { seasonPriceIncludesTax, seasonSaleCutoffHours, sponsorshipMode } from "@/lib/config/sponsorship";
import { formatUsdCents, seasonTaxNote } from "@/lib/sponsors/season-offer";

export default function SponsorTermsPage() {
  if (sponsorshipMode() === "daily") {
    return <main className="content-page"><a className="back-link" href="/sponsor">← Sponsorship</a><h1>Sponsor terms</h1><p>A purchase reserves one identified country-day subject to payment verification and creative review. Payment alone does not make a placement live. Claims, prohibited content, destination URLs and visual creative may be rejected.</p><p>Reporting uses the first-party aggregate definitions documented for impressions, engaged views, watch time, clicks, postcard actions and sessions. Metrics are estimates designed to resist retries and duplicate tabs.</p></main>;
  }
  return <main className="content-page">
    <Link className="back-link" href="/sponsors">← Sponsor a season</Link>
    <h1>Sponsor terms</h1>
    <h2>What you buy</h2>
    <p>
      One disclosed sponsor placement for one configured seven-day season of Keep Him Walking, from 16:00 UTC on its start
      date to 16:00 UTC seven days later. The price is {formatUsdCents()}, paid once, with no renewal.{" "}
      {seasonTaxNote(seasonPriceIncludesTax())}
    </p>
    <h2>What the placement is</h2>
    <ul>
      <li>A “Season supported by” line with your logo, name and website link beside the journey on every day of the season.</li>
      <li>One row in Journey with your logo, name, a short factual description and a link to your website.</li>
      <li>An acknowledgment as that season’s sponsor in the season recap, which stays published.</li>
    </ul>
    <h2>What it is not</h2>
    <p>
      It is advertising placement on this website only. It is not a donation, paid access to the site, travel, or a resale
      of your product. Nothing is placed in the traveler’s conversations, on his clothes or backpack, or as a large banner.
      No social media posts, impressions, clicks, leads or sales are promised. Audience size and results are not guaranteed.
      Watching, reactions and votes stay free for everyone.
    </p>
    <h2>Review</h2>
    <p>
      You must have the right to use the name, logo and website you submit. Material is reviewed by hand before any payment
      is requested. We may decline material that is misleading, unlawful, harmful or unsuitable for a general audience, or a
      website that cannot be understood without signing in or paying. Approval is a content check only. Material and booking
      close {seasonSaleCutoffHours()} hours before the season starts.
    </p>
    <h2>One sponsor per season</h2>
    <p>
      A season is sold only when the payment processor confirms payment. If another sponsor pays first, or a payment arrives
      after booking has closed or the season has started, that payment is refunded in full.
    </p>
    <h2>Delivery and reporting</h2>
    <p>
      The placement starts and ends automatically with the season. We record the interval it was shown and first-party
      counts of views and link clicks, without identifying visitors. These counts are not a guarantee of anything.
    </p>
    <h2>Removal and refunds</h2>
    <p>A placement can be removed if its material or website breaks these terms. Refunds follow the <Link href="/refund-policy">refund policy</Link>.</p>
    <h2>Your details</h2>
    <p>Contact details you give us are used only for this sponsorship and are never published. See <Link href="/privacy">privacy</Link>.</p>
  </main>;
}
