import "server-only";

import { z } from "zod";
import { tashkentCountryPack } from "@/content/countries/tashkent.v1";
import { serverRuntimeConfig } from "@/lib/config/server";
import type {
  BootstrapSnapshot,
  CountryDayView,
  ScheduledEventView,
  VoteView,
} from "@/lib/contracts";
import { dialogueLineSchema, travelerStateSchema } from "@/lib/content/schema";
import { getServerSupabase } from "@/lib/supabase/server";

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
  journeys: { total_days: number } | Array<{ total_days: number }>;
};

type EventRow = {
  id: string;
  type: string;
  starts_at: string;
  duration_seconds: number;
  status: string;
  payload_json: unknown;
};

export async function findCurrentCountryDay(now: Date): Promise<CountryDayRow | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const iso = now.toISOString();
  const { data, error } = await supabase
    .from("country_days")
    .select(
      "id,day_number,country_code,country_name,city_name,time_zone,starts_at,ends_at,story_summary,journeys!inner(total_days,status)",
    )
    .in("status", ["scheduled", "live"])
    .eq("journeys.status", "active")
    .lte("starts_at", iso)
    .gt("ends_at", iso)
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as CountryDayRow | null;
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
      events.find((event) => new Date(event.startsAt).getTime() > nowMs) ?? null,
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
    .select("id,question,opens_at,closes_at,status,vote_options(id,label,display_order)")
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
  const countryDay = await findCurrentCountryDay(now);
  if (!countryDay) return null;
  const config = serverRuntimeConfig();
  const [{ data: runtime, error: runtimeError }, events, vote] = await Promise.all([
    supabase.rpc("record_presence_heartbeat", {
      p_country_day_id: countryDay.id,
      p_visitor_hash: null,
      p_session_hash: null,
      p_state: "observe",
      p_scene_ready: false,
      p_now: now.toISOString(),
      p_ttl_seconds: config.presenceTtlSeconds,
      p_steps_per_second: config.stepsPerActiveSecond,
    }),
    loadEvents(countryDay.id, now),
    loadVote(countryDay.id, visitorHash, now),
  ]);
  if (runtimeError) throw runtimeError;
  const row = Array.isArray(runtime) ? runtime[0] : runtime;

  return {
    serverNow: now.toISOString(),
    mode: "live",
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
    sponsor: { status: "unsponsored" },
    assets: tashkentCountryPack,
  };
}
