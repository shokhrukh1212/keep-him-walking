import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SeasonCheckoutButton } from "@/components/sponsor/SeasonCheckoutButton";
import { seasonPriceIncludesTax, sponsorshipMode } from "@/lib/config/sponsorship";
import { loadSeasonRequest } from "@/lib/sponsors/season-data";
import { formatSeasonInstant, formatUsdCents, seasonTaxNote } from "@/lib/sponsors/season-offer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Season sponsorship request", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HEADLINES: Record<string, string> = {
  submitted: "Received · waiting for review",
  approved: "Approved · waiting for payment",
  payment_pending: "Checkout started · waiting for payment confirmation",
  scheduled: "Paid · scheduled for the season",
  active: "Live this season",
  completed: "Season completed",
  rejected: "Not approved",
  expired: "Booking closed before this request was completed",
  cancelled: "Cancelled",
  refund_required: "A refund is being arranged",
  refunded: "Refunded",
};

type Props = { params: Promise<{ publicId: string }> };

/** A requester's private status page, reached only through the link they were given. */
export default async function SeasonRequestPage({ params }: Props) {
  if (sponsorshipMode() !== "season") notFound();
  const { publicId } = await params;
  if (!UUID.test(publicId)) notFound();
  const request = await loadSeasonRequest(publicId);
  if (!request) notFound();
  const season = request.season;
  return <main className="content-page sponsors-page">
    <Link className="back-link" href="/sponsors">← Sponsor a season</Link>
    <span className="eyebrow">SEASON {season.number} SPONSORSHIP</span>
    <h1>{HEADLINES[request.status] ?? "Status unavailable"}</h1>
    <p data-testid="season-request-status">
      <strong>{request.productName}</strong> · Season {season.number}: {formatSeasonInstant(season.startsAt)} to {formatSeasonInstant(season.endsAt)}
    </p>
    {request.payable ? <>
      <p>
        {formatUsdCents()}, one-time payment, no renewal. {seasonTaxNote(seasonPriceIncludesTax())} Booking closes{" "}
        {formatSeasonInstant(season.saleClosesAt)}.
      </p>
      <SeasonCheckoutButton publicId={request.publicId} label={`Pay ${formatUsdCents()} securely`} />
    </> : null}
    {request.status === "approved" && !request.payable
      ? <p>Checkout is not open yet. Nothing has been charged, and the season is not reserved.</p>
      : null}
    {request.status === "payment_pending"
      ? <p>This page changes only once the payment provider confirms the payment. Returning from checkout is not proof of payment.</p>
      : null}
    <p className="policy-copy">
      The purchase is a dated placement on this website, not guaranteed traffic.{" "}
      <Link href="/refund-policy">Refund policy</Link> · <Link href="/sponsor-terms">Sponsor terms</Link> · <Link href="/contact">Contact</Link>
    </p>
  </main>;
}
