import { NextRequest, NextResponse } from "next/server";
import { getCountryPack, registeredCountryPacks } from "@/content/countries/registry";
import { confirmedWeatherAgeSeconds, providerReadiness } from "@/lib/health/readiness";
import { packPrewarmPaths, prewarmUrl } from "@/lib/launch/prewarm";
import { getServerSupabase } from "@/lib/supabase/server";
import { WEATHER_TTL_SECONDS } from "@/lib/weather/open-meteo";

export const dynamic = "force-dynamic";

async function assetReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(3_000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const started = performance.now();
  const now = new Date();
  const supabase = getServerSupabase();
  let database: "ready" | "unconfigured" | "unavailable" = supabase ? "unavailable" : "unconfigured";
  let scenePackId = "tashkent-v5";
  let weather: unknown = null;
  let launchAt: string | null = null;
  if (supabase) {
    const { data: journey, error } = await supabase.from("journeys")
      .select("id,launch_at").eq("phase2_enabled", true).in("status", ["preview", "active"])
      .order("starts_at", { ascending: false }).limit(1).maybeSingle();
    database = error ? "unavailable" : "ready";
    launchAt = journey?.launch_at ?? null;
    if (journey) {
      const { data: days } = await supabase.from("country_days")
        .select("id,scene_pack_id,journey_runtime(weather)")
        .eq("journey_id", journey.id).gt("ends_at", now.toISOString())
        .order("starts_at", { ascending: true }).limit(1);
      const day = days?.[0];
      if (day) {
        scenePackId = day.scene_pack_id;
        const runtime = Array.isArray(day.journey_runtime) ? day.journey_runtime[0] : day.journey_runtime;
        weather = runtime?.weather ?? null;
      }
    }
  }
  const packs = registeredCountryPacks();
  const pack = getCountryPack(scenePackId) ?? getCountryPack("tashkent-v5");
  const representativePath = pack ? packPrewarmPaths(pack)[0] : null;
  let assetUrlValue: string | null = null;
  let assetBase: "ready" | "unavailable" = "unavailable";
  if (representativePath) {
    try {
      assetUrlValue = prewarmUrl(
        representativePath,
        process.env.ASSET_BASE_URL,
        process.env.PRODUCTION_APP_URL || request.nextUrl.origin,
      );
      assetBase = await assetReachable(assetUrlValue) ? "ready" : "unavailable";
    } catch {
      assetBase = "unavailable";
    }
  }
  const weatherAgeSeconds = confirmedWeatherAgeSeconds(weather, now);
  const weatherStatus = weatherAgeSeconds === null
    ? "missing"
    : weatherAgeSeconds <= WEATHER_TTL_SECONDS * 2 ? "fresh" : "stale";
  const providers = providerReadiness(process.env);
  const contentReady = packs.length >= 15 && Boolean(pack);
  const ready = database === "ready"
    && contentReady
    && assetBase === "ready"
    && weatherStatus === "fresh"
    && providers.weather === "ready"
    && providers.payments === "ready";
  const launchState = process.env.VERCEL_ENV === "production" && process.env.LAUNCH_ENABLED !== "true"
    ? "disabled"
    : launchAt && new Date(launchAt).getTime() > now.getTime() ? "armed" : "live";
  return NextResponse.json({
    status: ready ? "ready" : "degraded",
    checks: {
      database,
      content: contentReady ? "ready" : "unavailable",
      registeredPacks: packs.length,
      providers,
      weather: { status: weatherStatus, ageSeconds: weatherAgeSeconds },
      assetBase: {
        status: assetBase,
        origin: assetUrlValue ? new URL(assetUrlValue).origin : null,
      },
      launch: { status: launchState, at: launchAt },
    },
    latencyMs: Math.round(performance.now() - started),
    release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || "local",
  }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
