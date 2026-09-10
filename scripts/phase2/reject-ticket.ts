import { refundSponsorOrder } from "../../src/lib/payments/refund";
import { adminClient, requireApply, requireArgument } from "./lib";

const id = requireArgument("id");
const reviewer = requireArgument("reviewer");
const supabase = adminClient();
const { data, error } = await supabase.from("sponsorships")
  .select("id,status,lemon_order_id,tickets(id,status,target_day_number,pack_id)")
  .eq("id", id).single();
if (error) throw error;
const tickets = Array.isArray(data.tickets) ? data.tickets : [data.tickets].filter(Boolean);
const ticket = tickets[0] as { id: string; status: string; target_day_number: number; pack_id: string } | undefined;
if (!ticket) throw new Error("The sponsorship is not a Ticket");
if (data.status === "refunded" || ticket.status === "rejected") {
  process.stdout.write(`${JSON.stringify({ rejected: true, duplicate: true, id })}\n`);
  process.exit(0);
}
if (data.status !== "paid_pending_review" || ticket.status !== "pending_review") {
  throw new Error("Only a paid Ticket awaiting creative review can be rejected");
}
requireApply({ id, transition: "paid_pending_review -> refunded", reviewer, dayNumber: ticket.target_day_number, packId: ticket.pack_id });
const paymentProvider = process.env.SPONSOR_PAYMENT_PROVIDER === "fixture" ? "fixture" : "lemonsqueezy";
const provider = await refundSponsorOrder(data.lemon_order_id, {
  provider: paymentProvider, apiKey: process.env.LEMON_SQUEEZY_API_KEY,
});
const now = new Date().toISOString();
if (provider === "fixture") {
  const sponsorshipUpdate = await supabase.from("sponsorships")
    .update({ status: "refunded", reviewed_at: now, removed_at: now, updated_at: now })
    .eq("id", id).eq("status", "paid_pending_review");
  if (sponsorshipUpdate.error) throw sponsorshipUpdate.error;
  const ticketUpdate = await supabase.rpc("mark_ticket_refunded", {
    p_sponsorship_id: id, p_now: now, p_creative_rejected: true,
  });
  if (ticketUpdate.error) throw ticketUpdate.error;
}
process.stdout.write(`${JSON.stringify({ rejected: true, id, reviewer, provider, awaitingWebhook: provider === "lemonsqueezy" })}\n`);
