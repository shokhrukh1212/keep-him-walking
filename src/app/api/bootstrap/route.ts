import { after, NextRequest, NextResponse } from "next/server";
import { BootstrapRateLimitError, liveBootstrapSnapshot } from "@/lib/bootstrap/server";
import { serverRuntimeConfig } from "@/lib/config/server";
import { attachVisitorCookie, visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { RATE_LIMITS, consumeRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { withRouteTelemetry } from "@/lib/observability/route";
import { refreshWeatherIfStale } from "@/lib/weather/refresh";

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
        { code: "NO_ACTIVE_DAY", error: "Live journey is not configured or no country-day is active." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
      attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
      return response;
    }
    // The reading the visitor just received is the one already stored. If it has
    // aged out, refresh it after the response so nobody waits on Open-Meteo.
    after(() => refreshWeatherIfStale(
      snapshot.countryDay.id,
      snapshot.countryDay.scenePackId,
      snapshot.weather,
    ));
    const response = NextResponse.json({ ...snapshot, firstVisit: visitor.isNew }, {
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
      { code: "LIVE_UNAVAILABLE", error: "The live snapshot is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
    attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
    return response;
  }
}

export const GET = withRouteTelemetry("bootstrap", handleGet);
