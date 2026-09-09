import "server-only";
import { getCountryPack } from "@/content/countries/registry";
import { getServerSupabase } from "@/lib/supabase/server";
import { weatherFromRow } from "@/lib/weather/payload";
import {
  fetchCurrentWeather,
  weatherClaimKey,
  weatherIsStale,
} from "@/lib/weather/open-meteo";

/**
 * Refreshes the current city's weather at most once every ten minutes, across
 * every server instance. The ten-minute window is claimed in `operation_ledger`
 * exactly like the rollover is, so a burst of visitors produces one request.
 *
 * Returns true when this call actually fetched.
 */
export async function refreshWeatherIfStale(
  countryDayId: string,
  scenePackId: string,
  storedWeather: unknown,
  now = new Date(),
): Promise<boolean> {
  const supabase = getServerSupabase();
  if (!supabase) return false;
  if (!weatherIsStale(weatherFromRow(storedWeather), now)) return false;

  const pack = getCountryPack(scenePackId);
  if (!pack || (pack.lat === 0 && pack.lon === 0)) return false;

  const operationKey = weatherClaimKey(countryDayId, now);
  const { data: claimed, error: claimError } = await supabase.rpc("claim_operation", {
    p_operation_key: operationKey,
    p_operation_type: "weather",
    p_now: now.toISOString(),
  });
  if (claimError || !claimed) return false;

  // claim_operation re-claims a failed row, so releasing the window on failure
  // is what lets the next visitor retry. Holding it would blank the temperature
  // for the rest of the ten minutes over one upstream hiccup.
  const release = async (status: "completed" | "failed") => {
    await supabase
      .from("operation_ledger")
      .update({
        status,
        completed_at: new Date().toISOString(),
        error_code: status === "failed" ? "WEATHER_UNAVAILABLE" : null,
      })
      .eq("operation_key", operationKey);
  };

  const weather = await fetchCurrentWeather(pack.lat, pack.lon, now);
  if (!weather) {
    await release("failed");
    return false;
  }

  const { error } = await supabase.rpc("write_journey_weather", {
    p_country_day_id: countryDayId,
    p_weather: weather,
    p_now: now.toISOString(),
  });
  await release(error ? "failed" : "completed");
  return !error;
}
