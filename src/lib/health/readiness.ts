export type ProviderState = "ready" | "disabled" | "unconfigured" | "unavailable";

export function providerReadiness(environment: Record<string, string | undefined>) {
  const weather: ProviderState = environment.WEATHER_ENABLED !== "true"
    ? "disabled"
    : (environment.WEATHER_PROVIDER ?? "open-meteo") === "open-meteo"
      ? "ready"
      : "unavailable";
  const fixture = environment.SPONSOR_PAYMENT_PROVIDER === "fixture";
  const lemonConfigured = [
    environment.LEMON_SQUEEZY_API_KEY,
    environment.LEMON_SQUEEZY_STORE_ID,
    environment.LEMON_SQUEEZY_VARIANT_ID,
    environment.LEMON_SQUEEZY_WEBHOOK_SECRET,
  ].every(Boolean);
  const payments: ProviderState = fixture
    ? environment.VERCEL_ENV === "production" ? "unavailable" : "ready"
    : lemonConfigured ? "ready" : "unconfigured";
  return { weather, payments };
}

export function confirmedWeatherAgeSeconds(weather: unknown, now: Date): number | null {
  if (!weather || typeof weather !== "object") return null;
  const fetchedAt = Date.parse(String((weather as { fetchedAt?: unknown }).fetchedAt ?? ""));
  if (!Number.isFinite(fetchedAt)) return null;
  return Math.max(0, Math.floor((now.getTime() - fetchedAt) / 1_000));
}
