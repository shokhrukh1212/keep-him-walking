import { NextRequest, NextResponse } from "next/server";
import { visitorFromRequest, attachVisitorCookie } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { createSponsorCheckout } from "@/lib/payments/provider";
import { serverRuntimeConfig } from "@/lib/config/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { ticketDestination } from "@/lib/tickets/catalog";
import { ticketCheckoutBodySchema } from "@/lib/validation/api";
import { apiError, readLimitedJson } from "@/lib/validation/http";
import { hasTrustedOrigin } from "@/lib/validation/origin";

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return apiError(403, "FORBIDDEN", "Untrusted request origin.");
  let body: unknown;
  try { body = await readLimitedJson(request); } catch { return apiError(400, "BAD_REQUEST", "Invalid checkout request."); }
  const parsed = ticketCheckoutBodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "UNPROCESSABLE", "Ticket details are incomplete.");
  const config = serverRuntimeConfig();
  if (!config.phase2Enabled || !config.ticketsEnabled) return apiError(503, "UNAVAILABLE", "Tickets are not open.");
  const destination = ticketDestination(parsed.data.packId);
  if (!destination) return apiError(422, "UNPROCESSABLE", "That country is not available for Tickets.");
  const supabase = getServerSupabase();
  if (!supabase) return apiError(503, "UNAVAILABLE", "Tickets are not configured.");
  const visitor = visitorFromRequest(request);
  const visitorHash = hashOpaqueValue(visitor.visitorId);
  const { data: allowed } = await supabase.rpc("consume_mutation_rate_limit", {
    p_key_hash: visitorHash, p_action: "ticket_checkout", p_limit: 5, p_window_seconds: 900, p_now: new Date().toISOString(),
  });
  if (!allowed) return apiError(429, "RATE_LIMITED", "Please wait before starting another checkout.");
  const now = new Date();
  const testMode = config.sponsorPaymentProvider === "fixture" || process.env.LEMON_SQUEEZY_TEST_MODE !== "false";
  const { data, error } = await supabase.rpc("reserve_ticket", {
    p_slot_id: parsed.data.slotId,
    p_pack_id: destination.packId,
    p_country_code: destination.countryCode,
    p_country_name: destination.countryName,
    p_city_name: destination.cityName,
    p_time_zone: destination.timeZone,
    p_lat: destination.lat,
    p_lon: destination.lon,
    p_sponsor_name: parsed.data.sponsorName,
    p_sponsor_email: parsed.data.sponsorEmail,
    p_test_mode: testMode,
    p_now: now.toISOString(),
    p_reservation_minutes: config.sponsorReservationMinutes,
    p_horizon_days: config.ticketHorizonDays,
  });
  if (error || !data) return apiError(409, "CONFLICT", "That Ticket day is no longer available.");
  const purchase = Array.isArray(data) ? data[0] : data;
  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const checkout = await createSponsorCheckout({
      sponsorshipId: String(purchase.sponsorship_id), slotId: parsed.data.slotId,
      email: parsed.data.sponsorEmail, priceCents: Number(purchase.expected_price_cents),
      expiresAt: new Date(now.getTime() + config.sponsorReservationMinutes * 60_000).toISOString(),
      returnUrl: `${origin}/sponsor/return?purchase=${purchase.sponsorship_public_id}`, origin,
    });
    if (checkout.provider === "lemonsqueezy") {
      const update = await supabase.from("sponsorships").update({ lemon_checkout_id: checkout.providerCheckoutId, updated_at: now.toISOString() }).eq("id", purchase.sponsorship_id).eq("status", "checkout_pending");
      if (update.error) throw update.error;
    }
    const response = NextResponse.json({ checkoutUrl: checkout.url, purchase: purchase.ticket_public_id, paymentProvider: checkout.provider });
    attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
    return response;
  } catch {
    await supabase.rpc("cancel_ticket_reservation", { p_sponsorship_id: purchase.sponsorship_id, p_now: new Date().toISOString() });
    return apiError(503, "UNAVAILABLE", "Checkout could not be created. Please try again.");
  }
}
