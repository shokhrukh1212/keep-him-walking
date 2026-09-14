import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { trackServerEvent } from "@/lib/analytics/server";
import { serverRuntimeConfig } from "@/lib/config/server";
import { seasonSaleCutoffHours, sponsorshipMode } from "@/lib/config/sponsorship";
import { attachVisitorCookie, visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { withRouteTelemetry } from "@/lib/observability/route";
import { clientAddress } from "@/lib/security/client-address";
import { RATE_LIMITS, consumeRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { SPONSOR_LOGO_MAX_BYTES, SponsorLogoError, prepareSponsorLogo } from "@/lib/sponsors/logo";
import { seasonRequestFields, seasonSponsorRequestSchema } from "@/lib/sponsors/season-request";
import { getServerSupabase } from "@/lib/supabase/server";
import { apiError } from "@/lib/validation/http";
import { hasTrustedOrigin } from "@/lib/validation/origin";

/** The logo plus a few kilobytes of text fields. */
const MAX_REQUEST_BYTES = SPONSOR_LOGO_MAX_BYTES + 32_768;

/**
 * A genuine sponsorship request for the season on offer. It stores the material
 * privately for manual review, takes no payment and reserves nothing.
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
  const response = NextResponse.json(
    { submitted: true, reference: result.publicId, statusUrl: `/sponsors/request/${result.publicId}` },
    { headers: { "Cache-Control": "no-store" } },
  );
  attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
  return response;
}

export const POST = withRouteTelemetry("season_sponsor_request", handlePost);
