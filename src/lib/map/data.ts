import "server-only";

import { getCountryPack } from "@/content/countries/registry";
import { getServerSupabase } from "@/lib/supabase/server";
import { stampFor } from "@/lib/outcomes/stamp";
import { latestJourney } from "@/lib/season/data";
import { SEASON_ONE_ROUTE } from "@/lib/season/anniversary";

/**
 * /api/map has published these words since P14, so the map keeps them. The
 * decision behind them is `stampFor`, shared with the passport and the recap.
 */
const MAP_OUTCOME = { gold: "marathon", colour: "landmark", grey: "unfinished", current: "current" } as const;

export type MapCity = {
  countryDayId: string;
  dayNumber: number;
  cityName: string;
  countryName: string;
  countryCode: string;
  scenePackId: string;
  lat: number;
  lon: number;
  status: "completed" | "current" | "upcoming";
  outcome: "unfinished" | "landmark" | "marathon" | "current";
  distanceMetres: number;
  transferFromPrevious: "walk" | "train" | "flight" | null;
};

export type MapCandidate = {
  optionId: string;
  label: string;
  countryCode: string;
  lat: number;
  lon: number;
  percent: number;
  transfer: "walk" | "train" | "flight";
};

export type JourneyMapData = {
  cities: MapCity[];
  candidates: MapCandidate[];
  ticketFlights: Array<{
    ticketId: string;
    dayNumber: number;
    countryCode: string;
    countryName: string;
    cityName: string;
    lat: number;
    lon: number;
  }>;
  stats: { days: number; confirmedDistanceMetres: number; landmarks: number; marathons: number };
  currentDayNumber: number | null;
};

export async function loadJourneyMap(): Promise<JourneyMapData | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  let journey = await latestJourney();
  // The configured virtual route is useful during the public preview before the
  // scheduler promotes Season 1 from draft. It remains all-upcoming until a
  // server-confirmed country day becomes live.
  if (!journey) {
    const { data } = await supabase.from("journeys")
      .select("id,season_number,title,starts_at,total_days")
      .eq("season_number", 1).eq("status", "draft")
      .order("starts_at", { ascending: false }).limit(1).maybeSingle();
    journey = data ? { id: data.id, seasonNumber: data.season_number, title: data.title, startsAt: data.starts_at, totalDays: data.total_days } : null;
  }
  if (!journey) return null;
  const { data: days } = await supabase.from("country_days").select("id,day_number,city_name,country_name,country_code,scene_pack_id,status,arrival_mode").eq("journey_id", journey.id).order("day_number", { ascending: true });
  const dayRows = days ?? [];
  const dayIds = dayRows.filter((day) => day.status === "completed" || day.status === "live").map((day) => day.id);
  const [{ data: outcomes }, { data: runtimes }] = await Promise.all([
    supabase.from("day_outcomes").select("country_day_id,distance_metres,landmark_reached,marathon").in("country_day_id", dayIds),
    supabase.from("journey_runtime").select("country_day_id,global_distance_metres").in("country_day_id", dayIds),
  ]);
  const outcomeByDay = new Map((outcomes ?? []).map((outcome) => [outcome.country_day_id, outcome]));
  const runtimeByDay = new Map((runtimes ?? []).map((runtime) => [runtime.country_day_id, runtime]));
  const cities = dayRows.flatMap<MapCity>((day, index) => {
    if (day.status !== "completed" && day.status !== "live") return [];
    const pack = getCountryPack(day.scene_pack_id);
    if (!pack) return [];
    const outcome = outcomeByDay.get(day.id);
    const previous = index > 0 ? getCountryPack(dayRows[index - 1]!.scene_pack_id) : null;
    const transfer = previous
      ? day.arrival_mode === "flight" || day.arrival_mode === "train"
        ? day.arrival_mode
        : !previous.neighbours.includes(day.scene_pack_id)
          ? "flight" as const
          : "walk" as const
      : null;
    return [{
      countryDayId: day.id,
      dayNumber: day.day_number,
      cityName: day.city_name,
      countryName: day.country_name,
      countryCode: day.country_code.trim(),
      scenePackId: day.scene_pack_id,
      lat: pack.lat,
      lon: pack.lon,
      status: day.status === "live" ? "current" : "completed",
      outcome: MAP_OUTCOME[stampFor({ outcome: outcome ? { marathon: outcome.marathon, landmarkReached: outcome.landmark_reached } : null, status: day.status as "completed" | "live" }) ?? "grey"],
      distanceMetres: Number(outcome?.distance_metres ?? runtimeByDay.get(day.id)?.global_distance_metres ?? 0),
      transferFromPrevious: transfer,
    }];
  });

  if (journey.seasonNumber === 1) {
    const byNumber = new Map(cities.map((city) => [city.dayNumber, city]));
    cities.splice(0, cities.length, ...SEASON_ONE_ROUTE.map((stop, index): MapCity => {
      const stored = byNumber.get(index + 1);
      if (stored?.scenePackId === stop.packId && stored.cityName === stop.city) return stored;
      return {
      countryDayId: `planned-${index + 1}`,
      dayNumber: index + 1,
      cityName: stop.city,
      countryName: stop.country,
      countryCode: stop.code,
      scenePackId: stop.packId,
      lat: stop.lat,
      lon: stop.lon,
      status: "upcoming",
      outcome: "unfinished",
      distanceMetres: 0,
      transferFromPrevious: index === 0 ? null : "transferFromPrevious" in stop ? stop.transferFromPrevious : "train",
      };
    }));
  }

  const current = cities.find((city) => city.status === "current") ?? [...cities].reverse().find((city) => city.status === "completed") ?? null;
  const { data: ticketRows } = await supabase.from("tickets")
    .select("id,target_day_number,country_code,country_name,city_name,lat,lon")
    .eq("journey_id", journey.id).eq("status", "approved")
    .gt("target_day_number", current?.dayNumber ?? 0)
    .order("target_day_number", { ascending: true });
  const ticketFlights = (ticketRows ?? []).map((ticket) => ({
    ticketId: ticket.id,
    dayNumber: ticket.target_day_number,
    countryCode: ticket.country_code.trim(),
    countryName: ticket.country_name,
    cityName: ticket.city_name,
    lat: Number(ticket.lat), lon: Number(ticket.lon),
  }));
  let candidates: MapCandidate[] = [];
  if (current) {
    const { data: vote } = await supabase.from("votes").select("id").eq("country_day_id", current.countryDayId).eq("status", "open").order("opens_at", { ascending: false }).limit(1).maybeSingle();
    if (vote) {
      const [{ data: options }, { data: ballots }] = await Promise.all([
        supabase.from("vote_options").select("id,label,pack_id,display_order").eq("vote_id", vote.id).order("display_order", { ascending: true }),
        supabase.from("ballots").select("option_id").eq("vote_id", vote.id),
      ]);
      const total = (ballots ?? []).length;
      const currentPack = getCountryPack(current.scenePackId);
      candidates = (options ?? []).flatMap<MapCandidate>((option) => {
        const pack = option.pack_id ? getCountryPack(option.pack_id) : null;
        if (!pack) return [];
        const votes = (ballots ?? []).filter((ballot) => ballot.option_id === option.id).length;
        return [{
          optionId: option.id,
          label: option.label,
          countryCode: pack.countryCode,
          lat: pack.lat,
          lon: pack.lon,
          percent: total > 0 ? Math.round(votes / total * 100) : 0,
          transfer: currentPack?.neighbours.includes(pack.assetVersion) ? "walk" : "flight",
        }];
      });
    }
  }
  return {
    cities,
    candidates,
    ticketFlights,
    stats: {
      days: cities.filter((city) => city.status === "completed" || city.status === "current").length,
      confirmedDistanceMetres: cities.reduce((sum, city) => sum + city.distanceMetres, 0),
      landmarks: cities.filter((city) => city.outcome === "landmark" || city.outcome === "marathon").length,
      marathons: cities.filter((city) => city.outcome === "marathon").length,
    },
    currentDayNumber: current?.dayNumber ?? null,
  };
}
