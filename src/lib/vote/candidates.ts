import type { CountryPack } from "@/lib/content/schema";
import { isVoteReadyPack } from "@/lib/content/schema";

/**
 * Season-1 pair policy (DECISIONS Q16). These unordered pairs never appear on the
 * same ballot, and every pair involving a blocked country is excluded outright.
 * This is a Season-1 ballot rule, not a content ban.
 */
export const BLOCKED_BALLOT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["AM", "AZ"],
  ["AM", "TR"],
  ["RS", "XK"],
  ["GR", "TR"],
];

export const BLOCKED_BALLOT_COUNTRIES: readonly string[] = ["IL", "RU"];

export const MAX_VOTE_CANDIDATES = 3;
export const MIN_VOTE_CANDIDATES = 2;

const EARTH_RADIUS_KM = 6_371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance, used only for the fallback ordering. */
export function haversineKm(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): number {
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLon = toRadians(to.lon - from.lon);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function pairIsBlocked(left: string, right: string): boolean {
  if (BLOCKED_BALLOT_COUNTRIES.includes(left) || BLOCKED_BALLOT_COUNTRIES.includes(right)) {
    return true;
  }
  return BLOCKED_BALLOT_PAIRS.some(
    ([a, b]) => (a === left && b === right) || (a === right && b === left),
  );
}

/**
 * Applies the pair policy across the whole ballot: a pack is kept only if it can
 * coexist with every pack already kept. Order in decides which of a blocked pair
 * survives, so callers pass their preferred order first.
 */
export function applyBallotPairPolicy(packs: readonly CountryPack[]): CountryPack[] {
  const kept: CountryPack[] = [];
  for (const pack of packs) {
    if (BLOCKED_BALLOT_COUNTRIES.includes(pack.countryCode)) continue;
    if (kept.some((other) => pairIsBlocked(other.countryCode, pack.countryCode))) continue;
    kept.push(pack);
  }
  return kept;
}

export type CandidateInput = {
  currentPack: CountryPack;
  packs: readonly CountryPack[];
  /** Country codes already visited this season, including today's. */
  visitedCountryCodes: readonly string[];
};

export type CandidateResult = {
  candidates: CountryPack[];
  /** True when neighbours could not supply two candidates and distance was used. */
  usedFallback: boolean;
};

/**
 * Tomorrow's ballot: neighbouring countries with a ready pack that the journey
 * has not visited yet, at most three. If fewer than two survive, the nearest
 * unvisited ready packs fill the ballot — an explicit transfer, never a pretend
 * land border. The caller logs a warning when that happens.
 */
export function buildDestinationCandidates(input: CandidateInput): CandidateResult {
  const visited = new Set(
    input.visitedCountryCodes.map((code) => code.toUpperCase()),
  );
  visited.add(input.currentPack.countryCode.toUpperCase());

  const eligible = input.packs.filter(
    (pack) => isVoteReadyPack(pack) && !visited.has(pack.countryCode.toUpperCase()),
  );
  // One pack per country: a second pack for a country already on the ballot
  // would offer the same flag twice.
  const byCountry = new Map<string, CountryPack>();
  for (const pack of [...eligible].sort((a, b) => a.assetVersion.localeCompare(b.assetVersion))) {
    if (!byCountry.has(pack.countryCode)) byCountry.set(pack.countryCode, pack);
  }
  const unique = [...byCountry.values()];

  const neighbourIds = new Set(input.currentPack.neighbours);
  const neighbours = unique
    .filter((pack) => neighbourIds.has(pack.assetVersion))
    .sort((a, b) => a.assetVersion.localeCompare(b.assetVersion));

  const fromNeighbours = applyBallotPairPolicy(neighbours).slice(0, MAX_VOTE_CANDIDATES);
  if (fromNeighbours.length >= MIN_VOTE_CANDIDATES) {
    return { candidates: fromNeighbours, usedFallback: false };
  }

  const origin = { lat: input.currentPack.lat, lon: input.currentPack.lon };
  const byDistance = unique
    .filter((pack) => !fromNeighbours.includes(pack))
    .sort((a, b) => haversineKm(origin, a) - haversineKm(origin, b)
      || a.assetVersion.localeCompare(b.assetVersion));

  const candidates = applyBallotPairPolicy([...fromNeighbours, ...byDistance])
    .slice(0, MAX_VOTE_CANDIDATES);
  return { candidates, usedFallback: candidates.length > fromNeighbours.length };
}
