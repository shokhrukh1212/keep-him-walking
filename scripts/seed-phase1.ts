import { createClient } from "@supabase/supabase-js";
import {
  PHASE1_COUNTRY_DAY_ID,
  PHASE1_ENCOUNTER_ID,
  tashkentCountryPack,
} from "../src/content/countries/tashkent.v1";

const JOURNEY_ID = "00000000-0000-4000-8000-000000000001";
const VOTE_ID = "30000000-0000-4000-8000-000000000001";
const OPTION_PLOV_ID = "40000000-0000-4000-8000-000000000001";
const OPTION_CHORSU_ID = "40000000-0000-4000-8000-000000000002";

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing required argument: ${name} <value>`);
  return value;
}

const startsAt = new Date(requiredArgument("--starts-at"));
if (Number.isNaN(startsAt.getTime())) {
  throw new Error("--starts-at must be an ISO-8601 timestamp with an explicit timezone");
}
const rawStart = requiredArgument("--starts-at");
if (!/(Z|[+-]\d{2}:\d{2})$/i.test(rawStart)) {
  throw new Error("--starts-at must include Z or an explicit UTC offset");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1_000);
const encounterStartsAt = new Date(startsAt.getTime() + 15 * 60 * 1_000);
const encounter = tashkentCountryPack.encounters[0];
if (!encounter) throw new Error("Tashkent content pack has no encounter");

const { data: existing, error: existingError } = await supabase
  .from("country_days")
  .select("starts_at")
  .eq("id", PHASE1_COUNTRY_DAY_ID)
  .maybeSingle();
if (existingError) throw existingError;
if (existing && new Date(existing.starts_at).getTime() !== startsAt.getTime()) {
  throw new Error(
    "Phase 1 was already seeded with a different start. Reset the local database or reuse that timestamp.",
  );
}

const writes = [
  supabase.from("journeys").upsert({
    id: JOURNEY_ID,
    slug: "keep-him-walking",
    title: "Keep Him Walking",
    starts_at: startsAt.toISOString(),
    total_days: 195,
    status: "active",
    updated_at: new Date().toISOString(),
  }),
  supabase.from("country_days").upsert({
    id: PHASE1_COUNTRY_DAY_ID,
    journey_id: JOURNEY_ID,
    day_number: 1,
    country_code: "UZ",
    country_name: "Uzbekistan",
    city_name: "Tashkent",
    time_zone: "Asia/Tashkent",
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    scene_pack_id: tashkentCountryPack.assetVersion,
    status: "live",
    story_summary: "A first morning in Tashkent—and a serious invitation to try plov.",
    updated_at: new Date().toISOString(),
  }),
];

for (const write of writes) {
  const { error } = await write;
  if (error) throw error;
}

const { error: eventError } = await supabase.from("story_events").upsert({
  id: PHASE1_ENCOUNTER_ID,
  country_day_id: PHASE1_COUNTRY_DAY_ID,
  type: "encounter",
  starts_at: encounterStartsAt.toISOString(),
  duration_seconds: 50,
  payload_json: {
    travelerState: "talk",
    locationLabel: encounter.locationLabel,
    lines: encounter.lines,
  },
  status: "scheduled",
  updated_at: new Date().toISOString(),
});
if (eventError) throw eventError;

const { error: voteError } = await supabase.from("votes").upsert({
  id: VOTE_ID,
  country_day_id: PHASE1_COUNTRY_DAY_ID,
  question: "Where should he pause next?",
  opens_at: startsAt.toISOString(),
  closes_at: endsAt.toISOString(),
  result_publishes_at: endsAt.toISOString(),
  status: "open",
  updated_at: new Date().toISOString(),
});
if (voteError) throw voteError;

const { error: optionsError } = await supabase.from("vote_options").upsert([
  {
    id: OPTION_PLOV_ID,
    vote_id: VOTE_ID,
    label: "Find the best plov",
    display_order: 0,
  },
  {
    id: OPTION_CHORSU_ID,
    vote_id: VOTE_ID,
    label: "Explore Chorsu Bazaar",
    display_order: 1,
  },
]);
if (optionsError) throw optionsError;

const { error: runtimeError } = await supabase.from("journey_runtime").upsert(
  {
    country_day_id: PHASE1_COUNTRY_DAY_ID,
    last_accounted_at: startsAt.toISOString(),
    active_viewers: 0,
    global_active_seconds: 0,
    global_steps: 0,
  },
  { onConflict: "country_day_id", ignoreDuplicates: true },
);
if (runtimeError) throw runtimeError;

process.stdout.write(
  `Seeded Tashkent from ${startsAt.toISOString()} to ${endsAt.toISOString()}\n`,
);
