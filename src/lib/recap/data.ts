import "server-only";

import { getCountryPack } from "@/content/countries/registry";
import { serverRuntimeConfig } from "@/lib/config/server";
import { getServerSupabase } from "@/lib/supabase/server";

export type RecapCountry = { code: string; watchSeconds: number; rank: number };
export type RecapPhoto = { url: string; atDistanceMetres: number };

export type RecapDay = {
  countryDayId: string;
  journeyId: string;
  dayNumber: number;
  cityName: string;
  countryName: string;
  countryCode: string;
  date: string;
  scenePackId: string;
  distanceMetres: number;
  landmarkReached: boolean;
  marathon: boolean;
  peakWatchers: number;
  uniqueWatchers: number;
  countriesCount: number;
  topCountry: string | null;
  topCountries: RecapCountry[];
  recapImagePath: string | null;
  recapImageUrl: string | null;
  phrase: { original: string; transliteration: string; gloss: string; pronunciation: string } | null;
  photos: RecapPhoto[];
  sponsor: { name: string; publicId: string } | null;
  voteResult: { label: string; countryCode: string | null; votes: number; totalBallots: number; percent: number } | null;
  tomorrow: { dayNumber: number; cityName: string; countryName: string; countryCode: string } | null;
};

function parseTopCountries(value: unknown): RecapCountry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const code = typeof row.code === "string" ? row.code.trim().toUpperCase() : "";
    const watchSeconds = Number(row.watchSeconds);
    const rank = Number(row.rank);
    return /^[A-Z]{2}$/.test(code) && Number.isFinite(watchSeconds) && Number.isInteger(rank)
      ? [{ code, watchSeconds: Math.max(0, watchSeconds), rank }]
      : [];
  });
}

export async function loadRecapDay(dayNumber: number): Promise<RecapDay | null> {
  if (!Number.isInteger(dayNumber) || dayNumber < 1) return null;
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const { data: journey } = await supabase.from("journeys").select("id").in("status", ["preview", "active", "completed"]).order("starts_at", { ascending: false }).limit(1).maybeSingle();
  if (!journey) return null;
  const { data: day } = await supabase.from("country_days").select("id,journey_id,day_number,city_name,country_name,country_code,starts_at,scene_pack_id").eq("journey_id", journey.id).eq("day_number", dayNumber).maybeSingle();
  if (!day) return null;

  const [{ data: outcome }, { data: photoRows }, { data: slot }, { data: vote }, { data: tomorrow }] = await Promise.all([
    supabase.from("day_outcomes").select("distance_metres,landmark_reached,marathon,peak_watchers,unique_watchers,countries_count,top_country,top_countries,recap_image_path").eq("country_day_id", day.id).maybeSingle(),
    supabase.from("day_photos").select("storage_path,at_distance_metres").eq("country_day_id", day.id).order("at_active_second", { ascending: true }),
    supabase.from("sponsor_slots").select("id").eq("country_day_id", day.id).maybeSingle(),
    supabase.from("votes").select("id,result_option_id").eq("country_day_id", day.id).order("opens_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("country_days").select("day_number,city_name,country_name,country_code").eq("journey_id", journey.id).eq("day_number", dayNumber + 1).maybeSingle(),
  ]);
  if (!outcome) return null;

  const [{ data: sponsorship }, { data: resultOption }, { data: ballots }] = await Promise.all([
    slot
      ? supabase.from("sponsorships").select("sponsor_name,public_id").eq("slot_id", slot.id).in("status", ["approved", "scheduled", "live", "completed"]).order("created_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    vote?.result_option_id
      ? supabase.from("vote_options").select("label,country_code").eq("id", vote.result_option_id).maybeSingle()
      : Promise.resolve({ data: null }),
    vote
      ? supabase.from("ballots").select("option_id").eq("vote_id", vote.id)
      : Promise.resolve({ data: [] }),
  ]);
  const winnerVotes = vote?.result_option_id
    ? (ballots ?? []).filter((ballot) => ballot.option_id === vote.result_option_id).length
    : 0;
  const totalBallots = (ballots ?? []).length;
  const pack = getCountryPack(day.scene_pack_id);
  const phrase = pack && "localPhrases" in pack ? pack.localPhrases[0] ?? null : null;
  const config = serverRuntimeConfig();
  const recapImagePath = typeof outcome.recap_image_path === "string" ? outcome.recap_image_path : null;

  return {
    countryDayId: day.id,
    journeyId: day.journey_id,
    dayNumber: day.day_number,
    cityName: day.city_name,
    countryName: day.country_name,
    countryCode: day.country_code.trim(),
    date: day.starts_at,
    scenePackId: day.scene_pack_id,
    distanceMetres: Number(outcome.distance_metres),
    landmarkReached: Boolean(outcome.landmark_reached),
    marathon: Boolean(outcome.marathon),
    peakWatchers: Number(outcome.peak_watchers),
    uniqueWatchers: Number(outcome.unique_watchers),
    countriesCount: Number(outcome.countries_count),
    topCountry: outcome.top_country ? String(outcome.top_country).trim() : null,
    topCountries: parseTopCountries(outcome.top_countries),
    recapImagePath,
    recapImageUrl: recapImagePath
      ? supabase.storage.from(config.recapBucket).getPublicUrl(recapImagePath).data.publicUrl
      : null,
    phrase,
    photos: (photoRows ?? []).map((photo) => ({
      url: supabase.storage.from(config.dayPhotoBucket).getPublicUrl(photo.storage_path).data.publicUrl,
      atDistanceMetres: Number(photo.at_distance_metres),
    })),
    sponsor: sponsorship ? { name: sponsorship.sponsor_name, publicId: sponsorship.public_id } : null,
    voteResult: resultOption && vote ? {
      label: resultOption.label,
      countryCode: resultOption.country_code ? resultOption.country_code.trim() : null,
      votes: winnerVotes,
      totalBallots,
      percent: totalBallots > 0 ? Math.round(winnerVotes / totalBallots * 100) : 0,
    } : null,
    tomorrow: tomorrow ? {
      dayNumber: tomorrow.day_number,
      cityName: tomorrow.city_name,
      countryName: tomorrow.country_name,
      countryCode: tomorrow.country_code.trim(),
    } : null,
  };
}
