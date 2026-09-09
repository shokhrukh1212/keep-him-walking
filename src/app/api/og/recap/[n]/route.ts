import { getServerSupabase } from "@/lib/supabase/server";
import { shareDay } from "@/lib/share/data";
import { shareImage } from "@/lib/share/image";

type Context = { params: Promise<{ n: string }> };

export async function GET(_request: Request, { params }: Context) {
  const dayNumber = Number((await params).n);
  const day = Number.isInteger(dayNumber) && dayNumber > 0 ? await shareDay(dayNumber) : null;
  const supabase = getServerSupabase();
  const { data: outcome } = day && supabase
    ? await supabase.from("day_outcomes").select("distance_metres,landmark_reached,marathon,unique_watchers,countries_count").eq("country_day_id", day.id).maybeSingle()
    : { data: null };
  if (!day || !outcome) return new Response("Recap unavailable", { status: 404, headers: { "Cache-Control": "no-store" } });
  const stamp = outcome.marathon ? "MARATHON" : outcome.landmark_reached ? "LANDMARK REACHED" : "UNFINISHED";
  return shareImage({
    eyebrow: `DAY ${day.dayNumber} · ${stamp}`,
    title: `${day.cityName} · ${(Number(outcome.distance_metres) / 1_000).toFixed(1)} km`,
    subtitle: `${Number(outcome.unique_watchers).toLocaleString()} watchers from ${Number(outcome.countries_count).toLocaleString()} countries`,
    stats: [day.countryName, outcome.marathon ? "Gold stamp" : outcome.landmark_reached ? "Colour stamp" : "Grey stamp"],
    accent: outcome.marathon ? "#ffe091" : outcome.landmark_reached ? "#8fd3ad" : "#b6bec0",
  });
}
