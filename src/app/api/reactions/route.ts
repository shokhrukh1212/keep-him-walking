import { NextRequest, NextResponse } from "next/server";
import { serverRuntimeConfig } from "@/lib/config/server";
import { attachVisitorCookie, visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { reactionBodySchema } from "@/lib/validation/api";
import { hasTrustedOrigin } from "@/lib/validation/origin";
import { withRouteTelemetry } from "@/lib/observability/route";
import { reactionsFromRow } from "@/lib/reactions/payload";
import { currentCountryDayForReactions } from "@/lib/reactions/current-day";
import { reactionHttpStatus, reactionOutcome } from "@/lib/reactions/outcome";
import { REACTION_COOLDOWN_SECONDS, REACTION_WINDOW_SECONDS } from "@/lib/reactions/threshold";
import { clientAddress } from "@/lib/security/client-address";

function finiteOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function handleGet() {
  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Reactions are not configured." }, { status: 503 });
  }
  const now = new Date();
  const countryDay = await currentCountryDayForReactions(now);
  if (!countryDay) {
    return NextResponse.json({ error: "No country-day is active." }, { status: 409 });
  }
  // One round trip: the database projects the watched second itself.
  const { data, error } = await supabase.rpc("read_reactions_now", {
    p_country_day_id: countryDay.id,
    p_now: now.toISOString(),
    p_ttl_seconds: serverRuntimeConfig().presenceTtlSeconds,
  });
  if (error) {
    return NextResponse.json({ error: "Reaction confirmation unavailable." }, { status: 503 });
  }
  return NextResponse.json({
    countryDayId: countryDay.id,
    reactions: reactionsFromRow(data),
  }, { headers: { "Cache-Control": "no-store" } });
}

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
  const countryDay = await currentCountryDayForReactions(now);
  if (!countryDay) {
    return NextResponse.json({ error: "No country-day is active." }, { status: 409 });
  }
  const visitor = visitorFromRequest(request);
  // The limits, the watcher check and the count are one database call. The network
  // reaches the database only as a keyed hash, for its per-minute limit.
  const { data, error } = await supabase.rpc("submit_reaction_v2", {
    p_country_day_id: countryDay.id,
    p_visitor_hash: hashOpaqueValue(visitor.visitorId),
    p_network_hash: hashOpaqueValue(`reaction-network:${clientAddress(request.headers)}`),
    p_kind: parsed.data.kind,
    p_now: now.toISOString(),
    p_ttl_seconds: serverRuntimeConfig().presenceTtlSeconds,
  });
  if (error) {
    return NextResponse.json({ error: "Reaction could not be recorded." }, { status: 503 });
  }
  const row = Array.isArray(data) ? data[0] : data;
  const outcome = reactionOutcome(row?.out_status);
  const status = reactionHttpStatus(outcome);
  if (!row || status === 503) {
    return NextResponse.json({ error: "Reaction confirmation unavailable." }, { status: 503 });
  }
  const retryAfterSeconds = finiteOrNull(row.out_retry_after_seconds);
  const response = NextResponse.json({
    accepted: status === 200,
    kind: parsed.data.kind,
    reason: outcome,
    count: Number(row.out_count ?? 0),
    threshold: Number(row.out_threshold ?? 0),
    scheduledAt: finiteOrNull(row.out_scheduled_at),
    restUntilActiveSecond: finiteOrNull(row.out_rest_until_active_second),
    retryAfterSeconds,
    // A request counts for thirty seconds from the moment it arrived.
    requestExpiresAt: new Date(now.getTime() + REACTION_WINDOW_SECONDS * 1_000).toISOString(),
    cooldownSeconds: REACTION_COOLDOWN_SECONDS,
    ...(row.out_reactions ? { reactions: reactionsFromRow(row.out_reactions) } : {}),
  }, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(status === 429
        ? { "Retry-After": String(Math.max(1, retryAfterSeconds ?? REACTION_COOLDOWN_SECONDS)) }
        : {}),
    },
  });
  attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
  return response;
}

export const POST = withRouteTelemetry("reactions", handlePost);
export const GET = withRouteTelemetry("reactions-read", handleGet);
