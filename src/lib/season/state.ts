import "server-only";

import type { SeasonRecapView, SeasonSponsorView, SeasonView } from "@/lib/contracts";
import { serverRuntimeConfig } from "@/lib/config/server";
import { seasonSaleCutoffHours } from "@/lib/config/sponsorship";
import { getServerSupabase } from "@/lib/supabase/server";
import { seasonPhaseAt, type SeasonPhase, type SeasonRecord } from "./clock";

type Supabase = NonNullable<ReturnType<typeof getServerSupabase>>;

export type SeasonRow = SeasonRecord & { travelerName: string | null; rolloverUtcHour: number };

/** Every configured seven-day season, oldest first. Open-ended journeys are not seasons. */
export async function loadSeasons(supabase: Supabase): Promise<SeasonRow[]> {
  const { data, error } = await supabase.from("journeys")
    .select("id,season_number,title,status,starts_at,ends_at,total_days,traveler_name,rollover_utc_hour")
    .not("ends_at", "is", null)
    .eq("phase2_enabled", true)
    .in("status", ["draft", "preview", "active", "completed"])
    .order("starts_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    number: Number(row.season_number),
    title: String(row.title),
    status: row.status as SeasonRow["status"],
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    totalDays: Number(row.total_days),
    travelerName: row.traveler_name ?? null,
    rolloverUtcHour: Number(row.rollover_utc_hour ?? 16),
  }));
}

/**
 * The season clock and the season sponsor placement, reconciled. Both RPCs are
 * state-based and take the row locks, so this is safe from a scheduler, a late
 * page read or two of them at once.
 */
export async function reconcileSeasonsNow(supabase: Supabase, now: Date) {
  const config = serverRuntimeConfig();
  const { data: seasons, error } = await supabase.rpc("reconcile_season_state", {
    p_real_now: now.toISOString(),
    p_ttl_seconds: config.presenceTtlSeconds,
    p_steps_per_second: config.stepsPerActiveSecond,
    p_pace_cap: config.paceCap,
  });
  if (error) throw error;
  const { data: sponsors, error: sponsorError } = await supabase.rpc("reconcile_season_sponsorships", {
    p_real_now: now.toISOString(),
    p_cutoff_hours: seasonSaleCutoffHours(),
  });
  if (sponsorError) throw sponsorError;
  return { seasons, sponsors };
}

/** Where the seasons stand now, catching up first if a stored status lags its timestamps. */
export async function currentSeasonPhase(supabase: Supabase, now: Date): Promise<{ phase: SeasonPhase; seasons: SeasonRow[] }> {
  let seasons = await loadSeasons(supabase);
  let phase = seasonPhaseAt(seasons, now.getTime());
  if (phase.needsReconcile) {
    await reconcileSeasonsNow(supabase, now);
    seasons = await loadSeasons(supabase);
    phase = seasonPhaseAt(seasons, now.getTime());
  }
  return { phase, seasons };
}

/** Totals from the immutable day outcomes only: nothing is projected or estimated. */
export async function seasonRecap(supabase: Supabase, season: Pick<SeasonRecord, "id" | "totalDays">): Promise<SeasonRecapView> {
  const { data: days, error } = await supabase.from("country_days")
    .select("id,day_number,city_name,country_code")
    .eq("journey_id", season.id)
    .order("day_number", { ascending: true });
  if (error) throw error;
  const rows = days ?? [];
  const distanceByDay = new Map<string, number>();
  if (rows.length) {
    const { data: outcomes, error: outcomeError } = await supabase.from("day_outcomes")
      .select("country_day_id,distance_metres")
      .in("country_day_id", rows.map((day) => day.id));
    if (outcomeError) throw outcomeError;
    for (const outcome of outcomes ?? []) distanceByDay.set(String(outcome.country_day_id), Number(outcome.distance_metres));
  }
  return {
    distanceMetres: [...distanceByDay.values()].reduce((sum, metres) => sum + metres, 0),
    finalizedDays: distanceByDay.size,
    totalDays: season.totalDays,
    citiesWalked: rows
      .filter((day) => (distanceByDay.get(String(day.id)) ?? 0) > 0)
      .map((day) => ({ dayNumber: Number(day.day_number), cityName: String(day.city_name), countryCode: String(day.country_code).trim() })),
  };
}

const SPONSOR_STATUSES = {
  live: ["scheduled", "active"],
  completed: ["active", "completed"],
} as const;

/** The approved, paid sponsor for a season; a refunded or removed booking is never shown. */
export async function seasonSponsorFor(
  supabase: Supabase,
  season: Pick<SeasonRecord, "id" | "number">,
  state: SeasonSponsorView["state"],
): Promise<SeasonSponsorView | null> {
  const { data, error } = await supabase.from("season_sponsorships")
    .select("public_id,product_name,description,public_logo_path")
    .eq("journey_id", season.id)
    .in("status", [...SPONSOR_STATUSES[state]])
    .order("paid_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.public_logo_path) return null;
  const bucket = serverRuntimeConfig().sponsorPublicBucket;
  return {
    publicId: String(data.public_id),
    seasonNumber: season.number,
    name: String(data.product_name),
    description: String(data.description),
    logoUrl: supabase.storage.from(bucket).getPublicUrl(String(data.public_logo_path)).data.publicUrl,
    href: `/r/season-sponsor/${data.public_id}`,
    state,
  };
}

export function seasonView(
  season: SeasonRecord,
  state: SeasonView["state"],
  recap: SeasonRecapView | null,
  next: SeasonRecord | null,
): SeasonView {
  return {
    id: season.id,
    number: season.number,
    title: season.title,
    startsAt: season.startsAt,
    endsAt: season.endsAt,
    totalDays: season.totalDays,
    state,
    recap,
    next: next ? { number: next.number, title: next.title, startsAt: next.startsAt } : null,
  };
}
