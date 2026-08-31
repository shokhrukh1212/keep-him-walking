import { NextRequest, NextResponse } from "next/server";
import { serverRuntimeConfig } from "@/lib/config/server";
import { attachVisitorCookie, visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { nextHeartbeatDelay } from "@/lib/presence";
import { findCurrentCountryDay } from "@/lib/bootstrap/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { heartbeatBodySchema } from "@/lib/validation/api";
import { hasTrustedOrigin } from "@/lib/validation/origin";

export async function POST(request: NextRequest) {
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
  const config = serverRuntimeConfig();
  const { data, error } = await supabase.rpc("record_presence_heartbeat", {
    p_country_day_id: countryDay.id,
    p_visitor_hash: hashOpaqueValue(visitor.visitorId),
    p_session_hash: hashOpaqueValue(parsed.data.sessionId),
    p_state: parsed.data.state,
    p_scene_ready: parsed.data.sceneReady,
    p_now: now.toISOString(),
    p_ttl_seconds: config.presenceTtlSeconds,
    p_steps_per_second: config.stepsPerActiveSecond,
  });
  if (error) {
    return NextResponse.json({ error: "Presence update failed." }, { status: 503 });
  }
  const row = Array.isArray(data) ? data[0] : data;
  const activeViewers = Number(row?.out_active_viewers ?? 0);
  const response = NextResponse.json({
    serverNow: String(row?.out_accounted_at ?? now.toISOString()),
    activeViewers,
    walking: activeViewers > 0,
    globalSteps: Number(row?.out_global_steps ?? 0),
    visitorActiveSeconds: Number(row?.out_visitor_active_seconds ?? 0),
    ttlSeconds: config.presenceTtlSeconds,
    nextHeartbeatInMs: nextHeartbeatDelay(),
  });
  attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
  return response;
}
