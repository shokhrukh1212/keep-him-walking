/** Upgrade/advance only the existing disposable dev seed. No rows are deleted. */
import { createClient } from "@supabase/supabase-js";
import { getCountryPack, getNextCountryPack, registeredCountryPacks } from "../src/content/countries/registry";
import { buildDestinationCandidates } from "../src/lib/vote/candidates";

const ref = "tkntxptfhmjnqaaveddx";
const journeyId = "00000000-0000-4000-8000-000000000001";
const slug = "keep-him-walking-phase15-preview";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key || new URL(url).hostname !== `${ref}.supabase.co` || process.env.VERCEL_ENV) {
  throw new Error("This command requires the local development project in .env.local.");
}
const apply = process.argv.includes("--apply");
const baseIndex = process.argv.indexOf("--base-url");
const base = baseIndex >= 0 ? new URL(process.argv[baseIndex + 1]) : null;
if (base && (base.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(base.hostname))) {
  throw new Error("--base-url must be a local HTTP server.");
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const now = new Date();
const { data: journeys, error: journeyError } = await db.from("journeys").select("id,slug,status,phase2_enabled");
if (journeyError) throw journeyError;
const journey = journeys?.find((row) => row.id === journeyId && row.slug === slug);
if (!journey || journeys?.some((row) => row.id !== journeyId && ["active", "preview"].includes(row.status))) {
  throw new Error("Expected only the reversible Phase 1.5 dev seed. Refusing to change another journey.");
}
const { data: days, error: daysError } = await db.from("country_days")
  .select("id,day_number,scene_pack_id,starts_at,ends_at,status").eq("journey_id", journeyId).order("day_number");
if (daysError) throw daysError;
if (!days?.length) throw new Error("Seed Day 1 before preparing this review.");
let last = days.at(-1)!;
const ended = days.filter((day) => new Date(day.ends_at) <= now);
console.log(JSON.stringify({ projectRef: ref, journey: slug, apply, endedDays: ended.map((day) => day.day_number),
  currentDay: days.find((day) => new Date(day.starts_at) <= now && new Date(day.ends_at) > now)?.day_number ?? null,
  lastScheduledDay: last.day_number, preservesAllExistingRows: true,
  content: "Private development rehearsal; provisional packs are not approved for public launch." }, null, 2));
if (!apply) {
  console.log("Re-run with --apply to enable Season 1, finalize ended days, and create the current review day.");
  process.exit(0);
}
const { error: updateError } = await db.from("journeys").update({
  phase2_enabled: true, status: "preview", total_days: 30, story_time_scale: 1,
  real_time_anchor_at: null, story_time_anchor_at: null,
}).eq("id", journeyId).eq("slug", slug);
if (updateError) throw updateError;

// Close legacy and later test ballots through the same locked RPC as rollover.
for (let count = 0; count < 30; count++) {
  const { data: winner, error } = await db.rpc("close_and_pick_vote_winner", { p_real_now: now.toISOString() });
  if (error) throw error;
  if (winner?.state !== "closed") break;
}
while (new Date(last.ends_at) <= now) {
  if (last.day_number >= 30) throw new Error("The 30-day review season is finished; create a new explicit rehearsal.");
  const { data: closedVote, error: voteError } = await db.from("votes").select("result_option_id")
    .eq("country_day_id", last.id).eq("status", "closed").order("opens_at", { ascending: false }).limit(1).maybeSingle();
  if (voteError) throw voteError;
  const { data: choice, error: choiceError } = closedVote?.result_option_id
    ? await db.from("vote_options").select("pack_id").eq("id", closedVote.result_option_id).maybeSingle()
    : { data: null, error: null };
  if (choiceError) throw choiceError;
  // Honor a real destination result; legacy/name-only days use the private itinerary.
  // An authored pack outside that old itinerary repeats only in this disposable
  // review journey, so an expired local preview can recover without reseeding.
  const pack = choice?.pack_id
    ? getCountryPack(choice.pack_id)
    : getNextCountryPack(last.scene_pack_id) ?? getCountryPack(last.scene_pack_id);
  if (!pack) throw new Error("The prepared private itinerary has ended; provide the next reviewed pack.");
  const startsAt = new Date(last.ends_at), endsAt = new Date(startsAt.getTime() + 86_400_000);
  const { candidates: options } = buildDestinationCandidates({
    currentPack: pack,
    packs: registeredCountryPacks(),
    visitedCountryCodes: [...days.map((day) => getCountryPack(day.scene_pack_id)?.countryCode ?? ""), pack.countryCode],
  });
  const { data: created, error } = await db.rpc("create_next_country_day", {
    p_real_now: now.toISOString(),
    p_day: { dayNumber: last.day_number + 1, countryCode: pack.countryCode, countryName: pack.countryName,
      cityName: pack.cityName, timeZone: pack.timeZone, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(),
      scenePackId: pack.assetVersion, storySummary: "Private development review day." },
    p_vote: options.length >= 2 ? { question: "Where should he walk tomorrow?", kind: "destination",
      opensAt: startsAt.toISOString(), closesAt: endsAt.toISOString(), options: options.map((candidate) => ({
        label: candidate.countryName, packId: candidate.assetVersion, payload: { countryCode: candidate.countryCode },
      })) } : null,
  });
  if (error) throw error;
  if (!created?.countryDayId) throw new Error("The day creation RPC did not create a day.");
  last = { id: created.countryDayId, day_number: last.day_number + 1, scene_pack_id: pack.assetVersion,
    starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), status: "scheduled" };
  days.push(last);
  console.log(`Prepared Day ${last.day_number}: ${pack.cityName}, ending ${last.ends_at}`);
}
const { data: state, error: stateError } = await db.rpc("reconcile_phase2_state_v2", {
  p_real_now: now.toISOString(), p_ttl_seconds: 50, p_steps_per_second: 1.8, p_pace_cap: 5,
});
if (stateError) throw stateError;
console.log(JSON.stringify({ reconciliation: state }));

// Open the sponsor window the same way rollover does, so /sponsors has real
// inventory to review. Idempotent: an already-open day keeps its opening price.
for (const day of days) {
  const { error } = await db.rpc("bind_sponsor_slot_day", {
    p_country_day_id: day.id, p_real_now: now.toISOString(),
  });
  if (error) throw error;
}
const { data: sponsorWindow, error: windowError } = await db.rpc("open_sponsor_pricing_window", {
  p_journey_id: journeyId,
  p_real_now: now.toISOString(),
  p_floor_cents: Number(process.env.SPONSOR_FLOOR_CENTS ?? 4900),
  p_cents_per_unique: Number(process.env.SPONSOR_CENTS_PER_UNIQUE ?? 1),
  p_founding_cents: Number(process.env.SPONSOR_FOUNDING_CENTS ?? 2900),
  p_cap_cents: Number(process.env.SPONSOR_CAP_CENTS ?? 299900),
  p_window_days: Number(process.env.SPONSOR_WINDOW_DAYS ?? 7),
  p_currency: "USD",
});
if (windowError) throw windowError;
console.log(JSON.stringify({ sponsorWindow }));
if (base) {
  for (const entry of state.recapDays ?? []) {
    const response = await fetch(new URL(`/api/og/recap/${entry.dayNumber}`, base));
    if (!response.ok || !response.headers.get("content-type")?.includes("image/png")) {
      throw new Error(`Recap ${entry.dayNumber} did not render as PNG. Start the local app and retry.`);
    }
    const path = `${journeyId}/day-${entry.dayNumber}.png`;
    const { error: uploadError } = await db.storage.from("khw-recaps").upload(path, new Uint8Array(await response.arrayBuffer()), {
      contentType: "image/png", cacheControl: "31536000", upsert: true,
    });
    if (uploadError) throw uploadError;
    const { error } = await db.from("day_outcomes").update({ recap_image_path: path }).eq("country_day_id", entry.countryDayId).is("recap_image_path", null);
    if (error) throw error;
    console.log(`Stored Day ${entry.dayNumber} recap image.`);
  }
} else if (state.recapDays?.length) {
  console.log("Start the app, then repeat with --apply --base-url http://localhost:3000 to store the rendered recap PNGs.");
}
