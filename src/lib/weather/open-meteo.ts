import { z } from "zod";

/** The cached weather the server owns. The browser never fetches it. */
export type JourneyWeather = {
  code: number;
  tempC: number;
  windKmh: number;
  isDay: boolean;
  fetchedAt: string;
};

/** How long a reading stays fresh. One request per city per ten minutes. */
export const WEATHER_TTL_SECONDS = 600;

const openMeteoResponseSchema = z.object({
  current: z.object({
    temperature_2m: z.number(),
    weather_code: z.number(),
    wind_speed_10m: z.number(),
    is_day: z.number(),
  }),
});

/** Parses an Open-Meteo payload. Anything malformed yields null, never a guess. */
export function parseOpenMeteo(payload: unknown, fetchedAt: string): JourneyWeather | null {
  const parsed = openMeteoResponseSchema.safeParse(payload);
  if (!parsed.success) return null;
  const current = parsed.data.current;
  if (!Number.isFinite(current.temperature_2m) || !Number.isFinite(current.weather_code)) {
    return null;
  }
  return {
    code: Math.round(current.weather_code),
    tempC: current.temperature_2m,
    windKmh: Math.max(0, current.wind_speed_10m),
    isDay: current.is_day === 1,
    fetchedAt,
  };
}

/** True when a cached reading is old enough to refresh. */
export function weatherIsStale(
  weather: JourneyWeather | null,
  now: Date,
  ttlSeconds = WEATHER_TTL_SECONDS,
): boolean {
  if (!weather) return true;
  const fetchedAt = Date.parse(weather.fetchedAt);
  if (!Number.isFinite(fetchedAt)) return true;
  return now.getTime() - fetchedAt >= ttlSeconds * 1_000;
}

/** The ten-minute window a refresh belongs to, so only one request per window runs. */
export function weatherClaimKey(countryDayId: string, now: Date): string {
  const bucket = Math.floor(now.getTime() / (WEATHER_TTL_SECONDS * 1_000));
  return `weather:${countryDayId}:${bucket}`;
}

export function openMeteoUrl(lat: number, lon: number): string {
  const query = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,weather_code,wind_speed_10m,is_day",
  });
  return `https://api.open-meteo.com/v1/forecast?${query.toString()}`;
}

/**
 * One reading for one city. Free, no key, and never called from the browser.
 * A failure returns null so the HUD keeps showing the last confirmed reading.
 */
export async function fetchCurrentWeather(
  lat: number,
  lon: number,
  now = new Date(),
): Promise<JourneyWeather | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  try {
    const response = await fetch(openMeteoUrl(lat, lon), {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return null;
    return parseOpenMeteo(await response.json(), now.toISOString());
  } catch {
    return null;
  }
}
