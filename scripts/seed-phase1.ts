import { createClient } from "@supabase/supabase-js";
import {
  PHASE1_COUNTRY_DAY_ID,
  PHASE1_ENCOUNTER_ID,
} from "../src/content/countries/tashkent.v1";
// Preview identity follows the launch candidate unless an explicit reviewed
// pack is supplied. Historical UUIDs remain only to preserve existing data.
import { parisCountryPackV1 } from "../src/content/countries/paris.v1";
import { getCountryPack } from "../src/content/countries/registry";

const JOURNEY_ID = "00000000-0000-4000-8000-000000000001";
const VOTE_ID = "30000000-0000-4000-8000-000000000001";
const OPTION_PLOV_ID = "40000000-0000-4000-8000-000000000001";
const OPTION_CHORSU_ID = "40000000-0000-4000-8000-000000000002";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const preview = process.argv.includes("--preview");
const journeySlug = preview ? "keep-him-walking-phase15-preview" : "keep-him-walking";
const requestedPackId = argument("--pack");
if (requestedPackId && !preview) {
  throw new Error("--pack is available only with --preview; use seed:season1 for launch data");
}
const pack = requestedPackId ? getCountryPack(requestedPackId) : parisCountryPackV1;
if (!pack || pack.schemaVersion !== 3) {
  throw new Error(`Preview pack ${requestedPackId ?? parisCountryPackV1.assetVersion} is not a registered v3 pack`);
}
const rawStart = argument("--starts-at") ?? (preview ? process.env.PHASE15_PREVIEW_START_AT : undefined);
if (!rawStart) {
  throw new Error(
    preview
      ? "Provide --starts-at <value> or PHASE15_PREVIEW_START_AT"
      : "Missing required argument: --starts-at <value>",
  );
}
const startsAt = new Date(rawStart);
if (Number.isNaN(startsAt.getTime())) {
  throw new Error("--starts-at must be an ISO-8601 timestamp with an explicit timezone");
}
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
const encounter = pack.encounters[0];
if (!encounter) throw new Error(`${pack.cityName} content pack has no encounter`);

const { data: existingJourney, error: existingJourneyError } = await supabase
  .from("journeys")
  .select("slug")
  .eq("id", JOURNEY_ID)
  .maybeSingle();
if (existingJourneyError) throw existingJourneyError;
if (existingJourney && existingJourney.slug !== journeySlug) {
  throw new Error(
    `Refusing to replace journey ${existingJourney.slug} with ${journeySlug}. Reset the intended environment first.`,
  );
}

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
    slug: journeySlug,
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
    country_code: pack.countryCode,
    country_name: pack.countryName,
    city_name: pack.cityName,
    time_zone: pack.timeZone,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    scene_pack_id: pack.assetVersion,
    status: "live",
    story_summary: pack.postcard.safeCopy,
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
    label: pack.route.zones[2]?.label ?? "Explore the market",
    display_order: 0,
  },
  {
    id: OPTION_CHORSU_ID,
    vote_id: VOTE_ID,
    label: pack.route.zones[4]?.label ?? "Reach the landmark",
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
  `Seeded ${preview ? "reversible preview" : "journey"} for ${pack.cityName} from ${startsAt.toISOString()} to ${endsAt.toISOString()}\n`,
);
