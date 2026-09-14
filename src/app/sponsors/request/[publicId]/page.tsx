import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SeasonCheckoutButton } from "@/components/sponsor/SeasonCheckoutButton";
import { LegalFooter } from "@/components/legal/LegalFooter";
import { seasonPriceIncludesTax, sponsorshipMode } from "@/lib/config/sponsorship";
import { loadSeasonRequest } from "@/lib/sponsors/season-data";
import { formatSeasonInstant, formatUsdCents, seasonTaxNote } from "@/lib/sponsors/season-offer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Season sponsorship request", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HEADLINES: Record<string, string> = {
  submitted: "Received · waiting for review",
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
  const changeCanBlockCheckout = ["submitted", "approved", "payment_pending"].includes(request.status);
  const scheduleChanged = changeCanBlockCheckout && request.scheduleChanged;
  const quoteChanged = changeCanBlockCheckout && request.quoteChanged;
  const headline = scheduleChanged
    ? "Season dates changed · checkout paused"
    : quoteChanged
      ? "Saved quote needs review · checkout paused"
      : request.status === "approved" && !request.seasonAvailable
        ? "Approved · season no longer available"
        : request.status === "approved" && request.bookingClosed
          ? "Approved · booking window closed"
          : request.status === "approved" && request.checkoutAvailable
            ? "Approved · ready for checkout"
            : request.status === "approved"
              ? "Approved · awaiting checkout availability"
              : HEADLINES[request.status] ?? "Status unavailable";
  return <main className="content-page sponsors-page">
    <Link className="back-link" href="/sponsors">← Sponsor a season</Link>
    <span className="eyebrow">SEASON {season.number} SPONSORSHIP</span>
    <h1>{headline}</h1>
    <p data-testid="season-request-status">
      <strong>{request.productName}</strong> · Season {season.number}: {formatSeasonInstant(season.startsAt)} to {formatSeasonInstant(season.endsAt)}
    </p>
    <dl className="season-request-summary" aria-label="Saved sponsorship request">
      <div><dt>Product</dt><dd>{request.productName}</dd></div>
      <div><dt>Website</dt><dd><a href={request.websiteUrl} target="_blank" rel="noopener noreferrer">{request.websiteUrl}</a></dd></div>
      <div><dt>Description</dt><dd>{request.description}</dd></div>
      <div><dt>Quoted price</dt><dd>{formatUsdCents(request.priceCents)}, one-time payment, no renewal</dd></div>
    </dl>
    {request.payable ? <>
      <p>
        {seasonTaxNote(seasonPriceIncludesTax(), request.priceCents)} Booking closes{" "}
        {formatSeasonInstant(season.saleClosesAt)}.
      </p>
      <SeasonCheckoutButton publicId={request.publicId} label="Continue to checkout" />
    </> : null}
    {request.status === "approved" && !request.checkoutAvailable && !request.bookingClosed && request.seasonAvailable && !request.scheduleChanged && !request.quoteChanged
      ? <p>Your material is approved and stays on file. Checkout is not available yet, so nothing has been charged and the season is not booked or reserved. Use this same private link when checkout opens.</p>
      : null}
    {request.status === "approved" && request.bookingClosed && !request.scheduleChanged && !request.quoteChanged
      ? <p>Your material remains approved, but booking for these dates has closed. Nothing has been charged or booked.</p>
      : null}
    {request.status === "approved" && !request.seasonAvailable && !request.scheduleChanged && !request.quoteChanged
      ? <p>Your material remains approved, but this season is no longer available. Nothing has been charged or booked.</p>
      : null}
    {scheduleChanged
      ? <p>The season dates no longer match the dates quoted with this request. Checkout is paused and no booking is confirmed. {request.status === "payment_pending" ? "If the provider confirms a payment that cannot be delivered, it is sent through the refund path. " : "Nothing has been charged. "}Contact us before continuing.</p>
      : null}
    {quoteChanged
      ? <p>The checkout configuration no longer matches your saved {formatUsdCents(request.priceCents)} quote. Your quote has not been changed, checkout is paused and no booking is confirmed. {request.status === "payment_pending" ? "If the provider confirms a payment that cannot be delivered, it is sent through the refund path. " : "Nothing has been charged. "}Contact us before continuing.</p>
      : null}
    {request.status === "payment_pending"
      ? <p>This page changes only once the payment provider confirms the payment. Returning from checkout is not proof of payment.</p>
      : null}
    <p className="policy-copy">
      The purchase is a dated placement on this website, not guaranteed traffic.{" "}
      <Link href="/refund-policy">Refund policy</Link> · <Link href="/sponsor-terms">Sponsor terms</Link> · <Link href="/contact">Contact</Link>
    </p>
    <LegalFooter lead="Keep Him Walking" />
  </main>;
}
