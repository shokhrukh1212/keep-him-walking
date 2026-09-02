import { NextRequest, NextResponse } from "next/server";
import { trackServerEvent } from "@/lib/analytics/server";
import { visitorFromRequest, attachVisitorCookie } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { createLemonCheckout } from "@/lib/payments/checkout";
import { serverRuntimeConfig } from "@/lib/config/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { sponsorCheckoutBodySchema } from "@/lib/validation/api";
import { apiError, readLimitedJson } from "@/lib/validation/http";
import { hasTrustedOrigin } from "@/lib/validation/origin";

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return apiError(403, "FORBIDDEN", "Untrusted request origin.");
  let body: unknown;
  try { body = await readLimitedJson(request); } catch { return apiError(400, "BAD_REQUEST", "Invalid checkout request."); }
  const parsed = sponsorCheckoutBodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "UNPROCESSABLE", "Sponsor details are incomplete.");
  const supabase = getServerSupabase();
  if (!supabase) return apiError(503, "UNAVAILABLE", "Sponsorship is not configured.");
  const visitor = visitorFromRequest(request);
  const visitorHash = hashOpaqueValue(visitor.visitorId);
  const { data: allowed } = await supabase.rpc("consume_mutation_rate_limit", {
    p_key_hash: visitorHash, p_action: "sponsor_checkout", p_limit: 5, p_window_seconds: 900, p_now: new Date().toISOString(),
  });
  if (!allowed) return apiError(429, "RATE_LIMITED", "Please wait before starting another checkout.");
  const config = serverRuntimeConfig();
  if (!config.phase2Enabled) return apiError(503, "UNAVAILABLE", "Phase 2 preview is disabled.");
  const now = new Date();
  const testMode = process.env.LEMON_SQUEEZY_TEST_MODE !== "false";
  const { data, error } = await supabase.rpc("reserve_sponsor_slot", {
    p_slot_id: parsed.data.slotId,
    p_sponsor_name: parsed.data.sponsorName,
    p_sponsor_email: parsed.data.sponsorEmail,
    p_test_mode: testMode,
    p_now: now.toISOString(),
    p_reservation_minutes: config.sponsorReservationMinutes,
  });
  if (error || !data) return apiError(409, "CONFLICT", "That country-day is no longer available.");
  const sponsorship = Array.isArray(data) ? data[0] : data;
  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const checkout = await createLemonCheckout({
      sponsorshipId: String(sponsorship.id),
      slotId: parsed.data.slotId,
      email: parsed.data.sponsorEmail,
      priceCents: Number(sponsorship.expected_price_cents),
      expiresAt: new Date(now.getTime() + config.sponsorReservationMinutes * 60_000).toISOString(),
      returnUrl: `${origin}/sponsor/return?purchase=${sponsorship.public_id}`,
    });
    const { error: updateError } = await supabase.from("sponsorships")
      .update({ lemon_checkout_id: checkout.id, updated_at: new Date().toISOString() })
      .eq("id", sponsorship.id).eq("status", "checkout_pending");
    if (updateError) throw updateError;
    trackServerEvent("sponsor_checkout_started", String(sponsorship.id), {
      sponsorship_id: String(sponsorship.id), slot_id: parsed.data.slotId, test_mode: testMode,
    });
    const response = NextResponse.json({ checkoutUrl: checkout.url, purchase: sponsorship.public_id });
    attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
    return response;
  } catch {
    await Promise.all([
      supabase.from("sponsorships").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", sponsorship.id),
      supabase.from("sponsor_slots").update({ status: "available", reserved_by: null, reserved_until: null, updated_at: new Date().toISOString() }).eq("id", parsed.data.slotId),
    ]);
    return apiError(503, "UNAVAILABLE", "Checkout could not be created. Please try again.");
  }
}
