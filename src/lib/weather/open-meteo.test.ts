import { describe, expect, it } from "vitest";
import {
  openMeteoUrl,
  parseOpenMeteo,
  weatherClaimKey,
  weatherIsStale,
} from "./open-meteo";

const FETCHED_AT = "2026-09-24T12:00:00.000Z";

describe("parseOpenMeteo", () => {
  it("reads a well-formed current reading", () => {
    const weather = parseOpenMeteo({
      current: { temperature_2m: 21.3, weather_code: 61, wind_speed_10m: 12.4, is_day: 1 },
    }, FETCHED_AT);
    expect(weather).toEqual({
      code: 61,
      tempC: 21.3,
      windKmh: 12.4,
      isDay: true,
      fetchedAt: FETCHED_AT,
    });
  });

  it("reads night as night", () => {
    const weather = parseOpenMeteo({
      current: { temperature_2m: 4, weather_code: 0, wind_speed_10m: 2, is_day: 0 },
    }, FETCHED_AT);
    expect(weather?.isDay).toBe(false);
  });

  it("returns null rather than inventing weather", () => {
    for (const payload of [
      null,
      {},
      { current: {} },
      { current: { temperature_2m: "warm", weather_code: 1, wind_speed_10m: 1, is_day: 1 } },
      { current: { temperature_2m: 20, wind_speed_10m: 1, is_day: 1 } },
    ]) {
      expect(parseOpenMeteo(payload, FETCHED_AT)).toBeNull();
    }
  });

  it("never reports negative wind", () => {
    const weather = parseOpenMeteo({
      current: { temperature_2m: 10, weather_code: 0, wind_speed_10m: -5, is_day: 1 },
    }, FETCHED_AT);
    expect(weather?.windKmh).toBe(0);
  });
});

describe("weatherIsStale", () => {
  const weather = { code: 0, tempC: 20, windKmh: 1, isDay: true, fetchedAt: FETCHED_AT };

  it("keeps a reading for ten minutes", () => {
    expect(weatherIsStale(weather, new Date("2026-09-24T12:09:59Z"))).toBe(false);
    expect(weatherIsStale(weather, new Date("2026-09-24T12:10:00Z"))).toBe(true);
  });

  it("treats a missing or malformed reading as stale", () => {
    expect(weatherIsStale(null, new Date(FETCHED_AT))).toBe(true);
    expect(weatherIsStale({ ...weather, fetchedAt: "nonsense" }, new Date(FETCHED_AT))).toBe(true);
  });
});

describe("weatherClaimKey", () => {
  it("is stable inside a ten-minute window and changes across one", () => {
    const day = "10000000-0000-4000-8000-000000000001";
    const first = weatherClaimKey(day, new Date("2026-09-24T12:00:00Z"));
    expect(weatherClaimKey(day, new Date("2026-09-24T12:09:59Z"))).toBe(first);
    expect(weatherClaimKey(day, new Date("2026-09-24T12:10:01Z"))).not.toBe(first);
  });
});

describe("openMeteoUrl", () => {
  it("asks for exactly the four current fields the scene uses", () => {
    const url = openMeteoUrl(41.2995, 69.2401);
    expect(url).toContain("https://api.open-meteo.com/v1/forecast?");
    expect(url).toContain("latitude=41.2995");
    expect(url).toContain("longitude=69.2401");
    expect(decodeURIComponent(url)).toContain("current=temperature_2m,weather_code,wind_speed_10m,is_day");
  });
});
