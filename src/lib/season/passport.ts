import "server-only";

import { serverRuntimeConfig } from "@/lib/config/server";
import { findCurrentCountryDay } from "@/lib/bootstrap/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { latestJourney } from "./data";

export type VisitorPrivateState = {
  passport: VisitorPassport;
  postcard: { eligible: boolean; unlockSeconds: number; contributedSeconds: number; url: string | null };
  /** The option this visitor chose on the open ballot, if they have voted. */
  selectedOptionId: string | null;
};

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

/**
 * Everything /api/bootstrap can no longer say, because it is now shared by every
 * visitor and held in a cache. Each field here is about one person.
 */
export async function loadVisitorPrivateState(visitorHash: string, now = new Date()): Promise<VisitorPrivateState> {
  const config = serverRuntimeConfig();
  const passport = await loadVisitorPassport(visitorHash, now);
  const empty: VisitorPrivateState = {
    passport,
    postcard: { eligible: false, unlockSeconds: config.postcardUnlockSeconds, contributedSeconds: 0, url: null },
    selectedOptionId: null,
  };
  const supabase = getServerSupabase();
  if (!supabase) return empty;
  const countryDay = await findCurrentCountryDay(now).catch(() => null);
  if (!countryDay) return empty;

  const [{ data: postcard }, { data: vote }] = await Promise.all([
    supabase.from("postcards").select("public_token").eq("country_day_id", countryDay.id)
      .eq("visitor_hash", visitorHash).eq("status", "ready").gt("expires_at", now.toISOString()).maybeSingle(),
    supabase.from("votes").select("id").eq("country_day_id", countryDay.id)
      .order("opens_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const contributedSeconds = passport.today?.contributedSeconds ?? 0;
  const { data: ballot } = vote
    ? await supabase.from("ballots").select("option_id").eq("vote_id", vote.id).eq("voter_hash", visitorHash).maybeSingle()
    : { data: null };

  return {
    passport,
    postcard: {
      eligible: contributedSeconds >= config.postcardUnlockSeconds,
      unlockSeconds: config.postcardUnlockSeconds,
      contributedSeconds,
      url: postcard?.public_token
        ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/p/${postcard.public_token}`
        : null,
    },
    selectedOptionId: ballot?.option_id ?? null,
  };
}
