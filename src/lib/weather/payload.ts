import type { JourneyWeather } from "@/lib/weather/open-meteo";

/**
 * Normalizes a stored weather reading. Anything incomplete becomes null, so the
 * HUD shows no temperature rather than an invented one.
 */
export function weatherFromRow(payload: unknown): JourneyWeather | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const code = Number(row.code);
  const tempC = Number(row.tempC);
  const windKmh = Number(row.windKmh);
  const fetchedAt = typeof row.fetchedAt === "string" ? row.fetchedAt : null;
  if (!Number.isFinite(code) || !Number.isFinite(tempC) || !fetchedAt) return null;
  if (!Number.isFinite(Date.parse(fetchedAt))) return null;
  return {
    code: Math.round(code),
    tempC,
    windKmh: Number.isFinite(windKmh) ? Math.max(0, windKmh) : 0,
    isDay: row.isDay === true,
    fetchedAt,
  };
}
