import "server-only";

import { countryDisplayName } from "@/lib/countries/flags";
import { loadRecapDay } from "@/lib/recap/data";
import { getServerSupabase } from "@/lib/supabase/server";
import { postKitTemplates } from "./templates";

export type PostKit = ReturnType<typeof postKitTemplates> & { imageUrls: string[] };

export async function loadPostKit(dayNumber: number, origin = ""): Promise<PostKit | null> {
  const recap = await loadRecapDay(dayNumber);
  const supabase = getServerSupabase();
  if (!recap || !supabase) return null;
  const { data: tomorrowDay } = await supabase.from("country_days").select("id").eq("journey_id", recap.journeyId).eq("day_number", dayNumber + 1).maybeSingle();
  const [{ data: nextVote }, { data: nextSlot }, { data: firstDay }] = await Promise.all([
    tomorrowDay
      ? supabase.from("votes").select("id").eq("country_day_id", tomorrowDay.id).eq("status", "open").order("opens_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    tomorrowDay
      ? supabase.from("sponsor_slots").select("price_cents").eq("country_day_id", tomorrowDay.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("country_days").select("id").eq("journey_id", recap.journeyId).eq("day_number", 1).maybeSingle(),
  ]);
  const [{ data: options }, { data: ballots }, { data: firstSlot }] = await Promise.all([
    nextVote
      ? supabase.from("vote_options").select("id,label,country_code,display_order").eq("vote_id", nextVote.id).order("display_order", { ascending: true })
      : Promise.resolve({ data: [] }),
    nextVote
      ? supabase.from("ballots").select("option_id").eq("vote_id", nextVote.id)
      : Promise.resolve({ data: [] }),
    firstDay
      ? supabase.from("sponsor_slots").select("price_cents").eq("country_day_id", firstDay.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const tomorrowVote = (options ?? []).map((option) => ({
    label: option.label,
    code: option.country_code ? option.country_code.trim() : null,
    votes: (ballots ?? []).filter((ballot) => ballot.option_id === option.id).length,
  }));
  const texts = postKitTemplates({
    dayNumber: recap.dayNumber,
    cityName: recap.cityName,
    countryName: recap.countryName,
    countryCode: recap.countryCode,
    distanceMetres: recap.distanceMetres,
    landmarkReached: recap.landmarkReached,
    marathon: recap.marathon,
    uniqueWatchers: recap.uniqueWatchers,
    countriesCount: recap.countriesCount,
    topCountryName: recap.topCountry ? countryDisplayName(recap.topCountry) : null,
    topCountryCode: recap.topCountry,
    sponsorName: recap.sponsor?.name ?? null,
    tomorrowCountryName: recap.tomorrow?.countryName ?? null,
    tomorrowVote,
    sponsorPriceCents: nextSlot ? Number(nextSlot.price_cents) : null,
    foundingPriceCents: firstSlot ? Number(firstSlot.price_cents) : null,
  });
  const dynamicImage = `${origin}/api/og/recap/${recap.dayNumber}`;
  return {
    ...texts,
    imageUrls: [recap.recapImageUrl, dynamicImage, ...recap.photos.map((photo) => photo.url)].filter((url): url is string => Boolean(url)),
  };
}
