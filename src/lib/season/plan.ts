import { isVoteReadyPack, type CountryPack, type CountryPackV3 } from "@/lib/content/schema";
import { TRAVELER_NAME_OPTIONS } from "@/lib/launch/seed-plan";
import { scheduleStoryBeats } from "@/lib/story-clock/cadence";
import { buildDestinationCandidates } from "@/lib/vote/candidates";
import { ANNIVERSARY_JOURNEY, SEASON_ONE_ROUTE } from "./anniversary";
import { SEASON_LENGTH_DAYS } from "./clock";

export const SEASON_FIRST_PACK_ID = "paris-v3";
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * The configured start of a season: an explicit instant with a UTC offset, on a whole
 * UTC hour (Season 1 turns over at 15:00 Tashkent, 10:00 UTC), and still in the
 * future. Nothing guesses it.
 */
export function parseSeasonStartsAt(raw: string, nowMs: number): Date {
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
    throw new Error("The season start must include Z or an explicit UTC offset");
  }
  const instant = new Date(raw);
  if (!Number.isFinite(instant.getTime())) throw new Error("The season start must be a valid ISO-8601 timestamp");
  if (instant.getUTCMinutes() !== 0 || instant.getUTCSeconds() !== 0 || instant.getUTCMilliseconds() !== 0) {
    throw new Error("A season starts on a whole UTC hour");
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
 * The season's distinct cities in order (seven by default). An explicit list is taken as
 * written (distinct cities; countries may repeat). Otherwise the season starts at
 * `firstPackId` and follows the existing route rule one city at a time: a ready neighbour
 * first, then the nearest ready city not yet visited. It never repeats a painting to fill
 * a season; `buildSeasonPlan` decides how many days each city is walked.
 */
export function planSeasonItinerary(input: {
  packs: readonly CountryPack[];
  firstPackId?: string;
  explicit?: readonly string[];
  cityCount?: number;
}): CountryPackV3[] {
  const cityCount = input.cityCount ?? SEASON_LENGTH_DAYS;
  const byId = new Map(input.packs.map((pack) => [pack.assetVersion, pack]));
  if (input.explicit?.length) {
    if (input.explicit.length !== cityCount) {
      throw new Error(`A season itinerary names exactly ${cityCount} packs`);
    }
    const itinerary = input.explicit.map((id) => readyPack(byId.get(id), id));
    if (new Set(itinerary.map((pack) => `${pack.countryCode}:${pack.cityName}`)).size !== itinerary.length) {
      throw new Error("A season visits a different city each time");
    }
    return itinerary;
  }
  const firstId = input.firstPackId ?? SEASON_FIRST_PACK_ID;
  const itinerary = [readyPack(byId.get(firstId), firstId)];
  while (itinerary.length < cityCount) {
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

export type SeasonVotePlan = {
  kind: "name" | "anniversary";
  question: string;
  opensAt: string;
  closesAt: string;
  options: Array<{ label: string; displayOrder: number }>;
};

/** A vote's window, as the database stores it. */
export type VoteWindow = { opensAt: Date; closesAt: Date };

/**
 * The exact plan `configure_season_v2` and `replan_season` validate and write: each city
 * in `itinerary` walked for `daysPerCity` consecutive 24-hour days. Staying in a city is a
 * walk; a new city is a walk from a land neighbour and a train otherwise. His departure
 * beat plays only on the evening he actually leaves a city, and on the last day.
 */
export function buildSeasonPlan(input: {
  startsAt: Date;
  seasonNumber: number;
  itinerary: readonly CountryPackV3[];
  daysPerCity?: number;
  cityCount?: number;
  title?: string;
  travelerName?: string | null;
  /** The name ballot: `true` for the historical Day-1 window, or an explicit one. */
  nameBallot?: boolean | VoteWindow;
  poll?: VoteWindow & { question: string; options: readonly string[] };
}) {
  const daysPerCity = input.daysPerCity ?? 1;
  const cityCount = input.cityCount ?? SEASON_LENGTH_DAYS;
  if (!Number.isInteger(input.seasonNumber) || input.seasonNumber < 1) {
    throw new Error("The season number must be a positive whole number");
  }
  if (!Number.isInteger(daysPerCity) || daysPerCity < 1) throw new Error("Days per city must be a positive whole number");
  if (input.itinerary.length !== cityCount) {
    throw new Error(`A season has exactly ${cityCount} cities`);
  }
  const startMs = input.startsAt.getTime();
  const packs = input.itinerary.flatMap((pack) => Array.from({ length: daysPerCity }, () => pack));
  const totalDays = packs.length;
  const endMs = startMs + totalDays * DAY_MS;
  const days = packs.map((pack, index) => {
    const dayStart = new Date(startMs + index * DAY_MS);
    const dayEnd = new Date(startMs + (index + 1) * DAY_MS);
    const previous = index > 0 ? packs[index - 1]! : null;
    const next = packs[index + 1] ?? null;
    const leaves = !next || next.assetVersion !== pack.assetVersion;
    return {
      dayNumber: index + 1,
      countryCode: pack.countryCode,
      countryName: pack.countryName,
      cityName: pack.cityName,
      timeZone: pack.timeZone,
      scenePackId: pack.assetVersion,
      storySummary: pack.postcard.safeCopy,
      postcardBackgroundUrl: pack.postcardBackgroundUrl,
      // Another day in the same city, or a land neighbour, is a walk; anything else is
      // announced as a train, never a teleport.
      arrivalMode: !previous || previous.assetVersion === pack.assetVersion || previous.neighbours.includes(pack.assetVersion)
        ? "walk" as const
        : "train" as const,
      events: leaves
        ? scheduleStoryBeats(pack, dayStart, dayEnd).map((beat) => ({
          type: beat.kind === "departure" ? "departure" : "action",
          startsAt: beat.startsAt,
          durationSeconds: beat.durationSeconds,
          payload: { travelerState: "goodbye", storyBeatId: beat.id, summary: beat.summary },
        }))
        : [],
    };
  });
  const votes: SeasonVotePlan[] = [];
  if (input.nameBallot) {
    const window = input.nameBallot === true
      ? { opensAt: input.startsAt, closesAt: new Date(startMs + DAY_MS) }
      : input.nameBallot;
    votes.push({
      kind: "name",
      question: "What should we call him?",
      opensAt: window.opensAt.toISOString(),
      closesAt: window.closesAt.toISOString(),
      options: TRAVELER_NAME_OPTIONS.map((label, displayOrder) => ({ label, displayOrder })),
    });
  }
  if (input.poll) {
    votes.push({
      kind: "anniversary",
      question: input.poll.question,
      opensAt: input.poll.opensAt.toISOString(),
      closesAt: input.poll.closesAt.toISOString(),
      options: input.poll.options.map((label, displayOrder) => ({ label, displayOrder })),
    });
  }
  for (const vote of votes) {
    const opens = Date.parse(vote.opensAt);
    const closes = Date.parse(vote.closesAt);
    if (!(opens < closes) || closes > endMs || (vote.kind === "anniversary" && opens < startMs)) {
      throw new Error(`The ${vote.kind} vote must close after it opens and within the season`);
    }
  }
  return {
    season: {
      slug: `season-${input.seasonNumber}`,
      title: input.title?.trim() || `Season ${input.seasonNumber}`,
      seasonNumber: input.seasonNumber,
      startsAt: input.startsAt.toISOString(),
      endsAt: new Date(endMs).toISOString(),
      totalDays,
      travelerName: input.travelerName?.trim() || null,
    },
    days,
    votes,
  };
}

/**
 * Season 1, "The Anniversary Journey", built entirely from `anniversary.ts`: its fourteen
 * cities one day each from 21:00 Tashkent on 17 September, the name vote from the
 * preview day until launch, and the anniversary-setting poll.
 */
export function buildAnniversaryPlan(itinerary: readonly CountryPackV3[]) {
  const schedule = ANNIVERSARY_JOURNEY;
  for (const [index, stop] of SEASON_ONE_ROUTE.entries()) {
    const pack = itinerary[index];
    if (!pack || pack.assetVersion !== stop.packId || pack.countryCode !== stop.code || pack.cityName !== stop.city || pack.countryName !== stop.country) {
      throw new Error(`Day ${index + 1} must be ${stop.city}, ${stop.country} (${stop.packId})`);
    }
  }
  const plan = buildSeasonPlan({
    startsAt: new Date(schedule.travelStartsAt),
    seasonNumber: schedule.seasonNumber,
    itinerary,
    daysPerCity: schedule.daysPerCity,
    cityCount: schedule.totalDays / schedule.daysPerCity,
    title: schedule.title,
    nameBallot: { opensAt: new Date(schedule.previewStartsAt), closesAt: new Date(schedule.travelStartsAt) },
    poll: {
      question: schedule.poll.question,
      opensAt: new Date(schedule.poll.opensAt),
      closesAt: new Date(schedule.poll.closesAt),
      options: schedule.poll.options,
    },
  });
  return {
    ...plan,
    days: plan.days.map((day, index) => ({
      ...day,
      arrivalMode: "transferFromPrevious" in SEASON_ONE_ROUTE[index]!
        ? SEASON_ONE_ROUTE[index]!.transferFromPrevious
        : day.arrivalMode,
    })),
  };
}
