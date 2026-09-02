import { NextResponse } from "next/server";
import { trackServerEvent } from "@/lib/analytics/server";
import { nextPaymentState, type SponsorshipState } from "@/lib/payments/state-machine";
import { parseLemonWebhook, validateLemonOrder, verifyLemonSignature, webhookChecksum } from "@/lib/payments/webhook";
import { getServerSupabase } from "@/lib/supabase/server";
import { apiError, readLimitedText } from "@/lib/validation/http";

export async function POST(request: Request) {
  let rawBody: string;
  try { rawBody = await readLimitedText(request, 65_536); } catch {
    return apiError(413, "PAYLOAD_TOO_LARGE", "Webhook payload is too large.");
  }
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET ?? "";
  if (!verifyLemonSignature(rawBody, request.headers.get("x-signature"), secret)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Invalid webhook signature." } }, { status: 403 });
  }
  let event;
  try { event = parseLemonWebhook(JSON.parse(rawBody)); } catch {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Unsupported webhook payload." } }, { status: 400 });
  }
  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.json({ error: { code: "UNAVAILABLE", message: "Payments are unavailable." } }, { status: 503 });
  const checksum = webhookChecksum(rawBody);
  const providerEventId = `${event.meta.event_name}:${event.data.id}`;
  let { data: ledger, error: ledgerError } = await supabase.from("payment_webhook_events")
    .insert({ provider_event_id: providerEventId, event_name: event.meta.event_name, payload_checksum: checksum, processing_status: "received" })
    .select("id,payload_checksum,processing_status,received_at").maybeSingle();
  if (ledgerError?.code === "23505") {
    const existingResult = await supabase.from("payment_webhook_events")
      .select("id,payload_checksum,processing_status,received_at")
      .eq("provider_event_id", providerEventId)
      .maybeSingle();
    const existing = existingResult.data;
    if (existingResult.error || !existing) {
      return NextResponse.json({ error: { code: "UNAVAILABLE", message: "Webhook ledger unavailable." } }, { status: 503 });
    }
    if (existing.payload_checksum !== checksum) {
      return NextResponse.json({ error: { code: "CONFLICT", message: "Provider event identity was reused with a different payload." } }, { status: 409 });
    }
    const staleReceived = existing.processing_status === "received"
      && Date.now() - new Date(existing.received_at).getTime() > 5 * 60_000;
    if (existing.processing_status !== "failed" && !staleReceived) {
      return NextResponse.json({ accepted: true, duplicate: true });
    }
    const reclaimed = await supabase.from("payment_webhook_events")
      .update({ processing_status: "received", processed_at: null, error_code: null, received_at: new Date().toISOString() })
      .eq("id", existing.id)
      .in("processing_status", ["failed", "received"])
      .select("id,payload_checksum,processing_status,received_at")
      .maybeSingle();
    if (reclaimed.error || !reclaimed.data) {
      return NextResponse.json({ error: { code: "UNAVAILABLE", message: "Webhook retry claim failed." } }, { status: 503 });
    }
    ledger = reclaimed.data;
    ledgerError = null;
  }
  if (ledgerError || !ledger) return NextResponse.json({ error: { code: "UNAVAILABLE", message: "Webhook ledger unavailable." } }, { status: 503 });

  const customId = event.meta.custom_data?.sponsorship_id;
  let query = supabase.from("sponsorships").select("id,slot_id,status,expected_price_cents,expected_currency,test_mode,lemon_order_id");
  query = customId ? query.eq("id", customId) : query.eq("lemon_order_id", event.data.id);
  const sponsorshipResult = await query.maybeSingle();
  const sponsorship = sponsorshipResult.data;
  if (sponsorshipResult.error) {
    await supabase.from("payment_webhook_events").update({ processing_status: "failed", processed_at: new Date().toISOString(), error_code: "SPONSOR_LOOKUP_ERROR" }).eq("id", ledger.id);
    return NextResponse.json({ error: { code: "UNAVAILABLE", message: "Webhook processing will be retried." } }, { status: 503 });
  }
  if (!sponsorship) {
    await supabase.from("payment_webhook_events").update({ processing_status: "ignored", processed_at: new Date().toISOString(), error_code: "UNKNOWN_SPONSORSHIP" }).eq("id", ledger.id);
    return NextResponse.json({ accepted: true, ignored: true });
  }
  const orderMatches = validateLemonOrder(event, {
    sponsorshipId: String(sponsorship.id),
    slotId: String(sponsorship.slot_id),
    priceCents: Number(sponsorship.expected_price_cents),
    currency: String(sponsorship.expected_currency),
    testMode: Boolean(sponsorship.test_mode),
  });
  if (!orderMatches) {
    await supabase.from("payment_webhook_events").update({ sponsorship_id: sponsorship.id, processing_status: "ignored", processed_at: new Date().toISOString(), error_code: "ORDER_MISMATCH" }).eq("id", ledger.id);
    return NextResponse.json({ accepted: true, ignored: true });
  }
  try {
    const nextStatus = nextPaymentState(sponsorship.status as SponsorshipState, event.meta.event_name);
    const now = new Date().toISOString();
    const sponsorshipUpdate = await supabase.from("sponsorships").update({
      status: nextStatus,
      lemon_order_id: sponsorship.lemon_order_id ?? event.data.id,
      ...(event.meta.event_name === "order_created" ? { paid_at: now } : { removed_at: now }),
      updated_at: now,
    }).eq("id", sponsorship.id);
    if (sponsorshipUpdate.error) throw sponsorshipUpdate.error;
    const slotUpdate = await supabase.from("sponsor_slots").update({
      status: event.meta.event_name === "order_created" ? "sold" : "available",
      reserved_by: null, reserved_until: null, updated_at: now,
    }).eq("id", sponsorship.slot_id);
    if (slotUpdate.error) throw slotUpdate.error;
    const ledgerUpdate = await supabase.from("payment_webhook_events").update({ sponsorship_id: sponsorship.id, processing_status: "processed", processed_at: now }).eq("id", ledger.id);
    if (ledgerUpdate.error) throw ledgerUpdate.error;
    trackServerEvent(event.meta.event_name === "order_created" ? "sponsor_payment_confirmed" : "sponsor_refunded", String(sponsorship.id), {
      sponsorship_id: String(sponsorship.id), provider_event_id: providerEventId,
    });
    return NextResponse.json({ accepted: true, duplicate: false });
  } catch (error) {
    const illegalTransition = error instanceof Error && error.message.startsWith("Illegal sponsor transition:");
    await supabase.from("payment_webhook_events").update({
      processing_status: illegalTransition ? "ignored" : "failed",
      processed_at: new Date().toISOString(),
      error_code: illegalTransition ? "ILLEGAL_TRANSITION" : "PROCESSING_ERROR",
    }).eq("id", ledger.id);
    if (illegalTransition) return NextResponse.json({ accepted: true, ignored: true });
    return NextResponse.json({ error: { code: "UNAVAILABLE", message: "Webhook processing will be retried." } }, { status: 503 });
  }
}
