import { tashkentCountryPackV4 } from "@/content/countries/tashkent.v4";
import { PHASE1_COUNTRY_DAY_ID } from "@/content/countries/tashkent.v1";
import type { BootstrapSnapshot } from "@/lib/contracts";
import { DEFAULT_PRESENCE_TTL_SECONDS } from "@/lib/presence";
import { DEFAULT_ROLLOVER_UTC_HOUR } from "@/lib/story-clock/rollover-hour";

export function offlineBootstrapSnapshot(now = new Date()): BootstrapSnapshot {
  const startsAt = new Date(now);
  startsAt.setUTCHours(0, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1_000);

  return {
    serverNow: now.toISOString(),
    realServerNow: now.toISOString(),
    storyScale: 1,
    mode: "offline_preview",
    firstVisit: false,
    journeyState: "live",
    refresh: { nextAt: endsAt.toISOString(), afterMs: 5 * 60_000, reason: "country_rollover" },
    journey: { travelerName: null, rolloverUtcHour: DEFAULT_ROLLOVER_UTC_HOUR },
    countryDay: {
      // Schema-v3 packs carry no country-day of their own; the offline preview
      // is not a real day, so it borrows the seeded id and says so in `mode`.
      id: PHASE1_COUNTRY_DAY_ID,
      dayNumber: 1,
      totalDays: 195,
      countryCode: tashkentCountryPackV4.countryCode,
      countryName: tashkentCountryPackV4.countryName,
      cityName: tashkentCountryPackV4.cityName,
      timeZone: tashkentCountryPackV4.timeZone,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      storySummary: "The journey begins in Tashkent.",
      scenePackId: tashkentCountryPackV4.assetVersion,
    },
    activeEvent: null,
    nextEvent: null,
    vote: null,
    presence: {
      activeViewers: null,
      status: "offline",
      ttlSeconds: DEFAULT_PRESENCE_TTL_SECONDS,
      waitingSince: null,
    },
    countries: { live: [], todayTop: [] },
    reactions: { counts: { wave: 0, water: 0, photo: 0 }, scheduled: [], nextScheduledAction: null },
    dayPhotos: [],
    weather: null,
    steps: { global: 0, updatedAt: now.toISOString(), stale: true },
    route: {
      globalActiveSeconds: 0,
      globalDistanceMetres: 0,
      paceRate: 1,
      authoritativeAt: now.toISOString(),
      walking: false,
    },
    sponsor: { status: "unsponsored" },
    postcard: { eligible: false, unlockSeconds: 60, contributedSeconds: 0, url: null },
    passport: { streak: 0, collectedToday: false, collectSeconds: 30 },
    milestones: { hundredWatchersAt: null },
    assets: tashkentCountryPackV4,
  };
}
