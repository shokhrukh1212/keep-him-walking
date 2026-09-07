import { NextRequest, NextResponse } from "next/server";
import { trackServerEvent } from "@/lib/analytics/server";
import { visitorFromRequest, attachVisitorCookie } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { createPostcard } from "@/lib/postcards/service";
import { getServerSupabase } from "@/lib/supabase/server";
import { postcardBodySchema } from "@/lib/validation/api";
import { apiError, readLimitedJson } from "@/lib/validation/http";
import { hasTrustedOrigin } from "@/lib/validation/origin";
import { RATE_LIMITS, consumeRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { withRouteTelemetry } from "@/lib/observability/route";

async function handlePost(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return apiError(403, "FORBIDDEN", "Untrusted request origin.");
  let body: unknown;
  try { body = await readLimitedJson(request); } catch { return apiError(400, "BAD_REQUEST", "Invalid postcard request."); }
  const parsed = postcardBodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "UNPROCESSABLE", "Invalid country-day.");
  const visitor = visitorFromRequest(request);
  const visitorHash = hashOpaqueValue(visitor.visitorId);
  const supabase = getServerSupabase();
  if (!supabase) return apiError(503, "UNAVAILABLE", "Postcards are not configured.");
  const limit = await consumeRateLimit(visitorHash, RATE_LIMITS.postcard);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);
  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const postcard = await createPostcard({ countryDayId: parsed.data.countryDayId, visitorHash, origin });
    if (!postcard.idempotent) trackServerEvent("postcard_created", visitorHash, { country_day_id: parsed.data.countryDayId });
    const response = NextResponse.json(postcard);
    attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "POSTCARD_LOCKED") return apiError(403, "FORBIDDEN", "Keep watching to unlock this postcard.");
    if (error instanceof Error && error.message === "COUNTRY_DAY_NOT_FOUND") return apiError(404, "NOT_FOUND", "Country-day not found.");
    return apiError(503, "UNAVAILABLE", "The postcard could not be prepared.");
  }
}

export const POST = withRouteTelemetry("postcards", handlePost);
