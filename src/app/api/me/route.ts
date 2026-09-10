import { NextRequest, NextResponse } from "next/server";
import { attachVisitorCookie, visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { withRouteTelemetry } from "@/lib/observability/route";
import { loadVisitorPassport } from "@/lib/season/passport";
import { RATE_LIMITS, consumeRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Everything about *this* visitor and nothing about the world.
 *
 * Keeping the private slice on its own route is what lets /api/bootstrap become
 * cacheable later: this response carries the visitor cookie and must never be
 * stored by a shared cache.
 */
async function handleGet(request: NextRequest) {
  const visitor = visitorFromRequest(request);
  const visitorHash = hashOpaqueValue(visitor.visitorId);
  const limit = await consumeRateLimit(visitorHash, RATE_LIMITS.me);
  if (limit.configured && !limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds, "Too many passport refreshes.");

  const passport = await loadVisitorPassport(visitorHash);
  const response = NextResponse.json(
    { firstVisit: visitor.isNew, passport },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
  return response;
}

export const GET = withRouteTelemetry("me", handleGet);
