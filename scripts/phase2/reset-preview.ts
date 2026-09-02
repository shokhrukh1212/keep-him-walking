import { adminClient, requireApply } from "./lib";

const slug = "phase2-seven-day-preview";
const supabase = adminClient();
const { data: journey, error } = await supabase.from("journeys").select("id,status,phase2_enabled,story_time_scale").eq("slug", slug).maybeSingle();
if (error) throw error;
if (!journey) { process.stdout.write(`${JSON.stringify({ removed: false, reason: "not_found" })}\n`); process.exit(0); }
if (journey.status !== "preview" || !journey.phase2_enabled || Number(journey.story_time_scale) <= 1) throw new Error("Refusing to remove a journey that is not the accelerated Phase 2 preview");
requireApply({ removeJourneyId: journey.id, slug });
const { error: deleteError } = await supabase.from("journeys").delete().eq("id", journey.id).eq("slug", slug);
if (deleteError) throw deleteError;
process.stdout.write(`${JSON.stringify({ removed: true, journeyId: journey.id })}\n`);
