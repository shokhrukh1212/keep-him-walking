import { adminClient } from "./lib";

const { data, error } = await adminClient().from("journeys").select("id,slug,status,phase2_enabled,real_time_anchor_at,story_time_anchor_at,story_time_scale,country_days(day_number,city_name,scene_pack_id,starts_at,ends_at,status)").eq("slug", "phase2-seven-day-preview").maybeSingle();
if (error) throw error;
process.stdout.write(`${JSON.stringify({ schedule: data, note: "Use seed-preview.ts --apply to create; schedule mutations are intentionally not implicit." }, null, 2)}\n`);
