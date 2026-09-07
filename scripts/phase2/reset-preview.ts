import { adminClient, requireApply } from "./lib";

const slug = "phase2-seven-day-preview";
const supabase = adminClient();
const { data: journey, error } = await supabase.from("journeys").select("id,status,phase2_enabled,story_time_scale").eq("slug", slug).maybeSingle();
if (error) throw error;
if (!journey) { process.stdout.write(`${JSON.stringify({ removed: false, reason: "not_found" })}\n`); process.exit(0); }
if (journey.status !== "preview" || !journey.phase2_enabled || Number(journey.story_time_scale) < 1) throw new Error("Refusing to remove a journey that is not the guarded Phase 2 preview");

const days = await supabase.from("country_days").select("id").eq("journey_id", journey.id);
if (days.error) throw days.error;
const dayIds = days.data.map((row) => row.id);
const slots = dayIds.length
  ? await supabase.from("sponsor_slots").select("id").in("country_day_id", dayIds)
  : { data: [], error: null };
if (slots.error) throw slots.error;
const slotIds = slots.data.map((row) => row.id);
const sponsorships = slotIds.length
  ? await supabase.from("sponsorships").select("id,private_creative_path,public_creative_path").in("slot_id", slotIds)
  : { data: [], error: null };
if (sponsorships.error) throw sponsorships.error;
const postcards = dayIds.length
  ? await supabase.from("postcards").select("image_path,og_image_path").in("country_day_id", dayIds)
  : { data: [], error: null };
if (postcards.error) throw postcards.error;

const privateCreative = sponsorships.data.flatMap((row) => row.private_creative_path ? [row.private_creative_path] : []);
const publicCreative = sponsorships.data.flatMap((row) => row.public_creative_path ? [row.public_creative_path] : []);
const postcardObjects = postcards.data.flatMap((row) => [row.image_path, row.og_image_path].filter((path): path is string => Boolean(path)));
requireApply({
  removeJourneyId: journey.id,
  slug,
  scopedStorageObjects: {
    sponsorPrivate: privateCreative.length,
    sponsorPublic: publicCreative.length,
    postcards: postcardObjects.length,
    sponsorships: sponsorships.data.length,
  },
});

for (const [bucket, objects] of [
  [process.env.SUPABASE_SPONSOR_PRIVATE_BUCKET ?? "khw-sponsor-private", privateCreative],
  [process.env.SUPABASE_SPONSOR_PUBLIC_BUCKET ?? "khw-sponsor-public", publicCreative],
  [process.env.SUPABASE_POSTCARD_BUCKET ?? "khw-postcards", postcardObjects],
] as const) {
  if (!objects.length) continue;
  const removal = await supabase.storage.from(bucket).remove(objects);
  if (removal.error) throw removal.error;
}
if (slotIds.length) {
  const releaseSlots = await supabase.from("sponsor_slots").update({
    status: "available",
    reserved_by: null,
    reserved_until: null,
    updated_at: new Date().toISOString(),
  }).in("id", slotIds);
  if (releaseSlots.error) throw releaseSlots.error;
  const deleteSponsorships = await supabase.from("sponsorships").delete().in("slot_id", slotIds);
  if (deleteSponsorships.error) throw deleteSponsorships.error;
}
const { error: deleteError } = await supabase.from("journeys").delete().eq("id", journey.id).eq("slug", slug);
if (deleteError) throw deleteError;
process.stdout.write(`${JSON.stringify({
  removed: true,
  journeyId: journey.id,
  storageObjectsRemoved: privateCreative.length + publicCreative.length + postcardObjects.length,
})}\n`);
