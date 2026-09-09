import { countryDisplayName, flagEmoji, formatWatchDuration } from "@/lib/countries/flags";
import { countryFromHeader, UNKNOWN_COUNTRY_CODE } from "@/lib/countries/header";
import { shareDay } from "@/lib/share/data";
import { getServerSupabase } from "@/lib/supabase/server";
import { shareImage } from "@/lib/share/image";

type Context = { params: Promise<{ cc: string }> };

export async function GET(_request: Request, { params }: Context) {
  const raw = (await params).cc;
  const code = countryFromHeader(raw);
  if (code === UNKNOWN_COUNTRY_CODE && raw.toUpperCase() !== UNKNOWN_COUNTRY_CODE) return new Response("Country unavailable", { status: 404 });
  const supabase = getServerSupabase();
  if (!supabase) return new Response("Country unavailable", { status: 404 });
  const latestDay = await shareDay();
  if (!latestDay) return new Response("Country unavailable", { status: 404 });
  const { data } = await supabase.from("country_day_watch").select("watch_seconds").eq("country_code", code).eq("country_day_id", latestDay.id);
  const seconds = (data ?? []).reduce((sum, row) => sum + Number(row.watch_seconds ?? 0), 0);
  const name = countryDisplayName(code);
  return shareImage({
    eyebrow: "THE HOME TEAM",
    title: `${flagEmoji(code)} ${name} kept him walking`,
    subtitle: `${formatWatchDuration(seconds)} today · confirmed watch time`,
    stats: [seconds > 0 ? "On the board" : "Be the first"],
  });
}
