/** How long the reaction routes reuse a country-day they have just found. */
export const REACTION_DAY_CACHE_MS = 5_000;

type DayBounds = { ends_at: string; story_scale?: number };

export type CachedCountryDay<Day extends DayBounds> = {
  day: Day;
  fetchedAtMs: number;
};

/**
 * A day found a moment ago is still the day, unless it has ended. On a rehearsal
 * story clock the end is in story time, so only the short age limit applies there.
 */
export function cachedCountryDayUsable<Day extends DayBounds>(
  entry: CachedCountryDay<Day> | null,
  nowMs: number,
): entry is CachedCountryDay<Day> {
  if (!entry || !Number.isFinite(nowMs)) return false;
  const ageMs = nowMs - entry.fetchedAtMs;
  if (ageMs < 0 || ageMs >= REACTION_DAY_CACHE_MS) return false;
  if ((entry.day.story_scale ?? 1) !== 1) return true;
  const endsAtMs = Date.parse(entry.day.ends_at);
  return !Number.isFinite(endsAtMs) || nowMs < endsAtMs;
}
