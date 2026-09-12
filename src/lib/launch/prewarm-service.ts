import "server-only";

import { getCountryPack } from "@/content/countries/registry";
import { getServerSupabase } from "@/lib/supabase/server";
import { refreshWeatherIfStale } from "@/lib/weather/refresh";
import { ballotPrewarmPackIds, packPrewarmPaths, prewarmUrl } from "./prewarm";

async function warm(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return false;
    await response.arrayBuffer();
    return true;
  } catch {
    return false;
  }
}

export async function prewarmJourney(appOrigin: string, now = new Date()) {
  const supabase = getServerSupabase();
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data: journey, error: journeyError } = await supabase.from("journeys")
    .select("id").eq("phase2_enabled", true).in("status", ["preview", "active"])
    .order("starts_at", { ascending: false }).limit(1).maybeSingle();
  if (journeyError || !journey) throw journeyError ?? new Error("NO_JOURNEY");
  const { data: days, error: dayError } = await supabase.from("country_days")
    .select("id,starts_at,ends_at,scene_pack_id")
    .eq("journey_id", journey.id).gt("ends_at", now.toISOString())
    .order("starts_at", { ascending: true }).limit(1);
  const day = days?.[0];
  if (dayError || !day) throw dayError ?? new Error("NO_DAY");

  let packIds: string[];
  if (new Date(day.starts_at).getTime() > now.getTime()) {
    packIds = [day.scene_pack_id];
  } else {
    const { data: vote } = await supabase.from("votes")
      .select("kind,vote_options!vote_options_vote_id_fkey(pack_id)")
      .eq("country_day_id", day.id).eq("status", "open").limit(1).maybeSingle();
    packIds = ballotPrewarmPackIds(
      vote?.kind ?? null,
      (vote?.vote_options ?? []) as Array<{ pack_id: string | null }>,
    );
  }
  const packs = packIds.flatMap((id) => {
    const pack = getCountryPack(id);
    return pack ? [pack] : [];
  });
  if (packs.length !== packIds.length || packs.length === 0) throw new Error("PACK_UNAVAILABLE");
  const assetUrls = [...new Set(packs.flatMap(packPrewarmPaths).map(
    (path) => prewarmUrl(path, process.env.ASSET_BASE_URL, appOrigin),
  ))];
  const ogUrls = [new URL("/api/og/day", appOrigin).toString()];
  const [assetResults, ogResults] = await Promise.all([
    Promise.all(assetUrls.map(warm)),
    Promise.all(ogUrls.map(warm)),
    refreshWeatherIfStale(day.id, day.scene_pack_id, null, now),
  ]);
  return {
    ok: assetResults.every(Boolean) && ogResults.every(Boolean),
    packs: packIds,
    assets: { requested: assetUrls.length, ready: assetResults.filter(Boolean).length },
    og: { requested: ogUrls.length, ready: ogResults.filter(Boolean).length },
  };
}
