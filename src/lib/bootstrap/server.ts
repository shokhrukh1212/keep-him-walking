import "server-only";

import { z } from "zod";
import { getCountryPack } from "@/content/countries/registry";
import { serverRuntimeConfig } from "@/lib/config/server";
import type {
  BootstrapSnapshot,
  CountryDayView,
  ScheduledEventView,
  VoteView,
} from "@/lib/contracts";
import { dialogueLineSchema, travelerStateSchema } from "@/lib/content/schema";
import { getServerSupabase } from "@/lib/supabase/server";
import { scaledStoryNow } from "@/lib/story-clock/schedule";

const eventPayloadSchema = z.object({
  travelerState: travelerStateSchema.optional(),
  locationLabel: z.string().optional(),
  lines: z.array(dialogueLineSchema).optional(),
});

type CountryDayRow = {
  id: string;
  day_number: number;
  country_code: string;
  country_name: string;
  city_name: string;
  time_zone: string;
  starts_at: string;
  ends_at: string;
  story_summary: string | null;
  scene_pack_id: string;
  journeys: { total_days: number } | Array<{ total_days: number }>;
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
  };
  events: EventRow[];
  vote: null | {
    id: string;
    question: string;
    opens_at: string;
    closes_at: string;
    status: string;
    vote_options: Array<{ id: string; label: string; display_order: number }>;
    ballots: Array<{ option_id: string; voter_hash: string }>;
  };
  contribution_seconds: number | null;
  postcard: null | { public_token: string; status: string; expires_at: string };
  sponsor: null | {
    public_id: string;
    status: string;
    sponsor_name: string;
    disclosure: string;
    public_creative_path: string | null;
    cta_label: string | null;
  };
};

export async function findCurrentCountryDay(now: Date): Promise<CountryDayRow | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const config = serverRuntimeConfig();
  let effectiveNow = now;
  let journeyId: string | null = null;
  let storyScale = 1;
  if (config.phase2Enabled) {
    const { data: journey, error: journeyError } = await supabase
      .from("journeys")
      .select("id,real_time_anchor_at,story_time_anchor_at,story_time_scale")
      .eq("phase2_enabled", true)
      .in("status", ["preview", "active"])
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (journeyError) throw journeyError;
    if (journey) {
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
  const { data, error } = await supabase
    .from("country_days")
    .select(
      "id,day_number,country_code,country_name,city_name,time_zone,starts_at,ends_at,story_summary,scene_pack_id,journeys!inner(total_days,status)",
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
  const vote = bundle.vote ? (() => {
    const closed = nowMs >= new Date(bundle.vote.closes_at).getTime();
    const selected = bundle.vote.ballots.find((ballot) => ballot.voter_hash === visitorHash);
    return {
      id: bundle.vote.id,
      question: bundle.vote.question,
      opensAt: bundle.vote.opens_at,
      closesAt: bundle.vote.closes_at,
      status: closed ? "closed" as const : "open" as const,
      totalBallots: bundle.vote.ballots.length,
      selectedOptionId: selected?.option_id ?? null,
      options: bundle.vote.vote_options.map((option) => ({
        id: option.id,
        label: option.label,
        displayOrder: option.display_order,
        ...(closed ? { votes: bundle.vote!.ballots.filter((ballot) => ballot.option_id === option.id).length } : {}),
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
    activeEvent,
    nextEvent,
    vote,
    presence: {
      activeViewers: Number(bundle.runtime.out_active_viewers ?? 0),
      status: "live",
      ttlSeconds: config.presenceTtlSeconds,
    },
    steps: {
      global: Number(bundle.runtime.out_global_steps ?? 0),
      updatedAt: String(bundle.runtime.out_accounted_at),
      stale: false,
    },
    route: {
      globalActiveSeconds: Number(bundle.runtime.out_global_active_seconds ?? 0),
      authoritativeAt: String(bundle.runtime.out_accounted_at),
      walking: Number(bundle.runtime.out_active_viewers ?? 0) > 0,
    },
    sponsor: liveSponsor ? {
      status: "sponsored",
      publicId: liveSponsor.public_id,
      name: liveSponsor.sponsor_name,
      disclosure: liveSponsor.disclosure,
      patchUrl,
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
    assets: countryPack,
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
    .select("id,question,opens_at,closes_at,status,vote_options!vote_options_vote_id_fkey(id,label,display_order)")
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
    vote.vote_options as Array<{ id: string; label: string; display_order: number }>
  )
    .sort((a, b) => a.display_order - b.display_order)
    .map((option) => ({
      id: option.id,
      label: option.label,
      displayOrder: option.display_order,
      ...(closed
        ? { votes: ballotRows.filter((ballot) => ballot.option_id === option.id).length }
        : {}),
    }));

  return {
    id: vote.id,
    question: vote.question,
    opensAt: vote.opens_at,
    closesAt: vote.closes_at,
    status: closed ? "closed" : "open",
    totalBallots: ballotRows.length,
    selectedOptionId: selected?.option_id ?? null,
    options,
  };
}

export async function liveBootstrapSnapshot(
  visitorHash: string,
  now = new Date(),
): Promise<BootstrapSnapshot | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const config = serverRuntimeConfig();
  if (config.phase2Enabled) {
    const { data: bundle, error: bundleError } = await supabase.rpc("read_bootstrap_bundle_v3", {
      p_visitor_hash: visitorHash,
      p_real_now: now.toISOString(),
      p_ttl_seconds: config.presenceTtlSeconds,
      p_steps_per_second: config.stepsPerActiveSecond,
    });
    if (bundleError) throw bundleError;
    if (bundle) return bootstrapFromBundle(bundle as BootstrapBundleRow, visitorHash, config, supabase);
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
  const runtimeRequest = countryPack.schemaVersion === 3
    ? supabase.rpc("read_journey_runtime_v3", {
      p_country_day_id: countryDay.id,
      p_now: now.toISOString(),
      p_ttl_seconds: config.presenceTtlSeconds,
      p_steps_per_second: config.stepsPerActiveSecond,
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
  const [{ data: runtime, error: runtimeError }, events, vote] = await Promise.all([
    runtimeRequest,
    loadEvents(countryDay.id, storyNow),
    loadVote(countryDay.id, visitorHash, storyNow),
  ]);
  if (runtimeError) throw runtimeError;
  const row = Array.isArray(runtime) ? runtime[0] : runtime;
  let postcard: BootstrapSnapshot["postcard"] = {
    eligible: false,
    unlockSeconds: config.postcardUnlockSeconds,
    contributedSeconds: Number(row?.out_visitor_active_seconds ?? 0),
    url: null,
  };
  let sponsor: BootstrapSnapshot["sponsor"] = { status: "unsponsored" };
  if (config.phase2Enabled && countryPack.schemaVersion === 3) {
    const [{ data: contribution }, { data: existingPostcard }, { data: slot, error: sponsorError }] = await Promise.all([
      supabase.from("visitor_day_contributions").select("active_seconds").eq("country_day_id", countryDay.id).eq("visitor_hash", visitorHash).maybeSingle(),
      supabase.from("postcards").select("public_token,status,expires_at").eq("country_day_id", countryDay.id).eq("visitor_hash", visitorHash).eq("status", "ready").gt("expires_at", now.toISOString()).maybeSingle(),
      supabase.from("sponsor_slots").select("id,sponsorships!sponsorships_slot_id_fkey(public_id,status,sponsor_name,disclosure,public_creative_path,cta_label)").eq("country_day_id", countryDay.id).maybeSingle(),
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
      public_creative_path: string | null; cta_label: string | null;
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
        ctaLabel: liveSponsor.cta_label,
        clickUrl: liveSponsor.cta_label ? `/r/sponsor/${liveSponsor.public_id}` : null,
      };
    }
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
    activeEvent: events.activeEvent,
    nextEvent: events.nextEvent,
    vote,
    presence: {
      activeViewers: Number(row?.out_active_viewers ?? 0),
      status: "live",
      ttlSeconds: config.presenceTtlSeconds,
    },
    steps: {
      global: Number(row?.out_global_steps ?? 0),
      updatedAt: String(row?.out_accounted_at ?? now.toISOString()),
      stale: false,
    },
    route: {
      globalActiveSeconds: Number(row?.out_global_active_seconds ?? 0),
      authoritativeAt: String(row?.out_accounted_at ?? now.toISOString()),
      walking: Number(row?.out_active_viewers ?? 0) > 0,
    },
    sponsor,
    postcard,
    assets: countryPack,
  };
}
