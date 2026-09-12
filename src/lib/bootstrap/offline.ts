import { parisCountryPackV1 } from "@/content/countries/paris.v1";
import type { BootstrapSnapshot } from "@/lib/contracts";
import { DEFAULT_PRESENCE_TTL_SECONDS } from "@/lib/presence";
import { DEFAULT_ROLLOVER_UTC_HOUR } from "@/lib/story-clock/rollover-hour";

export function offlineBootstrapSnapshot(now = new Date()): BootstrapSnapshot {
  const startsAt = new Date(now);
  startsAt.setUTCHours(DEFAULT_ROLLOVER_UTC_HOUR, 0, 0, 0);
  if (startsAt.getTime() > now.getTime()) startsAt.setUTCDate(startsAt.getUTCDate() - 1);
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
      // This is presentation-only identity until the live bootstrap arrives.
      id: "00000000-0000-4000-8000-000000000001",
      dayNumber: 1,
      totalDays: 195,
      countryCode: parisCountryPackV1.countryCode,
      countryName: parisCountryPackV1.countryName,
      cityName: parisCountryPackV1.cityName,
      timeZone: parisCountryPackV1.timeZone,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      storySummary: "The journey begins in Paris.",
      scenePackId: parisCountryPackV1.assetVersion,
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
    assets: parisCountryPackV1,
  };
}
