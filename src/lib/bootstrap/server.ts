import "server-only";

import { z } from "zod";
import { getCountryPack } from "@/content/countries/registry";
import { serverRuntimeConfig } from "@/lib/config/server";
import type {
  BootstrapSnapshot,
  CountryDayView,
  DayPhotoView,
  ScheduledEventView,
  VoteView,
} from "@/lib/contracts";
import { dialogueLineSchema, travelerStateSchema } from "@/lib/content/schema";
import { getServerSupabase } from "@/lib/supabase/server";
import { scaledStoryNow } from "@/lib/story-clock/schedule";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { reactionsFromRow, type RawReactionsPayload } from "@/lib/reactions/payload";
import { weatherFromRow } from "@/lib/weather/payload";

const eventPayloadSchema = z.object({
  travelerState: travelerStateSchema.optional(),
  locationLabel: z.string().optional(),
  lines: z.array(dialogueLineSchema).optional(),
});

type CountryDayRow = {
  id: string;
  journey_id?: string;
  day_number: number;
  country_code: string;
  country_name: string;
  city_name: string;
  time_zone: string;
  starts_at: string;
  ends_at: string;
  story_summary: string | null;
  scene_pack_id: string;
  journeys: { total_days: number; rollover_utc_hour?: number } | Array<{ total_days: number; rollover_utc_hour?: number }>;
  story_now?: string;
  story_scale?: number;
};

type EventRow = {
  id: string;
  type: string;
  starts_at: string;
  duration_seconds: number;
  status: string;
  payload_json: unknown;
};

type BootstrapBundleRow = {
  country_day: Omit<CountryDayRow, "journeys"> & { total_days: number };
  runtime: {
    out_active_viewers: number;
    out_global_steps: number;
    out_visitor_active_seconds: number;
    out_accounted_at: string;
    out_global_active_seconds: number;
    out_global_distance_metres: number;
    out_pace_rate: number;
    out_waiting_since: string | null;
    out_last_watcher_left_at: string | null;
  };
  events: EventRow[];
  vote: null | {
    id: string;
    question: string;
    opens_at: string;
    closes_at: string;
    status: string;
    result_option_id: string | null;
    vote_options: Array<{ id: string; label: string; display_order: number }>;
    ballots: Array<{ option_id: string; voter_hash: string }>;
  };
  vote_meta: null | {
    kind: string;
    options: Array<{ id: string; pack_id: string | null; ballots: number }>;
  };
  journey: null | { travelerName: string | null; rolloverUtcHour?: number };
  countries: null | {
    live: Array<{ code: string; watchers: number }>;
    top: Array<{ code: string; watchSeconds: number }>;
  };
  reactions: null | {
    counts: { wave: number; water: number; photo: number };
    scheduled: Array<{ kind: string; atActiveSecond: number }>;
    nextScheduledAction: null | { kind: string; atActiveSecond: number };
    photos: Array<{ atActiveSecond: number; storagePath: string }>;
  };
  weather: unknown;
  contribution_seconds: number | null;
  passport: null | { streak: number; collectedToday: boolean };
  milestones: null | { hundredWatchersAt: string | null };
  postcard: null | { public_token: string; status: string; expires_at: string };
  sponsor: null | {
    public_id: string;
    status: string;
    sponsor_name: string;
    disclosure: string;
    public_creative_path: string | null;
    cta_label: string | null;
    tier?: string | null;
  };
};

type AtomicBootstrapRow = {
  allowed: boolean;
  bundle: BootstrapBundleRow | null;
};

export class BootstrapRateLimitError extends Error {
  constructor() {
    super("Bootstrap rate limit exceeded");
    this.name = "BootstrapRateLimitError";
  }
}

export async function findCurrentCountryDay(now: Date): Promise<CountryDayRow | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const config = serverRuntimeConfig();
  if (process.env.VERCEL_ENV === "production" && !config.phase2Enabled) return null;
  let effectiveNow = now;
  let journeyId: string | null = null;
  let storyScale = 1;
  if (config.phase2Enabled) {
    const { data: journey, error: journeyError } = await supabase
      .from("journeys")
      .select("id,real_time_anchor_at,story_time_anchor_at,story_time_scale,launch_at")
      .eq("phase2_enabled", true)
      .in("status", ["preview", "active"])
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (journeyError) throw journeyError;
    if (journey) {
      if (journey.launch_at && new Date(journey.launch_at).getTime() > now.getTime()) return null;
      journeyId = journey.id;
      storyScale = Number(journey.story_time_scale);
      effectiveNow = scaledStoryNow(
        now,
        journey.real_time_anchor_at ? new Date(journey.real_time_anchor_at) : null,
        journey.story_time_anchor_at ? new Date(journey.story_time_anchor_at) : null,
        Number(journey.story_time_scale),
      );
    }
  }
  const iso = effectiveNow.toISOString();
  const readDay = async () => {
    const { data, error } = await supabase
      .from("country_days")
      .select(
        "id,journey_id,day_number,country_code,country_name,city_name,time_zone,starts_at,ends_at,story_summary,scene_pack_id,journeys!inner(total_days,status,rollover_utc_hour)",
      )
      .in("status", ["scheduled", "live"])
      .in("journeys.status", config.phase2Enabled ? ["preview", "active"] : ["active"])
      .match(journeyId ? { journey_id: journeyId } : {})
      .lte("starts_at", iso)
      .gt("ends_at", iso)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  };
  let data = await readDay();
  if (!data && config.phase2Enabled) {
    // Authoritative reads are the catch-up path when cron was late or absent.
    // The ledger and row locks make concurrent requests converge on one day.
    const [{ reconcilePhase2 }, { logicalDayBoundaryAtOrBefore }] = await Promise.all([
      import("@/lib/story-clock/rollover"),
      import("@/lib/story-clock/boundary"),
    ]);
    await reconcilePhase2(now, logicalDayBoundaryAtOrBefore(now));
    data = await readDay();
  }
  return data ? { ...(data as CountryDayRow), story_now: iso, story_scale: storyScale } : null;
}

function countryDayView(row: CountryDayRow): CountryDayView {
  const journey = Array.isArray(row.journeys) ? row.journeys[0] : row.journeys;
  return {
    id: row.id,
    dayNumber: row.day_number,
    totalDays: journey?.total_days ?? 195,
    countryCode: row.country_code.trim(),
    countryName: row.country_name,
    cityName: row.city_name,
    timeZone: row.time_zone,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    storySummary: row.story_summary,
    scenePackId: row.scene_pack_id,
  };
}

async function prelaunchBootstrapSnapshot(
  now: Date,
  config: ReturnType<typeof serverRuntimeConfig>,
  supabase: NonNullable<ReturnType<typeof getServerSupabase>>,
): Promise<BootstrapSnapshot | null> {
  const { data: journey, error: journeyError } = await supabase
    .from("journeys")
    .select("id,total_days,traveler_name,launch_at,rollover_utc_hour")
    .eq("phase2_enabled", true)
    .in("status", ["preview", "active"])
    .gt("launch_at", now.toISOString())
    .order("launch_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (journeyError) throw journeyError;
  if (!journey?.launch_at) return null;

  const { data: day, error: dayError } = await supabase
    .from("country_days")
    .select("id,journey_id,day_number,country_code,country_name,city_name,time_zone,starts_at,ends_at,story_summary,scene_pack_id")
    .eq("journey_id", journey.id)
    .eq("day_number", 1)
    .maybeSingle();
  if (dayError) throw dayError;
  if (!day) return null;
  const pack = getCountryPack(day.scene_pack_id);
  if (!pack || pack.schemaVersion !== 3) {
    throw new Error(`No matching launch pack for ${day.scene_pack_id}`);
  }
  const launchAt = new Date(journey.launch_at);
  const afterMs = Math.max(1_000, Math.min(5 * 60_000, launchAt.getTime() - now.getTime()));
  return {
    serverNow: now.toISOString(),
    realServerNow: now.toISOString(),
    storyScale: 1,
    mode: "prelaunch",
    journeyState: "prelaunch",
    refresh: { nextAt: launchAt.toISOString(), afterMs, reason: "launch" },
    countryDay: countryDayView({
      ...day,
      journeys: { total_days: journey.total_days, rollover_utc_hour: journey.rollover_utc_hour },
    } as CountryDayRow),
    journey: {
      travelerName: journey.traveler_name ?? null,
      rolloverUtcHour: Number(journey.rollover_utc_hour ?? config.rolloverUtcHour),
    },
    activeEvent: null,
    nextEvent: null,
    vote: null,
    presence: { activeViewers: null, status: "scheduled", ttlSeconds: config.presenceTtlSeconds, waitingSince: null },
    countries: { live: [], todayTop: [] },
    reactions: { counts: { wave: 0, water: 0, photo: 0 }, scheduled: [], nextScheduledAction: null },
    dayPhotos: [],
    weather: null,
    steps: { global: 0, updatedAt: now.toISOString(), stale: false },
    route: {
      globalActiveSeconds: 0,
      globalDistanceMetres: 0,
      paceRate: 1,
      authoritativeAt: now.toISOString(),
      walking: false,
    },
    sponsor: { status: "unsponsored" },
    postcard: { eligible: false, unlockSeconds: config.postcardUnlockSeconds, contributedSeconds: 0, url: null },
    passport: { streak: 0, collectedToday: false, collectSeconds: config.passportCollectSeconds },
    milestones: { hundredWatchersAt: null },
    assets: pack,
  };
}

function eventView(row: EventRow): ScheduledEventView {
  const payload = eventPayloadSchema.safeParse(row.payload_json);
  return {
    id: row.id,
    type: row.type,
    startsAt: row.starts_at,
    durationSeconds: row.duration_seconds,
    status: row.status,
    ...(payload.success ? payload.data : {}),
  };
}

/**
 * Countries are rendered only from server-confirmed rows. A missing or malformed
 * payload becomes an empty audience rather than an invented one.
 */
function countriesView(
  payload: BootstrapBundleRow["countries"] | null | undefined,
): BootstrapSnapshot["countries"] {
  const live = Array.isArray(payload?.live) ? payload.live : [];
  const top = Array.isArray(payload?.top) ? payload.top : [];
  return {
    live: live
      .filter((row) => typeof row?.code === "string" && Number.isFinite(Number(row.watchers)))
      .map((row) => ({ code: String(row.code), watchers: Number(row.watchers) })),
    todayTop: top
      .filter((row) => typeof row?.code === "string" && Number.isFinite(Number(row.watchSeconds)))
      .map((row) => ({ code: String(row.code), watchSeconds: Number(row.watchSeconds) })),
  };
}

function dayPhotosView(
  payload: BootstrapBundleRow["reactions"] | null | undefined,
  config: ReturnType<typeof serverRuntimeConfig>,
  supabase: NonNullable<ReturnType<typeof getServerSupabase>>,
): DayPhotoView[] {
  return (Array.isArray(payload?.photos) ? payload.photos : [])
    .filter((row) => typeof row?.storagePath === "string" && row.storagePath.length > 0)
    .map((row) => ({
      atActiveSecond: Number(row.atActiveSecond ?? 0),
      url: supabase.storage.from(config.dayPhotoBucket).getPublicUrl(row.storagePath).data.publicUrl,
    }));
}

/**
 * Turns a ballot option's pack id into the flag and blurb the chip renders.
 * A name ballot has no pack, so every field stays null rather than guessed.
 */
function votePackFields(packId: string | null) {
  const pack = packId ? getCountryPack(packId) : null;
  return {
    packId,
    countryCode: pack?.countryCode ?? null,
    blurb: pack?.voteBlurb ? pack.voteBlurb : null,
  };
}

function bootstrapFromBundle(
  bundle: BootstrapBundleRow,
  visitorHash: string,
  config: ReturnType<typeof serverRuntimeConfig>,
  supabase: NonNullable<ReturnType<typeof getServerSupabase>>,
): BootstrapSnapshot {
  const countryDay = {
    ...bundle.country_day,
    journeys: { total_days: bundle.country_day.total_days },
  } as CountryDayRow;
  const countryPack = getCountryPack(countryDay.scene_pack_id);
  if (!countryPack || countryPack.schemaVersion !== 3) {
    throw new Error(`No matching Phase 3 country pack for ${countryDay.scene_pack_id}`);
  }
  const storyNow = new Date(countryDay.story_now ?? new Date().toISOString());
  const eventRows = bundle.events.map(eventView);
  const nowMs = storyNow.getTime();
  const activeEvent = eventRows.find((event) => {
    const start = new Date(event.startsAt).getTime();
    return nowMs >= start && nowMs < start + event.durationSeconds * 1_000;
  }) ?? null;
  const nextEvent = eventRows.find((event) => new Date(event.startsAt).getTime() > nowMs)
    ?? [...eventRows].reverse().find((event) => {
      const start = new Date(event.startsAt).getTime();
      return start + event.durationSeconds * 1_000 <= nowMs;
    })
    ?? null;
  const vote: VoteView | null = bundle.vote ? (() => {
    const closed = nowMs >= new Date(bundle.vote.closes_at).getTime();
    const selected = bundle.vote.ballots.find((ballot) => ballot.voter_hash === visitorHash);
    const meta = new Map(
      (bundle.vote_meta?.options ?? []).map((option) => [option.id, option]),
    );
    return {
      id: bundle.vote.id,
      question: bundle.vote.question,
      kind: bundle.vote_meta?.kind === "name" ? "name" as const : "destination" as const,
      opensAt: bundle.vote.opens_at,
      closesAt: bundle.vote.closes_at,
      status: closed ? "closed" as const : "open" as const,
      totalBallots: bundle.vote.ballots.length,
      selectedOptionId: selected?.option_id ?? null,
      resultOptionId: bundle.vote.result_option_id ?? null,
      options: bundle.vote.vote_options.map((option) => ({
        id: option.id,
        label: option.label,
        displayOrder: option.display_order,
        ...votePackFields(meta.get(option.id)?.pack_id ?? null),
        // Destination ballots show a live tally; the count is server-confirmed.
        votes: bundle.vote!.ballots.filter((ballot) => ballot.option_id === option.id).length,
      })),
    };
  })() : null;
  const contributedSeconds = Number(bundle.contribution_seconds ?? bundle.runtime.out_visitor_active_seconds ?? 0);
  const liveSponsor = bundle.sponsor?.status === "live" ? bundle.sponsor : null;
  const patchUrl = liveSponsor?.public_creative_path
    ? supabase.storage.from(config.sponsorPublicBucket).getPublicUrl(liveSponsor.public_creative_path).data.publicUrl
    : null;
  const nextAt = nextEvent && new Date(nextEvent.startsAt).getTime() > storyNow.getTime()
    ? nextEvent.startsAt : countryDay.ends_at;

  return {
    serverNow: storyNow.toISOString(),
    realServerNow: new Date().toISOString(),
    storyScale: countryDay.story_scale ?? 1,
    mode: "live",
    journeyState: "live",
    refresh: {
      nextAt,
      afterMs: Math.max(1_000, Math.min(5 * 60_000, (new Date(nextAt).getTime() - storyNow.getTime()) / Math.max(1, countryDay.story_scale ?? 1))),
      reason: nextAt === countryDay.ends_at ? "country_rollover" : "event",
    },
    countryDay: countryDayView(countryDay),
    journey: {
      travelerName: bundle.journey?.travelerName ?? null,
      rolloverUtcHour: Number(bundle.journey?.rolloverUtcHour ?? config.rolloverUtcHour),
    },
    activeEvent,
    nextEvent,
    vote,
    presence: {
      activeViewers: Number(bundle.runtime.out_active_viewers ?? 0),
      status: "live",
      ttlSeconds: config.presenceTtlSeconds,
      waitingSince: bundle.runtime.out_waiting_since
        ? String(bundle.runtime.out_waiting_since)
        : null,
    },
    countries: countriesView(bundle.countries),
    reactions: reactionsFromRow(bundle.reactions),
    dayPhotos: dayPhotosView(bundle.reactions, config, supabase),
    weather: config.weatherEnabled ? weatherFromRow(bundle.weather) : null,
    steps: {
      global: Number(bundle.runtime.out_global_steps ?? 0),
      updatedAt: String(bundle.runtime.out_accounted_at),
      stale: false,
    },
    route: {
      globalActiveSeconds: Number(bundle.runtime.out_global_active_seconds ?? 0),
      globalDistanceMetres: Number(bundle.runtime.out_global_distance_metres ?? 0),
      paceRate: Number(bundle.runtime.out_pace_rate ?? 1),
      authoritativeAt: String(bundle.runtime.out_accounted_at),
      walking: Number(bundle.runtime.out_active_viewers ?? 0) > 0,
    },
    sponsor: liveSponsor ? {
      status: "sponsored",
      publicId: liveSponsor.public_id,
      name: liveSponsor.sponsor_name,
      disclosure: liveSponsor.disclosure,
      patchUrl,
      // Premium placements are drawn only for a purchase that bought them.
      tier: liveSponsor.tier === "premium" ? "premium" : "standard",
      bottleUrl: liveSponsor.tier === "premium" ? patchUrl : null,
      ctaLabel: liveSponsor.cta_label,
      clickUrl: liveSponsor.cta_label ? `/r/sponsor/${liveSponsor.public_id}` : null,
    } : { status: "unsponsored" },
    postcard: {
      eligible: contributedSeconds >= config.postcardUnlockSeconds,
      unlockSeconds: config.postcardUnlockSeconds,
      contributedSeconds,
      url: bundle.postcard?.public_token
        ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/p/${bundle.postcard.public_token}`
        : null,
    },
    // Server-confirmed, so the HUD can say "4 days in a row" without guessing.
    passport: {
      streak: Number(bundle.passport?.streak ?? 0),
      collectedToday: Boolean(bundle.passport?.collectedToday),
      collectSeconds: config.passportCollectSeconds,
    },
    milestones: { hundredWatchersAt: bundle.milestones?.hundredWatchersAt ?? null },
    assets: countryPack,
  };
}

async function withApprovedTicket(
  snapshot: BootstrapSnapshot,
  supabase: NonNullable<ReturnType<typeof getServerSupabase>>,
): Promise<BootstrapSnapshot> {
  const dayResult = await supabase.from("country_days")
    .select("journey_id").eq("id", snapshot.countryDay.id).single();
  if (dayResult.error) throw dayResult.error;
  const [{ data, error }, { data: tomorrow, error: tomorrowError }] = await Promise.all([
    supabase.from("tickets")
    .select("target_day_number,country_code,country_name,city_name,pack_id")
    .eq("journey_id", dayResult.data.journey_id)
    .eq("status", "approved")
    .gt("target_day_number", snapshot.countryDay.dayNumber)
    .order("target_day_number", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("country_days")
      .select("day_number,country_code,country_name,city_name,scene_pack_id,starts_at,arrival_mode")
      .eq("journey_id", dayResult.data.journey_id)
      .eq("day_number", snapshot.countryDay.dayNumber + 1)
      .in("status", ["scheduled", "live"])
      .maybeSingle(),
  ]);
  if (error) throw error;
  if (tomorrowError) throw tomorrowError;
  const committedTomorrow = tomorrow ? {
    dayNumber: tomorrow.day_number,
    countryCode: tomorrow.country_code.trim(),
    countryName: tomorrow.country_name,
    cityName: tomorrow.city_name,
    scenePackId: tomorrow.scene_pack_id,
    startsAt: tomorrow.starts_at,
    arrivalMode: tomorrow.arrival_mode === "flight"
      ? "flight" as const
      : tomorrow.arrival_mode === "train"
        ? "train" as const
        : "walk" as const,
  } : null;
  if (!data) return { ...snapshot, ticket: null, tomorrow: committedTomorrow };
  const ticket = {
    dayNumber: data.target_day_number,
    countryCode: data.country_code.trim(),
    countryName: data.country_name,
    cityName: data.city_name,
    scenePackId: data.pack_id,
  };
  return {
    ...snapshot,
    ticket,
    tomorrow: committedTomorrow,
    vote: ticket.dayNumber === snapshot.countryDay.dayNumber + 1 ? null : snapshot.vote,
  };
}

async function loadEvents(
  countryDayId: string,
  now: Date,
): Promise<{ activeEvent: ScheduledEventView | null; nextEvent: ScheduledEventView | null }> {
  const supabase = getServerSupabase();
  if (!supabase) return { activeEvent: null, nextEvent: null };
  const { data, error } = await supabase
    .from("story_events")
    .select("id,type,starts_at,duration_seconds,status,payload_json")
    .eq("country_day_id", countryDayId)
    .in("status", ["scheduled", "live", "completed"])
    .order("starts_at", { ascending: true });
  if (error) throw error;
  const events = (data as EventRow[]).map(eventView);
  const nowMs = now.getTime();
  return {
    activeEvent:
      events.find((event) => {
        const start = new Date(event.startsAt).getTime();
        return nowMs >= start && nowMs < start + event.durationSeconds * 1_000;
      }) ?? null,
    nextEvent:
      events.find((event) => new Date(event.startsAt).getTime() > nowMs)
      ?? [...events].reverse().find((event) => {
        const start = new Date(event.startsAt).getTime();
        return start + event.durationSeconds * 1_000 <= nowMs;
      })
      ?? null,
  };
}

async function loadVote(
  countryDayId: string,
  visitorHash: string,
  now: Date,
): Promise<VoteView | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const { data: vote, error } = await supabase
    .from("votes")
    .select("id,question,kind,opens_at,closes_at,status,result_option_id,vote_options!vote_options_vote_id_fkey(id,label,display_order,pack_id)")
    .eq("country_day_id", countryDayId)
    .lte("opens_at", now.toISOString())
    .order("opens_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!vote) return null;

  const { data: ballots, error: ballotsError } = await supabase
    .from("ballots")
    .select("option_id,voter_hash")
    .eq("vote_id", vote.id);
  if (ballotsError) throw ballotsError;

  const ballotRows = (ballots ?? []) as Array<{ option_id: string; voter_hash: string }>;
  const selected = ballotRows.find((ballot) => ballot.voter_hash === visitorHash);
  const closed = now.getTime() >= new Date(vote.closes_at).getTime();
  const options = (
    vote.vote_options as Array<{
      id: string; label: string; display_order: number; pack_id: string | null;
    }>
  )
    .sort((a, b) => a.display_order - b.display_order)
    .map((option) => ({
      id: option.id,
      label: option.label,
      displayOrder: option.display_order,
      ...votePackFields(option.pack_id ?? null),
      votes: ballotRows.filter((ballot) => ballot.option_id === option.id).length,
    }));

  return {
    id: vote.id,
    question: vote.question,
    kind: vote.kind === "name" ? "name" : "destination",
    opensAt: vote.opens_at,
    closesAt: vote.closes_at,
    status: closed ? "closed" : "open",
    totalBallots: ballotRows.length,
    selectedOptionId: selected?.option_id ?? null,
    resultOptionId: vote.result_option_id ?? null,
    options,
  };
}

/**
 * The key every public bootstrap read shares.
 *
 * /api/bootstrap answers the same thing for everyone so a CDN can hold it, which
 * means it cannot be read as any particular visitor. Reading it under one shared
 * key leaves the ballot unselected, the postcard locked and the passport empty —
 * exactly the public view. Everything visitor-specific comes from /api/me.
 */
export const PUBLIC_BOOTSTRAP_KEY = "public-bootstrap";

export async function liveBootstrapSnapshot(
  visitorHash: string,
  now = new Date(),
): Promise<BootstrapSnapshot | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const config = serverRuntimeConfig();
  if (config.phase2Enabled) {
    const prelaunch = await prelaunchBootstrapSnapshot(now, config, supabase);
    if (prelaunch) return withApprovedTicket(prelaunch, supabase);
    const { data: atomic, error: bundleError } = await supabase.rpc("read_bootstrap_bundle_v14", {
      p_visitor_hash: visitorHash,
      p_real_now: now.toISOString(),
      p_ttl_seconds: config.presenceTtlSeconds,
      p_steps_per_second: config.stepsPerActiveSecond,
      p_rate_limit: RATE_LIMITS.bootstrap.limit,
      p_rate_window_seconds: RATE_LIMITS.bootstrap.windowSeconds,
      p_pace_cap: config.paceCap,
      p_collect_seconds: config.passportCollectSeconds,
    });
    if (bundleError) throw bundleError;
    const result = atomic as AtomicBootstrapRow | null;
    if (result && !result.allowed) throw new BootstrapRateLimitError();
    if (result?.bundle) {
      return withApprovedTicket(
        bootstrapFromBundle(result.bundle, visitorHash, config, supabase),
        supabase,
      );
    }
  }
  const countryDay = await findCurrentCountryDay(now);
  if (!countryDay) return null;
  const countryPack = getCountryPack(countryDay.scene_pack_id);
  if (
    !countryPack ||
    ("countryDayId" in countryPack && countryPack.countryDayId !== countryDay.id)
  ) {
    throw new Error(`No matching country pack for ${countryDay.scene_pack_id}`);
  }
  const storyNow = new Date(countryDay.story_now ?? now.toISOString());
  const runtimeRequest = countryPack.schemaVersion === 2 || countryPack.schemaVersion === 3
    ? supabase.rpc("read_journey_runtime_v5", {
      p_country_day_id: countryDay.id,
      p_now: now.toISOString(),
      p_ttl_seconds: config.presenceTtlSeconds,
      p_steps_per_second: config.stepsPerActiveSecond,
      p_pace_cap: config.paceCap,
    })
    : supabase.rpc("record_presence_heartbeat_v2", {
      p_country_day_id: countryDay.id,
      p_visitor_hash: null,
      p_session_hash: null,
      p_state: "observe",
      p_scene_ready: false,
      p_now: now.toISOString(),
      p_ttl_seconds: config.presenceTtlSeconds,
      p_steps_per_second: config.stepsPerActiveSecond,
    });
  const [
    { data: runtime, error: runtimeError },
    events,
    vote,
    { data: countries },
    { data: travelerName },
    { data: weather },
  ] = await Promise.all([
    runtimeRequest,
    loadEvents(countryDay.id, storyNow),
    loadVote(countryDay.id, visitorHash, storyNow),
    supabase.rpc("read_country_day_watch", {
      p_country_day_id: countryDay.id,
      p_now: now.toISOString(),
      p_ttl_seconds: config.presenceTtlSeconds,
    }),
    supabase.rpc("read_traveler_name"),
    supabase.rpc("read_journey_weather", { p_country_day_id: countryDay.id }),
  ]);
  if (runtimeError) throw runtimeError;
  const row = Array.isArray(runtime) ? runtime[0] : runtime;
  // The reaction projection needs the confirmed active second to know which
  // action comes next, so it cannot be fetched before the runtime resolves.
  const { data: reactions } = await supabase.rpc("read_day_reactions", {
    p_country_day_id: countryDay.id,
    p_now: now.toISOString(),
    p_global_active_seconds: Number(row?.out_global_active_seconds ?? 0),
  });
  let postcard: BootstrapSnapshot["postcard"] = {
    eligible: false,
    unlockSeconds: config.postcardUnlockSeconds,
    contributedSeconds: Number(row?.out_visitor_active_seconds ?? 0),
    url: null,
  };
  let sponsor: BootstrapSnapshot["sponsor"] = { status: "unsponsored" };
  let passport: BootstrapSnapshot["passport"] = {
    streak: 0, collectedToday: false, collectSeconds: config.passportCollectSeconds,
  };
  let milestones: BootstrapSnapshot["milestones"] = { hundredWatchersAt: null };
  if (config.phase2Enabled && countryPack.schemaVersion === 3) {
    const [{ data: contribution }, { data: existingPostcard }, { data: slot, error: sponsorError }] = await Promise.all([
      supabase.from("visitor_day_contributions").select("active_seconds").eq("country_day_id", countryDay.id).eq("visitor_hash", visitorHash).maybeSingle(),
      supabase.from("postcards").select("public_token,status,expires_at").eq("country_day_id", countryDay.id).eq("visitor_hash", visitorHash).eq("status", "ready").gt("expires_at", now.toISOString()).maybeSingle(),
      supabase.from("sponsor_slots").select("id,sponsorships!sponsorships_slot_id_fkey(public_id,status,sponsor_name,disclosure,public_creative_path,cta_label,tier)").eq("country_day_id", countryDay.id).maybeSingle(),
    ]);
    if (sponsorError) throw sponsorError;
    const contributedSeconds = Number(contribution?.active_seconds ?? row?.out_visitor_active_seconds ?? 0);
    postcard = {
      eligible: contributedSeconds >= config.postcardUnlockSeconds,
      unlockSeconds: config.postcardUnlockSeconds,
      contributedSeconds,
      url: existingPostcard?.public_token
        ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/p/${existingPostcard.public_token}`
        : null,
    };
    const sponsorships = (slot?.sponsorships ?? []) as Array<{
      public_id: string; status: string; sponsor_name: string; disclosure: string;
      public_creative_path: string | null; cta_label: string | null; tier: string | null;
    }>;
    const liveSponsor = sponsorships.find((entry) => entry.status === "live");
    if (liveSponsor) {
      const patchUrl = liveSponsor.public_creative_path
        ? supabase.storage.from(config.sponsorPublicBucket).getPublicUrl(liveSponsor.public_creative_path).data.publicUrl
        : null;
      sponsor = {
        status: "sponsored",
        publicId: liveSponsor.public_id,
        name: liveSponsor.sponsor_name,
        disclosure: liveSponsor.disclosure,
        patchUrl,
        tier: liveSponsor.tier === "premium" ? "premium" : "standard",
        bottleUrl: liveSponsor.tier === "premium" ? patchUrl : null,
        ctaLabel: liveSponsor.cta_label,
        clickUrl: liveSponsor.cta_label ? `/r/sponsor/${liveSponsor.public_id}` : null,
      };
    }
    // The bundle path gets this inside the same lock; this path reads it on its
    // own so the fallback still reports a confirmed streak rather than zero.
    const { data: passportRow } = await supabase.rpc("read_visitor_passport", {
      p_journey_id: countryDay.journey_id ?? null,
      p_visitor_hash: visitorHash,
      p_collect_seconds: config.passportCollectSeconds,
    });
    const read = (passportRow ?? {}) as { streak?: number; days?: Array<{ countryDayId: string; collected: boolean }> };
    passport = {
      streak: Number(read.streak ?? 0),
      collectedToday: Boolean(read.days?.find((day) => day.countryDayId === countryDay.id)?.collected),
      collectSeconds: config.passportCollectSeconds,
    };
    const { data: milestoneRow } = await supabase.from("journey_runtime")
      .select("hundred_watchers_at").eq("country_day_id", countryDay.id).maybeSingle();
    milestones = { hundredWatchersAt: milestoneRow?.hundred_watchers_at ?? null };
  }

  return {
    serverNow: storyNow.toISOString(),
    realServerNow: now.toISOString(),
    storyScale: countryDay.story_scale ?? 1,
    mode: "live",
    journeyState: "live",
    refresh: (() => {
      const nextAt = events.nextEvent && new Date(events.nextEvent.startsAt).getTime() > storyNow.getTime()
        ? events.nextEvent.startsAt : countryDay.ends_at;
      return {
        nextAt,
        afterMs: Math.max(1_000, Math.min(5 * 60_000, (new Date(nextAt).getTime() - storyNow.getTime()) / Math.max(1, countryDay.story_scale ?? 1))),
        reason: nextAt === countryDay.ends_at ? "country_rollover" as const : "event" as const,
      };
    })(),
    countryDay: countryDayView(countryDay),
    journey: {
      travelerName: (travelerName as string | null) ?? null,
      rolloverUtcHour: Number(
        (Array.isArray(countryDay.journeys) ? countryDay.journeys[0] : countryDay.journeys)?.rollover_utc_hour
          ?? config.rolloverUtcHour,
      ),
    },
    activeEvent: events.activeEvent,
    nextEvent: events.nextEvent,
    vote,
    presence: {
      activeViewers: Number(row?.out_active_viewers ?? 0),
      status: "live",
      ttlSeconds: config.presenceTtlSeconds,
      waitingSince: row?.out_waiting_since ? String(row.out_waiting_since) : null,
    },
    countries: countriesView(countries as BootstrapBundleRow["countries"]),
    reactions: reactionsFromRow(reactions as RawReactionsPayload),
    dayPhotos: dayPhotosView(reactions as BootstrapBundleRow["reactions"], config, supabase),
    weather: config.weatherEnabled ? weatherFromRow(weather) : null,
    steps: {
      global: Number(row?.out_global_steps ?? 0),
      updatedAt: String(row?.out_accounted_at ?? now.toISOString()),
      stale: false,
    },
    route: {
      globalActiveSeconds: Number(row?.out_global_active_seconds ?? 0),
      globalDistanceMetres: Number(row?.out_global_distance_metres ?? 0),
      paceRate: Number(row?.out_pace_rate ?? 1),
      authoritativeAt: String(row?.out_accounted_at ?? now.toISOString()),
      walking: Number(row?.out_active_viewers ?? 0) > 0,
    },
    sponsor,
    postcard,
    passport,
    milestones,
    assets: countryPack,
  };
}
