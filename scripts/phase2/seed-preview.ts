import { getCountryPack } from "../../src/content/countries/registry";
import { scheduleStoryBeats } from "../../src/lib/story-clock/cadence";
import { buildSevenDaySchedule } from "../../src/lib/story-clock/schedule";
import { adminClient, requireApply } from "./lib";

const slug = "phase2-seven-day-preview";
const rawStart = process.env.PHASE2_PREVIEW_START_AT;
if (!rawStart) throw new Error("PHASE2_PREVIEW_START_AT is required (ISO timestamp with offset)");
const realStart = new Date(rawStart);
if (!Number.isFinite(realStart.getTime())) throw new Error("PHASE2_PREVIEW_START_AT is invalid");
const scale = Number(process.env.PHASE2_REHEARSAL_SCALE ?? "144");
if (scale < 1 || scale > 144) throw new Error("PHASE2_REHEARSAL_SCALE must be between 1 and 144");
const storyStart = new Date(realStart);
const schedule = buildSevenDaySchedule(storyStart);
const scheduledPacks = schedule.map((scheduled) => {
  const pack = getCountryPack(scheduled.scenePackId);
  if (!pack || pack.schemaVersion !== 3) throw new Error(`Missing Phase 2 pack ${scheduled.scenePackId}`);
  return pack;
});
const pendingReviews = scheduledPacks.filter((pack) => !["approved", "provisional_preview"].includes(pack.culturalReview.status)).map((pack) => pack.assetVersion);
requireApply({
  slug,
  realStart: realStart.toISOString(),
  storyStart: storyStart.toISOString(),
  scale,
  days: schedule.map((day) => day.scenePackId),
  culturalReviewGate: pendingReviews.length === 0 ? "passed_for_private_preview" : { blocked: pendingReviews },
});
if (pendingReviews.length > 0) {
  throw new Error(`Cultural review blocks preview scheduling: ${pendingReviews.join(", ")}`);
}

const supabase = adminClient();
const { data: existing, error: existingError } = await supabase.from("journeys").select("id,status,phase2_enabled,real_time_anchor_at,story_time_anchor_at,story_time_scale").eq("slug", slug).maybeSingle();
if (existingError) throw existingError;
if (existing) {
  const sameInstant = (value: string | null, expected: Date) => value !== null
    && new Date(value).getTime() === expected.getTime();
  const exact = existing.status === "preview" && existing.phase2_enabled
    && sameInstant(existing.real_time_anchor_at, realStart)
    && sameInstant(existing.story_time_anchor_at, storyStart)
    && Number(existing.story_time_scale) === scale;
  if (!exact) throw new Error("Preview journey exists with a different guarded clock. Run reset explicitly before replacement.");
  process.stdout.write(`${JSON.stringify({ idempotent: true, journeyId: existing.id })}\n`);
  process.exit(0);
}

const { data: journey, error: journeyError } = await supabase.from("journeys").insert({
  slug, title: "Keep Him Walking — seven-day rehearsal", starts_at: storyStart.toISOString(), total_days: 7,
  status: "preview", real_time_anchor_at: realStart.toISOString(), story_time_anchor_at: storyStart.toISOString(),
  story_time_scale: scale, phase2_enabled: true,
}).select("id").single();
if (journeyError) throw journeyError;

for (const [index, scheduled] of schedule.entries()) {
  const pack = scheduledPacks[index];
  const { data: day, error: dayError } = await supabase.from("country_days").insert({
    journey_id: journey.id, day_number: scheduled.dayNumber, country_code: scheduled.countryCode,
    country_name: scheduled.countryName, city_name: scheduled.cityName, time_zone: scheduled.timeZone,
    starts_at: scheduled.startsAt, ends_at: scheduled.endsAt, scene_pack_id: scheduled.scenePackId,
    status: scheduled.dayNumber === 1 ? "live" : "scheduled",
    story_summary: pack.postcard.safeCopy, postcard_background_url: pack.postcardBackgroundUrl,
  }).select("id").single();
  if (dayError) throw dayError;
  const beats = scheduleStoryBeats(pack, new Date(scheduled.startsAt), new Date(scheduled.endsAt));
  const events = beats.map((beat) => ({
    country_day_id: day.id,
    type: beat.kind === "encounter" ? "encounter" : beat.kind === "arrival" ? "arrival" : beat.kind === "departure" ? "departure" : "action",
    starts_at: beat.startsAt,
    duration_seconds: beat.durationSeconds,
    status: "scheduled",
    payload_json: beat.encounterId
      ? { travelerState: "notice", locationLabel: pack.encounters[0]?.locationLabel, lines: pack.encounters[0]?.lines, storyBeatId: beat.id }
      : { travelerState: beat.kind === "food" ? "drink" : beat.kind === "landmark" ? "photo" : "wave", storyBeatId: beat.id, summary: beat.summary },
  }));
  const { error: eventError } = await supabase.from("story_events").insert(events);
  if (eventError) throw eventError;
  const opensAt = new Date(new Date(scheduled.startsAt).getTime() + 12 * 60 * 60_000);
  const closesAt = new Date(new Date(scheduled.startsAt).getTime() + 20 * 60 * 60_000);
  const { data: vote, error: voteError } = await supabase.from("votes").insert({
    country_day_id: day.id, question: `Which ${pack.cityName} moment should he remember?`,
    opens_at: opensAt.toISOString(), closes_at: closesAt.toISOString(),
    result_publishes_at: new Date(closesAt.getTime() + 60 * 60_000).toISOString(), status: "open",
  }).select("id").single();
  if (voteError) throw voteError;
  const { error: optionsError } = await supabase.from("vote_options").insert([
    { vote_id: vote.id, label: pack.route.zones[2]?.label ?? "Market", display_order: 0 },
    { vote_id: vote.id, label: pack.route.zones[4]?.label ?? "Landmark", display_order: 1 },
  ]);
  if (optionsError) throw optionsError;
  const { error: slotError } = await supabase.from("sponsor_slots").insert({
    country_day_id: day.id, price_cents: process.env.SPONSOR_PAYMENT_PROVIDER === "fixture" ? 100 : process.env.LEMON_SQUEEZY_TEST_MODE === "false" ? 100_000 : 100,
    currency: "USD", status: "available",
  });
  if (slotError) throw slotError;
}
process.stdout.write(`${JSON.stringify({ created: true, journeyId: journey.id, slug, days: 7 })}\n`);
