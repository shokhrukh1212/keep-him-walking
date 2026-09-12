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
import { writeOperationalLog } from "@/lib/observability/logger";
import { mergeScheduledActions, reactionsFromRow } from "@/lib/reactions/payload";
import { weatherFromRow } from "@/lib/weather/payload";
import { issueShareToken } from "@/lib/share/server-token";
import { nextActivityToSchedule } from "@/lib/world/activity-plan";
import { activeWalkingSecondsAt } from "@/lib/world/route-clock";
import type { CountryPack } from "@/lib/content/schema";
import type { ReactionsView } from "@/lib/contracts";

/** The database re-checks the lead a little below the planner's, to absorb rounding. */
const SCHEDULE_RPC_MIN_LEAD_SECONDS = 15;

type ScheduleRow = {
  out_scheduled?: boolean;
  out_reason?: string;
  out_at_active_second?: number | string | null;
  out_end_active_second?: number | string | null;
};

/**
 * Writes the next planned stop once it is close enough that every viewer's next
 * heartbeat will carry it. The plan is a pure function of the pinned pack and the
 * day, and Postgres serializes the write under the authority lock, so concurrent
 * heartbeats converge on one row. A failure never fails the heartbeat.
 */
async function scheduleNextActivity(
  supabase: NonNullable<ReturnType<typeof getServerSupabase>>,
  input: {
    pack: CountryPack;
    countryDayId: string;
    now: Date;
    globalActiveSeconds: number;
    distanceMetres: number;
    paceRate: number;
    reactions: ReactionsView;
    config: ReturnType<typeof serverRuntimeConfig>;
  },
): Promise<ReactionsView | null> {
  const { pack, reactions } = input;
  const candidate = nextActivityToSchedule({
    pack,
    seed: input.countryDayId,
    globalActiveSeconds: input.globalActiveSeconds,
    walkingSeconds: activeWalkingSecondsAt(input.globalActiveSeconds, reactions.scheduled, reactions.walkingClock ?? null),
    distanceMetres: input.distanceMetres,
    paceRate: input.paceRate,
    rows: reactions.scheduled,
  });
  if (!candidate) return null;
  const { data, error } = await supabase.rpc("schedule_journey_activity", {
    p_country_day_id: input.countryDayId,
    p_occurrence_key: candidate.occurrenceKey,
    p_kind: candidate.kind,
    p_source: candidate.source,
    p_variant: candidate.variant,
    p_at_active_second: candidate.atActiveSecond,
    p_duration_seconds: candidate.durationSeconds,
    p_min_lead_seconds: SCHEDULE_RPC_MIN_LEAD_SECONDS,
    p_now: input.now.toISOString(),
    p_ttl_seconds: input.config.presenceTtlSeconds,
    p_steps_per_second: input.config.stepsPerActiveSecond,
    p_pace_cap: input.config.paceCap,
  });
  if (error) {
    void writeOperationalLog("warning", "journey_activity_schedule_failed", {
      kind: candidate.kind,
      code: error.code ?? "rpc_error",
    });
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as ScheduleRow | null;
  if (row?.out_scheduled !== true) return null;
  const atActiveSecond = Number(row.out_at_active_second);
  const endsAtActiveSecond = Number(row.out_end_active_second);
  if (!Number.isFinite(atActiveSecond) || !Number.isFinite(endsAtActiveSecond)) return null;
  return {
    ...reactions,
    scheduled: mergeScheduledActions(reactions.scheduled, [{
      kind: candidate.kind,
      atActiveSecond,
      endsAtActiveSecond,
      frozenDistanceMetres: null,
      source: candidate.source,
      ...(candidate.variant ? { variant: candidate.variant } : {}),
      occurrenceKey: candidate.occurrenceKey,
    }]),
  };
}

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
    paceEnabled ? "record_presence_heartbeat_v12" : "record_presence_heartbeat_v2",
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
  const waitingSinceMs = row?.out_waiting_since ? Date.parse(String(row.out_waiting_since)) : Number.NaN;
  const accountedAtMs = Date.parse(String(row?.out_accounted_at ?? now.toISOString()));
  const firstWatcherShareToken = row?.out_woke_him === true
    && Number.isFinite(waitingSinceMs) && Number.isFinite(accountedAtMs)
    ? issueShareToken({
        purpose: "first",
        day: countryDay.day_number,
        foundAt: Math.floor(accountedAtMs / 1_000),
        waited: Math.max(0, Math.floor((accountedAtMs - waitingSinceMs) / 1_000)),
      }, new Date(accountedAtMs))
    : null;
  const globalActiveSeconds = Number(row?.out_global_active_seconds ?? 0);
  const globalDistanceMetres = Number(row?.out_global_distance_metres ?? 0);
  const paceRate = Number(row?.out_pace_rate ?? 1);
  let reactions = reactionsFromRow(row?.out_reactions);
  let activityScheduled = false;
  if (pack?.schemaVersion === 3 && activeViewers > 0 && parsed.data.state === "active") {
    const scheduled = await scheduleNextActivity(supabase, {
      pack,
      countryDayId: countryDay.id,
      now,
      globalActiveSeconds,
      distanceMetres: globalDistanceMetres,
      paceRate,
      reactions,
      config,
    }).catch(() => null);
    if (scheduled) {
      reactions = scheduled;
      activityScheduled = true;
    }
  }
  const response = NextResponse.json({
    countryDayId: countryDay.id,
    serverNow: countryDay.story_now ?? now.toISOString(),
    realServerNow: String(row?.out_accounted_at ?? now.toISOString()),
    storyScale: countryDay.story_scale ?? 1,
    activeViewers,
    walking: activeViewers > 0,
    globalSteps: Number(row?.out_global_steps ?? 0),
    visitorActiveSeconds: Number(row?.out_visitor_active_seconds ?? 0),
    // The server chose both from the crowd it counted under the lock. The lease
    // always outlives two beats; when the RPC has no opinion (the v2 path) the
    // configured defaults stand.
    ttlSeconds: Number(row?.out_lease_ttl_seconds ?? config.presenceTtlSeconds),
    nextHeartbeatInMs: nextHeartbeatDelay(
      Math.random,
      Number(row?.out_heartbeat_seconds ?? 0) * 1_000 || undefined,
    ),
    globalActiveSeconds,
    globalDistanceMetres,
    paceRate,
    routeAuthoritativeAt: String(row?.out_accounted_at ?? now.toISOString()),
    waitingSince: row?.out_waiting_since ? String(row.out_waiting_since) : null,
    wokeHim: row?.out_woke_him === true,
    firstWatcherShareToken,
    countryCode: String(row?.out_country_code ?? countryCode),
    reactions,
    activityScheduled,
    weather: config.weatherEnabled ? weatherFromRow(row?.out_weather) : null,
    // The bunting goes up only once the server has confirmed the moment.
    hundredWatchersAt: row?.out_hundred_watchers_at ? String(row.out_hundred_watchers_at) : null,
  });
  attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
  return response;
}

export const POST = withRouteTelemetry("presence_heartbeat", handlePost);
