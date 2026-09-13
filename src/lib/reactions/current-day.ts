import "server-only";

import { findCurrentCountryDay } from "@/lib/bootstrap/server";
import { cachedCountryDayUsable, type CachedCountryDay } from "./day-cache";

type CountryDay = NonNullable<Awaited<ReturnType<typeof findCurrentCountryDay>>>;

let cached: CachedCountryDay<CountryDay> | null = null;
let pending: Promise<CountryDay | null> | null = null;

/**
 * The live country-day for the reaction routes. Finding it costs two database reads,
 * so a burst of reactions on one server instance shares one lookup and reuses it for
 * a few seconds. A missing day is never reused.
 */
export async function currentCountryDayForReactions(now: Date): Promise<CountryDay | null> {
  const entry = cached;
  if (cachedCountryDayUsable(entry, now.getTime())) return entry.day;
  pending ??= findCurrentCountryDay(now)
    .then((day) => {
      cached = day ? { day, fetchedAtMs: Date.now() } : null;
      return day;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
