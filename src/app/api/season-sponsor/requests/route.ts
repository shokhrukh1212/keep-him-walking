import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { trackServerEvent } from "@/lib/analytics/server";
import { serverRuntimeConfig } from "@/lib/config/server";
import { seasonCheckoutState, seasonSaleCutoffHours, sponsorshipMode } from "@/lib/config/sponsorship";
import { attachVisitorCookie, visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { withRouteTelemetry } from "@/lib/observability/route";
import { startSeasonCheckout } from "@/lib/payments/season";
import { clientAddress } from "@/lib/security/client-address";
import { RATE_LIMITS, consumeRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { SPONSOR_LOGO_MAX_BYTES, SponsorLogoError, prepareSponsorLogo } from "@/lib/sponsors/logo";
import { seasonRequestFields, seasonSponsorRequestSchema } from "@/lib/sponsors/season-request";
import { getServerSupabase } from "@/lib/supabase/server";
import { apiError } from "@/lib/validation/http";
import { hasTrustedOrigin } from "@/lib/validation/origin";

/** The logo plus a few kilobytes of text fields. */
const MAX_REQUEST_BYTES = SPONSOR_LOGO_MAX_BYTES + 32_768;

type Supabase = NonNullable<ReturnType<typeof getServerSupabase>>;

/**
 * Checkout without a waiting room. While checkout is open the submitted logo is copied
 * once to its immutable public path, the request is approved and the season is held for
 * the provider checkout, so the sponsor pays in the same visit.
 *
 * Nothing appears beside the journey until the provider confirms the payment, and the
 * private review and removal actions stay available afterwards. Every failure here
 * returns null: the request is saved, nothing is charged, and the requester continues
 * from their private link.
 */
async function openCheckout(
  supabase: Supabase,
  booking: { id: string; publicId: string; journeyId: string; logoPath: string },
  seasonNumber: number,
  origin: string,
): Promise<string | null> {
  if (!seasonCheckoutState(process.env, seasonNumber).enabled) return null;
  const config = serverRuntimeConfig();
  const { data: logo, error: downloadError } = await supabase.storage
    .from(config.sponsorPrivateBucket).download(booking.logoPath);
  if (downloadError || !logo) return null;
  const publicPath = `season/${booking.journeyId}/${booking.id}-${Date.now()}.webp`;
  const { error: uploadError } = await supabase.storage.from(config.sponsorPublicBucket)
    .upload(publicPath, logo, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (uploadError) return null;
  const { error } = await supabase.rpc("review_season_sponsorship", {
    p_id: booking.id,
    p_decision: "approved",
    p_public_logo_path: publicPath,
    p_now: new Date().toISOString(),
    p_cutoff_hours: seasonSaleCutoffHours(),
  });
  if (error) {
    await supabase.storage.from(config.sponsorPublicBucket).remove([publicPath]);
    return null;
  }
  const checkout = await startSeasonCheckout(booking.publicId, origin);
  return checkout.state === "redirect" ? checkout.url : null;
}

/**
 * A genuine sponsorship request for the season on offer. It stores the material, and
 * while checkout is open it opens the provider's payment page in the same call. Until
 * that provider confirms a payment nothing is charged, published or reserved.
 */
async function handlePost(request: NextRequest) {
  if (sponsorshipMode() !== "season") return apiError(404, "NOT_FOUND", "Season sponsorship is not offered.");
  if (!hasTrustedOrigin(request)) return apiError(403, "FORBIDDEN", "Untrusted request origin.");
  if (Number(request.headers.get("content-length") ?? "0") > MAX_REQUEST_BYTES) {
    return apiError(413, "PAYLOAD_TOO_LARGE", "The logo must be 1 MB or smaller.");
  }
  const supabase = getServerSupabase();
  if (!supabase) return apiError(503, "UNAVAILABLE", "Sponsorship requests are not configured.");
  const visitor = visitorFromRequest(request);
  const [visitorLimit, networkLimit] = await Promise.all([
    consumeRateLimit(hashOpaqueValue(`season-request:${visitor.visitorId}`), RATE_LIMITS.seasonSponsorRequest),
    consumeRateLimit(hashOpaqueValue(`season-request-network:${clientAddress(request.headers)}`), RATE_LIMITS.seasonSponsorRequestNetwork),
  ]);
  if (!visitorLimit.allowed || !networkLimit.allowed) {
    return rateLimitedResponse(
      Math.max(visitorLimit.retryAfterSeconds, networkLimit.retryAfterSeconds),
      "Please wait before sending another request.",
    );
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid request.");
  }
  const parsed = seasonSponsorRequestSchema.safeParse(seasonRequestFields(form));
  if (!parsed.success) {
    return apiError(422, "UNPROCESSABLE", parsed.error.issues[0]?.message ?? "Check the request details.");
  }
  const logo = form.get("logo");
  if (!(logo instanceof Blob) || logo.size === 0 || logo.size > SPONSOR_LOGO_MAX_BYTES) {
    return apiError(422, "UNPROCESSABLE", "Attach a PNG, JPEG or WebP logo of 1 MB or smaller.");
  }
  let prepared: Awaited<ReturnType<typeof prepareSponsorLogo>>;
  try {
    prepared = await prepareSponsorLogo(new Uint8Array(await logo.arrayBuffer()));
  } catch (cause) {
    return apiError(422, "UNPROCESSABLE", cause instanceof SponsorLogoError && cause.code === "LOGO_DIMENSIONS"
      ? "The logo must be between 64 and 4,096 pixels on each side."
      : "Attach a PNG, JPEG or WebP logo of 1 MB or smaller.");
  }

  const bucket = serverRuntimeConfig().sponsorPrivateBucket;
  const path = `season/${parsed.data.seasonId}/${randomUUID()}.webp`;
  const upload = await supabase.storage.from(bucket).upload(path, prepared.webp, { contentType: "image/webp", upsert: false });
  if (upload.error) return apiError(503, "UNAVAILABLE", "The logo could not be stored. Please try again.");
  const { data, error } = await supabase.rpc("submit_season_sponsorship", {
    p_journey_id: parsed.data.seasonId,
    p_product_name: parsed.data.productName,
    p_website_url: parsed.data.website,
    p_description: parsed.data.description,
    p_contact_name: parsed.data.contactName,
    p_contact_email: parsed.data.contactEmail,
    p_private_logo_path: path,
    p_rights_confirmed: true,
    p_now: new Date().toISOString(),
    p_cutoff_hours: seasonSaleCutoffHours(),
  });
  if (error) {
    await supabase.storage.from(bucket).remove([path]);
    return error.code === "55000"
      ? apiError(409, "CONFLICT", "That season is no longer open for sponsorship.")
      : apiError(422, "UNPROCESSABLE", "Check the request details.");
  }
  const result = data as { id: string; publicId: string };
  trackServerEvent("season_sponsor_requested", result.id, { season_id: parsed.data.seasonId });
  const { data: season } = await supabase.from("journeys")
    .select("season_number").eq("id", parsed.data.seasonId).maybeSingle();
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).origin;
  const checkoutUrl = season
    ? await openCheckout(
      supabase,
      { id: result.id, publicId: result.publicId, journeyId: parsed.data.seasonId, logoPath: path },
      Number(season.season_number),
      origin,
    )
    : null;
  const response = NextResponse.json(
    { submitted: true, reference: result.publicId, statusUrl: `/sponsors/request/${result.publicId}`, checkoutUrl },
    { headers: { "Cache-Control": "no-store" } },
  );
  attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
  return response;
}

export const POST = withRouteTelemetry("season_sponsor_request", handlePost);
