import { NextRequest, NextResponse } from "next/server";
import { serverRuntimeConfig } from "@/lib/config/server";
import { attachVisitorCookie, visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { findCurrentCountryDay } from "@/lib/bootstrap/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { reactionBodySchema } from "@/lib/validation/api";
import { hasTrustedOrigin } from "@/lib/validation/origin";
import { RATE_LIMITS, consumeRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { withRouteTelemetry } from "@/lib/observability/route";

async function handlePost(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Untrusted request origin." }, { status: 403 });
  }
  const parsed = reactionBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reaction." }, { status: 400 });
  }
  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Reactions are not configured." }, { status: 503 });
  }
  const now = new Date();
  const countryDay = await findCurrentCountryDay(now);
  if (!countryDay) {
    return NextResponse.json({ error: "No country-day is active." }, { status: 409 });
  }
  const visitor = visitorFromRequest(request);
  const visitorHash = hashOpaqueValue(visitor.visitorId);
  const limit = await consumeRateLimit(visitorHash, RATE_LIMITS.reaction);
  if (!limit.allowed) {
    return rateLimitedResponse(limit.retryAfterSeconds, "Reactions are arriving too quickly.");
  }
  const config = serverRuntimeConfig();
  const { data, error } = await supabase.rpc("submit_reaction", {
    p_country_day_id: countryDay.id,
    p_visitor_hash: visitorHash,
    p_kind: parsed.data.kind,
    p_now: now.toISOString(),
    p_ttl_seconds: config.presenceTtlSeconds,
  });
  if (error) {
    return NextResponse.json({ error: "Reaction could not be recorded." }, { status: 503 });
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return NextResponse.json({ error: "Reaction confirmation unavailable." }, { status: 503 });
  }
  // The per-kind cooldown lives in the RPC, so the client learns it here.
  if (row.out_rate_limited === true) {
    const response = NextResponse.json({
      accepted: false,
      count: Number(row.out_count ?? 0),
      threshold: Number(row.out_threshold ?? 2),
      cooldownSeconds: 60,
    }, { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
    attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
    return response;
  }
  const scheduledAt = row.out_scheduled_at === null || row.out_scheduled_at === undefined
    ? null
    : Number(row.out_scheduled_at);
  const response = NextResponse.json({
    accepted: true,
    kind: parsed.data.kind,
    count: Number(row.out_count ?? 0),
    threshold: Number(row.out_threshold ?? 2),
    scheduledAt,
    cooldownSeconds: 60,
  });
  attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
  return response;
}

export const POST = withRouteTelemetry("reactions", handlePost);
