import { tashkentCountryPack } from "@/content/countries/tashkent.v1";
import type { BootstrapSnapshot } from "@/lib/contracts";
import { DEFAULT_PRESENCE_TTL_SECONDS } from "@/lib/presence";

export function offlineBootstrapSnapshot(now = new Date()): BootstrapSnapshot {
  const startsAt = new Date(now);
  startsAt.setUTCHours(0, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1_000);

  return {
    serverNow: now.toISOString(),
    mode: "offline_preview",
    countryDay: {
      id: tashkentCountryPack.countryDayId,
      dayNumber: 1,
      totalDays: 195,
      countryCode: tashkentCountryPack.countryCode,
      countryName: tashkentCountryPack.countryName,
      cityName: tashkentCountryPack.cityName,
      timeZone: tashkentCountryPack.timeZone,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      storySummary: "The journey begins in Tashkent.",
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
    sponsor: { status: "unsponsored" },
    assets: tashkentCountryPack,
  };
}
