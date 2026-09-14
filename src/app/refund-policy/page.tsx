import Link from "next/link";
import { sponsorshipMode } from "@/lib/config/sponsorship";

export default function RefundPolicyPage() {
  if (sponsorshipMode() === "daily") {
    return <main className="content-page"><a className="back-link" href="/sponsor">← Sponsorship</a><h1>Refund & creative policy</h1><p>Rejected creative may be revised before its deadline or refunded. A provider refund immediately removes any live placement. Emergency removal is available for policy, safety, legal or technical reasons.</p><p>Approved public creative is copied from private review storage to an immutable public path. Replacing it requires a new review.</p></main>;
  }
  return <main className="content-page">
    <Link className="back-link" href="/sponsors">← Sponsor a season</Link>
    <h1>Refund policy</h1>
    <p>
      This policy covers the season sponsorship: one disclosed placement for one seven-day season, paid once, with no
      renewal. The configured prices are Season 1 USD 499.00, Season 2 USD 599.00 and Season 3 USD 699.00. Your request
      keeps the price quoted when you submit it. The purchase is a dated placement on this website, not a guaranteed
      audience, traffic or result.
    </p>
    <h2>Before you pay</h2>
    <p>Your material is reviewed before any payment is requested. If it is not approved, nothing is charged.</p>
    <h2>If we cancel</h2>
    <p>If we cancel your season, or your placement, before its delivery begins, you receive a full refund.</p>
    <h2>If the placement is not delivered</h2>
    <p>
      If a material part of your placement is not delivered during the season (for example, the site is unavailable for a
      whole day, or your approved placement is not shown), contact us. We refund the undelivered days in proportion to the
      seven days paid for or, if you prefer, give you the same placement in a later season.
    </p>
    <h2>Removal</h2>
    <p>
      We may remove a placement whose material or website breaks the sponsor terms. We will tell you why, and any refund for
      the remaining days follows this policy and the law that applies to you.
    </p>
    <h2>Payments that cannot be used</h2>
    <p>
      A payment that arrives after the season has been sold to someone else, after booking has closed or the season has
      started, a second payment, or a payment for the wrong amount is refunded in full. Refunds go back through the payment
      processor that took the payment; how long they take to arrive depends on that processor and your bank.
    </p>
    <h2>Your rights</h2>
    <p>Nothing in this policy limits a right you have under the law that applies to you.</p>
    <p>Refund requests and questions: <Link href="/contact">contact us</Link>.</p>
  </main>;
}
