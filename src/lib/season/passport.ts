import "server-only";

import { serverRuntimeConfig } from "@/lib/config/server";
import { findCurrentCountryDay } from "@/lib/bootstrap/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { latestJourney } from "./data";

export type VisitorPassport = {
  /** Country-day ids the visitor watched for at least the collect threshold. */
  collected: string[];
  /** Consecutive published days ending at the most recent collected one. */
  streak: number;
  collectSeconds: number;
  today: null | { countryDayId: string; contributedSeconds: number; collected: boolean };
};

type PassportRow = {
  days?: Array<{ dayNumber: number; countryDayId: string; collected: boolean }>;
  streak?: number;
};

/**
 * The visitor-private half of the passport. It is a separate read from the
 * public sheet on purpose: the sheet is the same for everyone and can be cached,
 * this cannot be cached at all.
 */
export async function loadVisitorPassport(visitorHash: string, now = new Date()): Promise<VisitorPassport> {
  const config = serverRuntimeConfig();
  const empty: VisitorPassport = { collected: [], streak: 0, collectSeconds: config.passportCollectSeconds, today: null };
  const supabase = getServerSupabase();
  if (!supabase) return empty;
  const journey = await latestJourney();
  if (!journey) return empty;

  const [{ data, error }, countryDay] = await Promise.all([
    supabase.rpc("read_visitor_passport", {
      p_journey_id: journey.id,
      p_visitor_hash: visitorHash,
      p_collect_seconds: config.passportCollectSeconds,
    }),
    findCurrentCountryDay(now).catch(() => null),
  ]);
  if (error || !data) return empty;
  const passport = data as PassportRow;
  const days = passport.days ?? [];

  let today: VisitorPassport["today"] = null;
  if (countryDay) {
    const { data: contribution } = await supabase.from("visitor_day_contributions")
      .select("active_seconds").eq("country_day_id", countryDay.id).eq("visitor_hash", visitorHash).maybeSingle();
    const contributedSeconds = Number(contribution?.active_seconds ?? 0);
    today = {
      countryDayId: countryDay.id,
      contributedSeconds,
      collected: contributedSeconds >= config.passportCollectSeconds,
    };
  }

  return {
    collected: days.filter((day) => day.collected).map((day) => day.countryDayId),
    streak: Number(passport.streak ?? 0),
    collectSeconds: config.passportCollectSeconds,
    today,
  };
}
