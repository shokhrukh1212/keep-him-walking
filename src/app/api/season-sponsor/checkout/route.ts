import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sponsorshipMode } from "@/lib/config/sponsorship";
import { visitorFromRequest, attachVisitorCookie } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { withRouteTelemetry } from "@/lib/observability/route";
import { startSeasonCheckout } from "@/lib/payments/season";
import { RATE_LIMITS, consumeRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { apiError, readLimitedJson } from "@/lib/validation/http";
import { hasTrustedOrigin } from "@/lib/validation/origin";
import { PUBLIC_SPONSOR_SALES_ENABLED } from "@/lib/config/features";

const bodySchema = z.object({ publicId: z.uuid() }).strict();

/** Payment for an approved request only; the server holds the season and names the price. */
async function handlePost(request: NextRequest) {
  if (!PUBLIC_SPONSOR_SALES_ENABLED) return apiError(503, "UNAVAILABLE", "New sponsor purchases are paused.");
  if (sponsorshipMode() !== "season") return apiError(404, "NOT_FOUND", "Season sponsorship is not offered.");
  if (!hasTrustedOrigin(request)) return apiError(403, "FORBIDDEN", "Untrusted request origin.");
  let body: unknown;
  try {
    body = await readLimitedJson(request, 1_024);
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid checkout request.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "UNPROCESSABLE", "Invalid checkout request.");
  const visitor = visitorFromRequest(request);
  const limit = await consumeRateLimit(hashOpaqueValue(`season-checkout:${visitor.visitorId}`), RATE_LIMITS.seasonSponsorCheckout);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds, "Please wait before starting another checkout.");

  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).origin;
  const result = await startSeasonCheckout(parsed.data.publicId, origin);
  const respond = (response: NextResponse) => {
    response.headers.set("Cache-Control", "no-store");
    attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
    return response;
  };
  switch (result.state) {
    case "redirect":
      return respond(NextResponse.json({ checkoutUrl: result.url }));
    case "disabled":
      return respond(apiError(503, "UNAVAILABLE", "Checkout is not open yet. Your request stays on file and nothing was charged."));
    case "not_found":
      return respond(apiError(404, "NOT_FOUND", "That request was not found."));
    case "paid":
      return respond(apiError(409, "CONFLICT", "This request is already paid."));
    case "not_approved":
      return respond(apiError(409, "CONFLICT", "This request has not been approved for payment."));
    case "closed":
      return respond(apiError(409, "CONFLICT", "Booking for this season has closed."));
    case "schedule_changed":
      return respond(apiError(409, "CONFLICT", "The season dates changed after this request was submitted. Nothing was charged; contact us before continuing."));
    case "quote_changed":
      return respond(apiError(409, "CONFLICT", "The checkout price no longer matches this request's saved quote. Nothing was charged; contact us before continuing."));
    case "unavailable":
      return respond(apiError(409, "CONFLICT", "Another sponsor is completing checkout for this season. Please try again later."));
    default:
      return respond(apiError(503, "UNAVAILABLE", "Checkout could not be started. Nothing was charged."));
  }
}

export const POST = withRouteTelemetry("season_sponsor_checkout", handlePost);
