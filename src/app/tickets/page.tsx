import Link from "next/link";
import type { Metadata } from "next";
import { TicketCheckoutForm } from "@/components/tickets/TicketCheckoutForm";
import { loadTicketOffer } from "@/lib/tickets/data";

export const revalidate = 60;
export const metadata: Metadata = { title: "Buy him a ticket" };

export default async function TicketsPage() {
  const offer = await loadTicketOffer();
  return <main className="content-page sponsors-page">
    <Link className="back-link" href="/">← Return to the walk</Link>
    <span className="eyebrow">BUY HIM A TICKET</span>
    <h1>Send him somewhere.</h1>
    <p>
      Pick an unsold day at least three days ahead and a country from the reviewed route list.
      A Ticket fixes that destination and includes Standard sponsorship for the day.
    </p>
    {offer ? <>
      <p>Tickets are open from Day {offer.currentDay + 3} through Day {offer.currentDay + offer.horizonDays}, where inventory is available.</p>
      <TicketCheckoutForm days={offer.days} destinations={offer.destinations} />
    </> : <p data-testid="tickets-closed">Tickets open after the first week when the owner enables them.</p>}
    <nav className="legal-links"><Link href="/sponsors">Sponsor a day instead</Link><Link href="/refund-policy">Refund &amp; creative policy</Link></nav>
  </main>;
}
