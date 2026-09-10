import "server-only";

import { getServerSupabase } from "@/lib/supabase/server";
import { stampFor, type Stamp, type StampInput } from "@/lib/outcomes/stamp";

export type LatestJourney = { id: string; seasonNumber: number; title: string; startsAt: string; totalDays: number };

/**
 * The one place that answers "which journey is the current one".
 *
 * Four modules used to carry their own copy of this query, so a change to the
 * status list had to be made four times or not at all.
 */
export async function latestJourney(): Promise<LatestJourney | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const { data } = await supabase.from("journeys")
    .select("id,season_number,title,starts_at,total_days")
    .in("status", ["preview", "active", "completed"])
    .order("starts_at", { ascending: false }).limit(1).maybeSingle();
  return data
    ? { id: data.id, seasonNumber: data.season_number, title: data.title, startsAt: data.starts_at, totalDays: data.total_days }
    : null;
}

export type SeasonDay = {
  countryDayId: string;
  dayNumber: number;
  cityName: string;
  countryName: string;
  countryCode: string;
  scenePackId: string;
  startsAt: string;
  storySummary: string | null;
  /** Null while the day is unfinished: an empty frame, never a guessed colour. */
  stamp: Stamp | null;
  distanceMetres: number | null;
  uniqueWatchers: number | null;
};

export type SeasonSheet = {
  seasonNumber: number;
  title: string;
  startsAt: string;
  days: SeasonDay[];
  stats: {
    days: number;
    confirmedDistanceMetres: number;
    landmarks: number;
    marathons: number;
    countries: number;
    uniqueWatchers: number;
  };
};

/** Every published day of one season, each carrying the outcome that stamped it. */
export async function loadSeasonSheet(seasonNumber: number): Promise<SeasonSheet | null> {
  if (!Number.isInteger(seasonNumber) || seasonNumber < 1) return null;
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const { data: journey } = await supabase.from("journeys")
    .select("id,season_number,title,starts_at")
    .eq("season_number", seasonNumber)
    .in("status", ["preview", "active", "completed"])
    .order("starts_at", { ascending: false }).limit(1).maybeSingle();
  if (!journey) return null;

  const { data: dayRows } = await supabase.from("country_days")
    .select("id,day_number,city_name,country_name,country_code,scene_pack_id,starts_at,story_summary,status")
    .eq("journey_id", journey.id).in("status", ["completed", "live"])
    .order("day_number", { ascending: true });
  const days = dayRows ?? [];
  const { data: outcomeRows } = days.length
    ? await supabase.from("day_outcomes")
      .select("country_day_id,distance_metres,landmark_reached,marathon,unique_watchers")
      .in("country_day_id", days.map((day) => day.id))
    : { data: [] };
  const outcomeByDay = new Map((outcomeRows ?? []).map((row) => [row.country_day_id, row]));

  const sheet = days.map<SeasonDay>((day) => {
    const row = outcomeByDay.get(day.id);
    const outcome = row ? { marathon: row.marathon, landmarkReached: row.landmark_reached } : null;
    return {
      countryDayId: day.id,
      dayNumber: day.day_number,
      cityName: day.city_name,
      countryName: day.country_name,
      countryCode: day.country_code.trim(),
      scenePackId: day.scene_pack_id,
      startsAt: day.starts_at,
      storySummary: day.story_summary,
      stamp: stampFor({ outcome, status: day.status as StampInput["status"] }),
      distanceMetres: row ? Number(row.distance_metres) : null,
      uniqueWatchers: row ? Number(row.unique_watchers) : null,
    };
  });

  return {
    seasonNumber: journey.season_number,
    title: journey.title,
    startsAt: journey.starts_at,
    days: sheet,
    stats: {
      days: sheet.length,
      // Only finalized days count, so the total never shrinks after a rollover.
      confirmedDistanceMetres: sheet.reduce((sum, day) => sum + (day.distanceMetres ?? 0), 0),
      landmarks: sheet.filter((day) => day.stamp === "colour" || day.stamp === "gold").length,
      marathons: sheet.filter((day) => day.stamp === "gold").length,
      countries: new Set(sheet.map((day) => day.countryCode)).size,
      uniqueWatchers: sheet.reduce((sum, day) => sum + (day.uniqueWatchers ?? 0), 0),
    },
  };
}
