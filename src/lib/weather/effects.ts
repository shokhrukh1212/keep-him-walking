/** What the sky is doing, derived only from the WMO code the server fetched. */
export type WeatherEffect = {
  precipitation: "none" | "rain" | "snow";
  fog: boolean;
  /** Thunderstorms flash. Never rendered under prefers-reduced-motion. */
  flash: boolean;
  /** Multiplies the hour's exposure: overcast dims, clear leaves it alone. */
  contrastScale: number;
  /** Scales particle and leaf velocity. Wind above 30 km/h speeds the world up. */
  windScale: number;
  /** The status-pill fragment, or null when the weather is unremarkable. */
  pillFragment: string | null;
};

const CLEAR: WeatherEffect = {
  precipitation: "none",
  fog: false,
  flash: false,
  contrastScale: 1,
  windScale: 1,
  pillFragment: null,
};

function windScaleFor(windKmh: number): number {
  const wind = Number.isFinite(windKmh) ? Math.max(0, windKmh) : 0;
  // Below 30 km/h the world moves normally; above it, up to twice as fast.
  return wind <= 30 ? 1 : Math.min(2, 1 + (wind - 30) / 60);
}

/**
 * WMO weather code to what the scene does, per 02 §7. Anything unrecognized is
 * clear weather rather than a guess.
 */
export function weatherEffect(code: number, windKmh = 0): WeatherEffect {
  const windScale = windScaleFor(windKmh);
  const base = { ...CLEAR, windScale };
  if (!Number.isFinite(code)) return base;
  const wmo = Math.round(code);

  // 0-2 clear to partly cloudy: nothing but wind.
  if (wmo >= 0 && wmo <= 2) return base;
  // 3 overcast: ten per cent less contrast.
  if (wmo === 3) return { ...base, contrastScale: 0.9 };
  // 45, 48 fog.
  if (wmo === 45 || wmo === 48) {
    return { ...base, fog: true, contrastScale: 0.92, pillFragment: "in the fog" };
  }
  // 51-67 drizzle and rain, 80-82 rain showers.
  if ((wmo >= 51 && wmo <= 67) || (wmo >= 80 && wmo <= 82)) {
    return { ...base, precipitation: "rain", contrastScale: 0.94, pillFragment: "in the rain" };
  }
  // 71-77 snow, 85-86 snow showers.
  if ((wmo >= 71 && wmo <= 77) || wmo === 85 || wmo === 86) {
    return { ...base, precipitation: "snow", contrastScale: 0.97, pillFragment: "in the snow" };
  }
  // 95-99 thunderstorm: rain plus a rare flash.
  if (wmo >= 95 && wmo <= 99) {
    return {
      ...base,
      precipitation: "rain",
      flash: true,
      contrastScale: 0.88,
      pillFragment: "through a thunderstorm",
    };
  }
  return base;
}
