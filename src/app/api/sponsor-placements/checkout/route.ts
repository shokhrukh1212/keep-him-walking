import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { placementCheckoutState, placementProviderProductId, PLACEMENT_PROVISIONAL_HOLD_MINUTES } from "@/lib/config/placements";
import { serverRuntimeConfig } from "@/lib/config/server";
import { attachVisitorCookie, visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { startPlacementCheckout } from "@/lib/payments/placements";
import { RATE_LIMITS, consumeRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { clientAddress } from "@/lib/security/client-address";
import { PLACEMENT_ORDER_COOKIE, PLACEMENT_ORDER_COOKIE_MAX_AGE } from "@/lib/sponsors/placement-cookie";
import { prepareSponsorLogo, SponsorLogoError, SPONSOR_LOGO_MAX_BYTES } from "@/lib/sponsors/logo";
import { placementRequestFields, placementRequestSchema } from "@/lib/sponsors/placement-request";
import { getServerSupabase } from "@/lib/supabase/server";
import { apiError } from "@/lib/validation/http";
import { hasTrustedOrigin } from "@/lib/validation/origin";
import { PUBLIC_SPONSOR_SALES_ENABLED } from "@/lib/config/features";

const MAX_FORM_BYTES = SPONSOR_LOGO_MAX_BYTES + 32_768;

export async function POST(request: NextRequest) {
  if (!PUBLIC_SPONSOR_SALES_ENABLED) return apiError(503, "UNAVAILABLE", "New sponsor purchases are paused.");
  if (!hasTrustedOrigin(request)) return apiError(403, "FORBIDDEN", "Untrusted request origin.");
  const gate = placementCheckoutState();
  if (!gate.enabled) return apiError(503, "UNAVAILABLE", "Sponsor checkout is waiting for payment-provider approval.");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > MAX_FORM_BYTES) return apiError(413, "PAYLOAD_TOO_LARGE", "The logo file is too large.");
  const visitor = visitorFromRequest(request);
  const [visitorLimit, networkLimit] = await Promise.all([
    consumeRateLimit(hashOpaqueValue(`placement-checkout:${visitor.visitorId}`), RATE_LIMITS.placementCheckout),
    consumeRateLimit(hashOpaqueValue(`placement-checkout-network:${clientAddress(request.headers)}`), RATE_LIMITS.placementCheckoutNetwork),
  ]);
  if (!visitorLimit.allowed || !networkLimit.allowed) {
    return rateLimitedResponse(Math.max(visitorLimit.retryAfterSeconds, networkLimit.retryAfterSeconds));
  }
  let form: FormData;
  try { form = await request.formData(); } catch { return apiError(400, "BAD_REQUEST", "Invalid sponsor form."); }
  const parsed = placementRequestSchema.safeParse(placementRequestFields(form));
  if (!parsed.success) return apiError(422, "UNPROCESSABLE", parsed.error.issues[0]?.message ?? "Sponsor details are incomplete.");
  const logo = form.get("logo");
  if (!(logo instanceof File)) return apiError(422, "UNPROCESSABLE", "Choose a PNG, JPEG or WebP logo.");
  const supabase = getServerSupabase();
  if (!supabase) return apiError(503, "UNAVAILABLE", "Sponsorship is not configured.");
  const { data: slot, error: slotError } = await supabase.from("journey_sponsor_slots")
    .select("id,tier,state").eq("id", parsed.data.slotId).maybeSingle();
  if (slotError || !slot || slot.state !== "available" || (slot.tier !== "regular" && slot.tier !== "featured")) {
    return apiError(409, "CONFLICT", "That sponsor place is no longer available.");
  }
  let prepared: Awaited<ReturnType<typeof prepareSponsorLogo>>;
  try {
    prepared = await prepareSponsorLogo(new Uint8Array(await logo.arrayBuffer()), { fit: "crop" });
  } catch (error) {
    const message = error instanceof SponsorLogoError && error.code === "LOGO_SIZE"
      ? "Choose a logo no larger than 1 MB."
      : "Choose a still PNG, JPEG or WebP logo at least 64 px wide and tall.";
    return apiError(422, "UNPROCESSABLE", message);
  }
  const config = serverRuntimeConfig();
  const privatePath = `placements/pending/${randomUUID()}.webp`;
  const uploaded = await supabase.storage.from(config.sponsorPrivateBucket)
    .upload(privatePath, prepared.webp, { contentType: "image/webp", cacheControl: "0", upsert: false });
  if (uploaded.error) return apiError(503, "UNAVAILABLE", "The logo could not be stored. Please try again.");
  const now = new Date();
  const reserved = await supabase.rpc("reserve_journey_sponsor_slot", {
    p_slot_id: parsed.data.slotId,
    p_buyer_hash: hashOpaqueValue(`placement-buyer:${visitor.visitorId}`),
    p_product_url: parsed.data.productUrl,
    p_product_name: parsed.data.productName,
    p_description: parsed.data.description,
    p_private_logo_path: privatePath,
    p_logo_fit: "crop",
    p_rights_confirmed: true,
    p_provider: gate.provider,
    p_provider_product_id: placementProviderProductId(slot.tier, gate.provider),
    p_test_mode: gate.testMode,
    p_provisional_minutes: PLACEMENT_PROVISIONAL_HOLD_MINUTES,
    p_now: now.toISOString(),
  });
  const reservation = reserved.data as { state?: string; orderId?: string } | null;
  if (reserved.error || reservation?.state !== "reserved" || !reservation.orderId) {
    await supabase.storage.from(config.sponsorPrivateBucket).remove([privatePath]);
    return apiError(409, "CONFLICT", "That sponsor place is no longer available.");
  }
  const checkout = await startPlacementCheckout(supabase, reservation.orderId, process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin, now);
  if (checkout.state !== "checkout") {
    await supabase.storage.from(config.sponsorPrivateBucket).remove([privatePath]);
    return apiError(503, "UNAVAILABLE", "Checkout could not be started. Please try again.");
  }
  const response = NextResponse.json({ checkoutUrl: checkout.checkoutUrl, purchase: checkout.publicId,
    paymentProvider: gate.provider, testMode: gate.testMode, expiresAt: checkout.expiresAt });
  response.cookies.set(PLACEMENT_ORDER_COOKIE, checkout.publicId, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: PLACEMENT_ORDER_COOKIE_MAX_AGE,
  });
  attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
  return response;
}
