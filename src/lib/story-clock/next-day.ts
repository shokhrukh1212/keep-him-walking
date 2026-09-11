import "server-only";
import { getCountryPack, registeredCountryPacks } from "@/content/countries/registry";
import { buildDestinationCandidates } from "@/lib/vote/candidates";
import type { CountryPack } from "@/lib/content/schema";

export type VoteWinner = {
  state: string;
  journeyId?: string;
  voteId?: string;
  kind?: string;
  winnerPackId?: string | null;
  winnerLabel?: string | null;
};

export type NextDayPlan = {
  /** True when neighbours ran out and distance chose the ballot instead. */
  usedFallback: boolean;
  day: {
    dayNumber: number;
    countryCode: string;
    countryName: string;
    cityName: string;
    timeZone: string;
    startsAt: string;
    endsAt: string;
    scenePackId: string;
    storySummary: string | null;
  };
  vote: {
    question: string;
    kind: "destination";
    opensAt: string;
    closesAt: string;
    options: Array<{ label: string; packId: string; payload: { countryCode: string } }>;
  } | null;
};

export const SEASON1_DAY2_FALLBACK_PACK_ID = "paris-v1";

/** Day 1 names the traveler rather than choosing a country; its fixed onward
 * leg is the reviewed Paris pack. Every later winner carries its destination pack explicitly. */
export function nextDayPackIdForWinner(winner: VoteWinner): string | null {
  if (winner.state !== "closed") return null;
  if (winner.kind === "name") return SEASON1_DAY2_FALLBACK_PACK_ID;
  return winner.winnerPackId ?? null;
}

/** An approved Ticket replaces the ballot winner for exactly its target day. */
export function nextDayPackId(
  winner: VoteWinner,
  approvedTicketPackId: string | null,
): string | null {
  return approvedTicketPackId ?? nextDayPackIdForWinner(winner);
}

/**
 * Builds tomorrow from the pack the vote chose, plus the ballot that follows it.
 * Candidate content comes from the registry here; every write still happens in
 * `create_next_country_day` under the journey row lock.
 */
export function planNextDay(input: {
  winnerPackId: string;
  dayNumber: number;
  visitedCountryCodes: readonly string[];
  startsAt: Date;
  packs?: readonly CountryPack[];
}): NextDayPlan | null {
  const pack = getCountryPack(input.winnerPackId);
  if (!pack) return null;
  const packs = input.packs ?? registeredCountryPacks();
  const startsAt = input.startsAt;
  const endsAt = new Date(startsAt.getTime() + 86_400_000);

  const { candidates, usedFallback } = buildDestinationCandidates({
    currentPack: pack,
    packs,
    visitedCountryCodes: input.visitedCountryCodes,
  });
  return {
    usedFallback,
    day: {
      dayNumber: input.dayNumber,
      countryCode: pack.countryCode,
      countryName: pack.countryName,
      cityName: pack.cityName,
      timeZone: pack.timeZone,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      scenePackId: pack.assetVersion,
      storySummary: pack.voteBlurb || null,
    },
    vote: candidates.length >= 2
      ? {
        question: "Where should he walk tomorrow?",
        kind: "destination",
        opensAt: startsAt.toISOString(),
        closesAt: endsAt.toISOString(),
        options: candidates.map((candidate) => ({
          label: candidate.countryName,
          packId: candidate.assetVersion,
          payload: { countryCode: candidate.countryCode },
        })),
      }
      : null,
  };
}
