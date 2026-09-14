import { isVoteReadyPack, type CountryPack, type CountryPackV3 } from "@/lib/content/schema";
import { TRAVELER_NAME_OPTIONS } from "@/lib/launch/seed-plan";
import { scheduleStoryBeats } from "@/lib/story-clock/cadence";
import { buildDestinationCandidates } from "@/lib/vote/candidates";
import { SEASON_LENGTH_DAYS } from "./clock";

export const SEASON_ROLLOVER_UTC_HOUR = 16;
export const SEASON_FIRST_PACK_ID = "paris-v3";
const DAY_MS = 86_400_000;

/**
 * The configured start of a season: an explicit instant with a UTC offset, exactly
 * on the 16:00 UTC boundary, and still in the future. Nothing guesses it.
 */
export function parseSeasonStartsAt(raw: string, nowMs: number): Date {
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
    throw new Error("The season start must include Z or an explicit UTC offset");
  }
  const instant = new Date(raw);
  if (!Number.isFinite(instant.getTime())) throw new Error("The season start must be a valid ISO-8601 timestamp");
  if (instant.getUTCHours() !== SEASON_ROLLOVER_UTC_HOUR || instant.getUTCMinutes() !== 0
    || instant.getUTCSeconds() !== 0 || instant.getUTCMilliseconds() !== 0) {
    throw new Error("A season starts exactly at 16:00 UTC");
  }
  if (instant.getTime() <= nowMs) throw new Error("A season must be configured before it starts");
  return instant;
}

function readyPack(pack: CountryPack | undefined, id: string): CountryPackV3 {
  if (!pack) throw new Error(`${id} is not a registered pack`);
  if (pack.schemaVersion !== 3 || !isVoteReadyPack(pack)) {
    throw new Error(`${id} is not an approved, asset-ready v3 pack`);
  }
  return pack;
}

/**
 * Seven cities, one per day. An explicit list is taken as written (distinct cities;
 * countries may repeat). Otherwise the season starts at `firstPackId` and follows
 * the existing route rule one day at a time: a ready neighbour first, then the
 * nearest ready city not yet visited. It never repeats a painting to fill a week.
 */
export function planSeasonItinerary(input: {
  packs: readonly CountryPack[];
  firstPackId?: string;
  explicit?: readonly string[];
}): CountryPackV3[] {
  const byId = new Map(input.packs.map((pack) => [pack.assetVersion, pack]));
  if (input.explicit?.length) {
    if (input.explicit.length !== SEASON_LENGTH_DAYS) {
      throw new Error(`A season itinerary names exactly ${SEASON_LENGTH_DAYS} packs`);
    }
    const itinerary = input.explicit.map((id) => readyPack(byId.get(id), id));
    if (new Set(itinerary.map((pack) => `${pack.countryCode}:${pack.cityName}`)).size !== itinerary.length) {
      throw new Error("A season visits a different city every day");
    }
    return itinerary;
  }
  const firstId = input.firstPackId ?? SEASON_FIRST_PACK_ID;
  const itinerary = [readyPack(byId.get(firstId), firstId)];
  while (itinerary.length < SEASON_LENGTH_DAYS) {
    const current = itinerary.at(-1)!;
    const { candidates } = buildDestinationCandidates({
      currentPack: current,
      packs: input.packs,
      visitedCountryCodes: itinerary.map((pack) => pack.countryCode),
    });
    const next = candidates[0];
    if (!next || next.schemaVersion !== 3) {
      throw new Error(`Only ${itinerary.length} ready cities are reachable from ${firstId}; pass an explicit itinerary`);
    }
    itinerary.push(next);
  }
  return itinerary;
}

export type SeasonPlan = ReturnType<typeof buildSeasonPlan>;

/** The exact plan `configure_season` validates and writes. */
export function buildSeasonPlan(input: {
  startsAt: Date;
  seasonNumber: number;
  itinerary: readonly CountryPackV3[];
  title?: string;
  travelerName?: string | null;
  /** Add the Day-1 name ballot (for a traveler who has no name yet). */
  nameBallot?: boolean;
}) {
  if (!Number.isInteger(input.seasonNumber) || input.seasonNumber < 1) {
    throw new Error("The season number must be a positive whole number");
  }
  if (input.itinerary.length !== SEASON_LENGTH_DAYS) {
    throw new Error(`A season has exactly ${SEASON_LENGTH_DAYS} days`);
  }
  const startMs = input.startsAt.getTime();
  const days = input.itinerary.map((pack, index) => {
    const dayStart = new Date(startMs + index * DAY_MS);
    const dayEnd = new Date(startMs + (index + 1) * DAY_MS);
    const previous = index > 0 ? input.itinerary[index - 1] : null;
    return {
      dayNumber: index + 1,
      countryCode: pack.countryCode,
      countryName: pack.countryName,
      cityName: pack.cityName,
      timeZone: pack.timeZone,
      scenePackId: pack.assetVersion,
      storySummary: pack.postcard.safeCopy,
      postcardBackgroundUrl: pack.postcardBackgroundUrl,
      // A land neighbour is a walk; anything else is announced as a train, never a teleport.
      arrivalMode: !previous || previous.neighbours.includes(pack.assetVersion) ? "walk" as const : "train" as const,
      events: scheduleStoryBeats(pack, dayStart, dayEnd).map((beat) => ({
        type: beat.kind === "departure" ? "departure" : "action",
        startsAt: beat.startsAt,
        durationSeconds: beat.durationSeconds,
        payload: { travelerState: "goodbye", storyBeatId: beat.id, summary: beat.summary },
      })),
    };
  });
  return {
    season: {
      slug: `season-${input.seasonNumber}`,
      title: input.title?.trim() || `Season ${input.seasonNumber}`,
      seasonNumber: input.seasonNumber,
      startsAt: input.startsAt.toISOString(),
      endsAt: new Date(startMs + SEASON_LENGTH_DAYS * DAY_MS).toISOString(),
      travelerName: input.travelerName?.trim() || null,
    },
    days,
    vote: input.nameBallot
      ? {
        kind: "name" as const,
        question: "What should we call him?",
        options: TRAVELER_NAME_OPTIONS.map((label, displayOrder) => ({ label, displayOrder })),
      }
      : null,
  };
}
