import { weatherEffect } from "@/lib/weather/effects";

/** A single glyph for the current sky, matching the WMO effect table. */
export function weatherGlyph(code: number, isDay = true): string {
  if (!Number.isFinite(code)) return isDay ? "☀" : "☾";
  const wmo = Math.round(code);
  if (wmo === 0 || wmo === 1) return isDay ? "☀" : "☾";
  if (wmo === 2) return "⛅";
  if (wmo === 3) return "☁";
  if (wmo === 45 || wmo === 48) return "🌫";
  if (wmo >= 95) return "⛈";
  const effect = weatherEffect(wmo);
  if (effect.precipitation === "snow") return "❄";
  if (effect.precipitation === "rain") return "🌧";
  return isDay ? "☀" : "☾";
}

/** "21°" — whole degrees, because a tenth of a degree is not a real signal. */
export function formatTemperature(celsius: number): string {
  if (!Number.isFinite(celsius)) return "—°";
  return `${Math.round(celsius)}°`;
}
