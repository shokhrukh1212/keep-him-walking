import { describe, expect, it } from "vitest";
import { confirmedWeatherAgeSeconds, providerReadiness } from "./readiness";

describe("launch health facts", () => {
  it("rejects fixture payments in production and reports missing live credentials", () => {
    expect(providerReadiness({ VERCEL_ENV: "production", SPONSOR_PAYMENT_PROVIDER: "fixture" }).payments)
      .toBe("unavailable");
    expect(providerReadiness({ SPONSOR_PAYMENT_PROVIDER: "lemonsqueezy" }).payments)
      .toBe("unconfigured");
  });

  it("keeps weather dormant unless its launch flag is explicitly enabled", () => {
    expect(providerReadiness({ WEATHER_PROVIDER: "open-meteo" }).weather).toBe("disabled");
    expect(providerReadiness({ WEATHER_ENABLED: "true", WEATHER_PROVIDER: "open-meteo" }).weather)
      .toBe("ready");
  });

  it("measures only a confirmed weather timestamp", () => {
    expect(confirmedWeatherAgeSeconds({ fetchedAt: "2034-01-01T00:00:00Z" }, new Date("2034-01-01T00:10:01Z")))
      .toBe(601);
    expect(confirmedWeatherAgeSeconds({}, new Date())).toBeNull();
  });
});
