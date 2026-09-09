import { NextRequest, NextResponse } from "next/server";
import { serverRuntimeConfig } from "@/lib/config/server";
import { attachVisitorCookie, visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { nextHeartbeatDelay } from "@/lib/presence";
import { findCurrentCountryDay } from "@/lib/bootstrap/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getCountryPack } from "@/content/countries/registry";
import { COUNTRY_HEADER, countryFromHeader } from "@/lib/countries/header";
import { heartbeatBodySchema } from "@/lib/validation/api";
import { hasTrustedOrigin } from "@/lib/validation/origin";
import { RATE_LIMITS, consumeRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { withRouteTelemetry } from "@/lib/observability/route";

async function handlePost(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Untrusted request origin." }, { status: 403 });
  }
  const parsed = heartbeatBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid heartbeat." }, { status: 400 });
  }
  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Presence is not configured." }, { status: 503 });
  }
  const now = new Date();
  const countryDay = await findCurrentCountryDay(now);
  if (!countryDay) {
    return NextResponse.json({ error: "No country-day is active." }, { status: 409 });
  }
  const visitor = visitorFromRequest(request);
  const visitorHash = hashOpaqueValue(visitor.visitorId);
  const limit = await consumeRateLimit(visitorHash, RATE_LIMITS.presence);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds, "Presence updates are arriving too quickly.");
  const config = serverRuntimeConfig();
  const pack = getCountryPack(countryDay.scene_pack_id);
  const paceEnabled = pack?.schemaVersion === 2 || pack?.schemaVersion === 3;
  // The edge tells us the country. The IP behind it is never read or stored.
  const countryCode = countryFromHeader(request.headers.get(COUNTRY_HEADER));
  const heartbeatArguments = {
    p_country_day_id: countryDay.id,
    p_visitor_hash: visitorHash,
    p_session_hash: hashOpaqueValue(parsed.data.sessionId),
    p_state: parsed.data.state,
    p_scene_ready: parsed.data.sceneReady,
    p_now: now.toISOString(),
    p_ttl_seconds: config.presenceTtlSeconds,
    p_steps_per_second: config.stepsPerActiveSecond,
  };
  const { data, error } = await supabase.rpc(
    paceEnabled ? "record_presence_heartbeat_v5" : "record_presence_heartbeat_v2",
    paceEnabled
      ? {
          ...heartbeatArguments,
          p_pace_cap: config.paceCap,
          p_first_watcher_gap_seconds: config.firstWatcherGapSeconds,
          p_country_code: countryCode,
        }
      : heartbeatArguments,
  );
  if (error) {
    return NextResponse.json({ error: "Presence update failed." }, { status: 503 });
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !Number.isFinite(Number(row.out_active_viewers)) || !row.out_accounted_at) {
    return NextResponse.json({ error: "Presence confirmation unavailable." }, {status:503});
  }
  const activeViewers = Number(row?.out_active_viewers ?? 0);
  const response = NextResponse.json({
    countryDayId: countryDay.id,
    serverNow: countryDay.story_now ?? now.toISOString(),
    realServerNow: String(row?.out_accounted_at ?? now.toISOString()),
    storyScale: countryDay.story_scale ?? 1,
    activeViewers,
    walking: activeViewers > 0,
    globalSteps: Number(row?.out_global_steps ?? 0),
    visitorActiveSeconds: Number(row?.out_visitor_active_seconds ?? 0),
    ttlSeconds: config.presenceTtlSeconds,
    nextHeartbeatInMs: nextHeartbeatDelay(),
    globalActiveSeconds: Number(row?.out_global_active_seconds ?? 0),
    globalDistanceMetres: Number(row?.out_global_distance_metres ?? 0),
    paceRate: Number(row?.out_pace_rate ?? 1),
    routeAuthoritativeAt: String(row?.out_accounted_at ?? now.toISOString()),
    waitingSince: row?.out_waiting_since ? String(row.out_waiting_since) : null,
    wokeHim: row?.out_woke_him === true,
    countryCode: String(row?.out_country_code ?? countryCode),
  });
  attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
  return response;
}

export const POST = withRouteTelemetry("presence_heartbeat", handlePost);
