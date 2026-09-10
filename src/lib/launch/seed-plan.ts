import type { CountryPackV3 } from "@/lib/content/schema";
import { scheduleStoryBeats } from "@/lib/story-clock/cadence";

export const SEASON1_SLUG = "keep-him-walking-season-1";
export const SEASON1_TOTAL_DAYS = 30;
export const SEASON1_ROLLOVER_UTC_HOUR = 16;
export const TRAVELER_NAME_OPTIONS = ["Milo", "Nur", "Sami", "Bek"] as const;

export function parseSeason1LaunchAt(raw: string): Date {
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
    throw new Error("Launch time must include Z or an explicit UTC offset");
  }
  const instant = new Date(raw);
  if (!Number.isFinite(instant.getTime())) throw new Error("Launch time must be a valid ISO-8601 timestamp");
  if (instant.getUTCMinutes() !== 0 || instant.getUTCSeconds() !== 0
    || instant.getUTCMilliseconds() !== 0 || instant.getUTCHours() !== SEASON1_ROLLOVER_UTC_HOUR) {
    throw new Error("Season 1 must launch at exactly 16:00 UTC");
  }
  return instant;
}

export function buildSeason1LaunchPlan(
  launchAt: Date,
  pack: CountryPackV3,
  foundingPriceCents = 2_900,
) {
  if (!Number.isInteger(foundingPriceCents) || foundingPriceCents <= 0) {
    throw new Error("Founding price must be a positive whole number of cents");
  }
  const startsAt = launchAt.toISOString();
  const endsAt = new Date(launchAt.getTime() + 86_400_000);
  const events = scheduleStoryBeats(pack, launchAt, endsAt).map((beat) => ({
    type: beat.kind === "departure" ? "departure" : "action",
    startsAt: beat.startsAt,
    durationSeconds: beat.durationSeconds,
    payload: { travelerState: "goodbye", storyBeatId: beat.id, summary: beat.summary },
  }));
  return {
    journey: {
      slug: SEASON1_SLUG,
      title: "Keep Him Walking — Season 1",
      launchAt: startsAt,
      totalDays: SEASON1_TOTAL_DAYS,
      seasonNumber: 1,
      rolloverUtcHour: SEASON1_ROLLOVER_UTC_HOUR,
    },
    day: {
      dayNumber: 1,
      countryCode: pack.countryCode,
      countryName: pack.countryName,
      cityName: pack.cityName,
      timeZone: pack.timeZone,
      startsAt,
      endsAt: endsAt.toISOString(),
      scenePackId: pack.assetVersion,
      storySummary: pack.postcard.safeCopy,
      postcardBackgroundUrl: pack.postcardBackgroundUrl,
    },
    events,
    vote: {
      question: "What should we call him?",
      kind: "name" as const,
      opensAt: startsAt,
      closesAt: endsAt.toISOString(),
      options: TRAVELER_NAME_OPTIONS.map((label, displayOrder) => ({ label, displayOrder })),
    },
    founding: { days: 7, priceCents: foundingPriceCents, currency: "USD" },
  };
}
