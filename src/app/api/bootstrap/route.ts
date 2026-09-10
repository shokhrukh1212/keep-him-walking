import { after, NextResponse } from "next/server";
import { BootstrapRateLimitError, PUBLIC_BOOTSTRAP_KEY, liveBootstrapSnapshot } from "@/lib/bootstrap/server";
import { serverRuntimeConfig } from "@/lib/config/server";
import { hashOpaqueValue } from "@/lib/identity/server";
import { RATE_LIMITS, consumeRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { withRouteTelemetry } from "@/lib/observability/route";
import { refreshWeatherIfStale } from "@/lib/weather/refresh";

export const dynamic = "force-dynamic";

/**
 * The world, and only the world.
 *
 * This response is identical for every visitor and carries no cookie, so a
 * shared cache can hold it for a few seconds and absorb a viral minute that
 * would otherwise be one database read per arrival. Everything about *this*
 * visitor — the ballot they cast, their postcard, their passport, whether this
 * is their first visit — is served by /api/me instead.
 */
const PUBLIC_CACHE = "public, s-maxage=3, stale-while-revalidate=10";

async function handleGet() {
  const publicHash = hashOpaqueValue(PUBLIC_BOOTSTRAP_KEY);
  try {
    if (!serverRuntimeConfig().phase2Enabled) {
      const limit = await consumeRateLimit(publicHash, RATE_LIMITS.bootstrapPublic);
      if (limit.configured && !limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds, "Too many refresh attempts.");
    }
    const snapshot = await liveBootstrapSnapshot(publicHash);
    if (!snapshot) {
      return NextResponse.json(
        { code: "NO_ACTIVE_DAY", error: "Live journey is not configured or no country-day is active." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    // The reading the visitor just received is the one already stored. If it has
    // aged out, refresh it after the response so nobody waits on Open-Meteo.
    after(() => refreshWeatherIfStale(
      snapshot.countryDay.id,
      snapshot.countryDay.scenePackId,
      snapshot.weather,
    ));
    return NextResponse.json(snapshot, { headers: { "Cache-Control": PUBLIC_CACHE } });
  } catch (cause) {
    if (cause instanceof BootstrapRateLimitError) {
      return rateLimitedResponse(RATE_LIMITS.bootstrapPublic.windowSeconds, "Too many refresh attempts.");
    }
    if (process.env.NODE_ENV !== "production") {
      console.error("Live bootstrap failed", cause);
    }
    return NextResponse.json(
      { code: "LIVE_UNAVAILABLE", error: "The live snapshot is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const GET = withRouteTelemetry("bootstrap", handleGet);
