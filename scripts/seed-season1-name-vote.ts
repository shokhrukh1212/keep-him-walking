/**
 * Seeds Day 1's name vote: the one ballot whose result is a word, not a place.
 * The four names come from docs/plan/DECISIONS.md (owner answer Q2).
 *
 *   pnpm seed:season1:name-vote            # prints the plan
 *   pnpm seed:season1:name-vote --apply    # writes it
 */
import { createClient } from "@supabase/supabase-js";

export const TRAVELER_NAME_OPTIONS = ["Milo", "Nur", "Sami", "Bek"] as const;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const supabase = createClient(url, key, { auth: { persistSession: false } });
const apply = process.argv.includes("--apply");

const { data: journey, error: journeyError } = await supabase
  .from("journeys")
  .select("id,slug")
  .eq("phase2_enabled", true)
  .in("status", ["preview", "active"])
  .order("starts_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (journeyError) throw journeyError;
if (!journey) throw new Error("No preview or active journey to seed");

const { data: day, error: dayError } = await supabase
  .from("country_days")
  .select("id,day_number,city_name,starts_at,ends_at")
  .eq("journey_id", journey.id)
  .order("day_number", { ascending: true })
  .limit(1)
  .maybeSingle();
if (dayError) throw dayError;
if (!day) throw new Error("No Day 1 to attach the name vote to");

const { data: existing } = await supabase
  .from("votes")
  .select("id,kind")
  .eq("country_day_id", day.id)
  .eq("kind", "name")
  .maybeSingle();

const plan = {
  journey: journey.slug,
  dayNumber: day.day_number,
  city: day.city_name,
  opensAt: day.starts_at,
  closesAt: day.ends_at,
  options: TRAVELER_NAME_OPTIONS,
  alreadySeeded: Boolean(existing),
};
process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);

if (existing) {
  process.stdout.write("Name vote already exists; nothing to do.\n");
  process.exit(0);
}
if (!apply) {
  process.stdout.write("Dry run. Re-run with --apply to write the name vote.\n");
  process.exit(0);
}

const { data: vote, error: voteError } = await supabase
  .from("votes")
  .insert({
    country_day_id: day.id,
    question: "What should we call him?",
    kind: "name",
    opens_at: day.starts_at,
    closes_at: day.ends_at,
    result_publishes_at: day.ends_at,
    status: "open",
  })
  .select("id")
  .single();
if (voteError) throw voteError;

const { error: optionsError } = await supabase.from("vote_options").insert(
  TRAVELER_NAME_OPTIONS.map((label, index) => ({
    vote_id: vote.id,
    label,
    display_order: index,
    pack_id: null,
    payload_json: {},
  })),
);
if (optionsError) throw optionsError;
process.stdout.write(`Seeded name vote ${vote.id} with ${TRAVELER_NAME_OPTIONS.length} options.\n`);
