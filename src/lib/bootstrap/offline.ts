import { tashkentCountryPackV3 } from "@/content/countries/tashkent.v3";
import type { BootstrapSnapshot } from "@/lib/contracts";
import { DEFAULT_PRESENCE_TTL_SECONDS } from "@/lib/presence";

export function offlineBootstrapSnapshot(now = new Date()): BootstrapSnapshot {
  const startsAt = new Date(now);
  startsAt.setUTCHours(0, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1_000);

  return {
    serverNow: now.toISOString(),
    realServerNow: now.toISOString(),
    storyScale: 1,
    mode: "offline_preview",
    journeyState: "live",
    refresh: { nextAt: endsAt.toISOString(), afterMs: 5 * 60_000, reason: "country_rollover" },
    countryDay: {
      id: tashkentCountryPackV3.countryDayId,
      dayNumber: 1,
      totalDays: 195,
      countryCode: tashkentCountryPackV3.countryCode,
      countryName: tashkentCountryPackV3.countryName,
      cityName: tashkentCountryPackV3.cityName,
      timeZone: tashkentCountryPackV3.timeZone,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      storySummary: "The journey begins in Tashkent.",
      scenePackId: tashkentCountryPackV3.assetVersion,
    },
    activeEvent: null,
    nextEvent: null,
    vote: null,
    presence: {
      activeViewers: null,
      status: "offline",
      ttlSeconds: DEFAULT_PRESENCE_TTL_SECONDS,
    },
    steps: { global: 0, updatedAt: now.toISOString(), stale: true },
    route: { globalActiveSeconds: 0, authoritativeAt: now.toISOString(), walking: false },
    sponsor: { status: "unsponsored" },
    postcard: { eligible: false, unlockSeconds: 60, contributedSeconds: 0, url: null },
    assets: tashkentCountryPackV3,
  };
}
