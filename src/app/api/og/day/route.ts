import { getServerSupabase } from "@/lib/supabase/server";
import { flagEmoji } from "@/lib/countries/flags";
import { watcherBucket } from "@/lib/share/bucket";
import { shareDay } from "@/lib/share/data";
import { shareImage } from "@/lib/share/image";

export async function GET() {
  const day = await shareDay();
  const supabase = getServerSupabase();
  if (!day || !supabase) return new Response("Day unavailable", { status: 404, headers: { "Cache-Control": "no-store" } });
  const [{ data: runtime }, { data: countries }] = await Promise.all([
    supabase.from("journey_runtime").select("active_viewers").eq("country_day_id", day.id).maybeSingle(),
    supabase.from("country_day_watch").select("country_code,watch_seconds").eq("country_day_id", day.id).gt("watch_seconds", 0).order("watch_seconds", { ascending: false }).limit(4),
  ]);
  const flags = (countries ?? []).map((row) => flagEmoji(row.country_code.trim())).join(" ");
  return shareImage({
    eyebrow: `DAY ${day.dayNumber} · SEASON 1`,
    title: `${day.cityName}, ${day.countryName}`,
    subtitle: "He only walks while someone is watching.",
    stats: [watcherBucket(Number(runtime?.active_viewers ?? 0)), flags || "Waiting for the first country"],
  });
}
