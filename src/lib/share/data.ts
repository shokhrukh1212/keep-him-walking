import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import { latestJourney } from "@/lib/season/data";

export type ShareDay = { id: string; dayNumber: number; cityName: string; countryName: string; countryCode: string; timeZone: string; startsAt: string; endsAt: string };

export async function shareDay(dayNumber?: number): Promise<ShareDay | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const journey = await latestJourney();
  if (!journey) return null;
  let query = supabase.from("country_days").select("id,day_number,city_name,country_name,country_code,time_zone,starts_at,ends_at").eq("journey_id", journey.id);
  query = dayNumber === undefined
    ? query.lte("starts_at", new Date().toISOString()).order("starts_at", { ascending: false }).limit(1)
    : query.eq("day_number", dayNumber).limit(1);
  const { data } = await query.maybeSingle();
  return data ? { id: data.id, dayNumber: data.day_number, cityName: data.city_name, countryName: data.country_name, countryCode: data.country_code.trim(), timeZone: data.time_zone, startsAt: data.starts_at, endsAt: data.ends_at } : null;
}
