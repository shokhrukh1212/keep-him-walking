import "server-only";

import { serverRuntimeConfig } from "@/lib/config/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { loadRecapDay } from "./data";
import { renderRecapImage } from "./image";

export type PendingRecap = { countryDayId: string; dayNumber: number };

export async function storePendingRecaps(entries: PendingRecap[]) {
  const supabase = getServerSupabase();
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const bucket = serverRuntimeConfig().recapBucket;
  const stored: string[] = [];
  for (const entry of entries) {
    // Each card is drawn from its own journey: a season that has just ended is no
    // longer the latest one when its last day's card is made.
    const { data: day, error: dayError } = await supabase.from("country_days")
      .select("journey_id").eq("id", entry.countryDayId).maybeSingle();
    if (dayError || !day) throw new Error("RECAP_DATA_UNAVAILABLE");
    const recap = await loadRecapDay(entry.dayNumber, String(day.journey_id));
    if (!recap || recap.countryDayId !== entry.countryDayId) throw new Error("RECAP_DATA_UNAVAILABLE");
    const path = `${recap.journeyId}/day-${recap.dayNumber}.png`;
    const png = new Uint8Array(await renderRecapImage(recap).arrayBuffer());
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, png, {
      contentType: "image/png",
      cacheControl: "31536000",
      upsert: true,
    });
    if (uploadError) throw uploadError;
    const { error: updateError } = await supabase.from("day_outcomes").update({ recap_image_path: path }).eq("country_day_id", recap.countryDayId).is("recap_image_path", null);
    if (updateError) throw updateError;
    stored.push(path);
  }
  return stored;
}
