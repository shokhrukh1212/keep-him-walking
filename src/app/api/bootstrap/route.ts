import { NextRequest, NextResponse } from "next/server";
import { BootstrapRateLimitError, liveBootstrapSnapshot } from "@/lib/bootstrap/server";
import { serverRuntimeConfig } from "@/lib/config/server";
import { attachVisitorCookie, visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { RATE_LIMITS, consumeRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { withRouteTelemetry } from "@/lib/observability/route";

export const dynamic = "force-dynamic";

async function handleGet(request: NextRequest) {
  const visitor = visitorFromRequest(request);
  try {
    const visitorHash = hashOpaqueValue(visitor.visitorId);
    if (!serverRuntimeConfig().phase2Enabled) {
      const limit = await consumeRateLimit(visitorHash, RATE_LIMITS.bootstrap);
      if (limit.configured && !limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds, "Too many refresh attempts.");
    }
    const snapshot = await liveBootstrapSnapshot(visitorHash);
    if (!snapshot) {
      const response = NextResponse.json(
        { error: "Live journey is not configured or no country-day is active." },
        { status: 503 },
      );
      attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
      return response;
    }
    const response = NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
    attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
    return response;
  } catch (cause) {
    if (cause instanceof BootstrapRateLimitError) {
      return rateLimitedResponse(RATE_LIMITS.bootstrap.windowSeconds, "Too many refresh attempts.");
    }
    if (process.env.NODE_ENV !== "production") {
      console.error("Live bootstrap failed", cause);
    }
    const response = NextResponse.json(
      { error: "The live snapshot is temporarily unavailable." },
      { status: 503 },
    );
    attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
    return response;
  }
}

export const GET = withRouteTelemetry("bootstrap", handleGet);
