/**
 * Reviews or creates the undated Paris relaunch. Nothing is written without --apply.
 * Existing live/scheduled journeys are archived only with the separate --archive-current flag.
 */
import { createClient } from "@supabase/supabase-js";
import { relaunchPlan } from "../../src/lib/relaunch/config";

const apply = process.argv.includes("--apply");
const archiveCurrent = process.argv.includes("--archive-current");
const plan = relaunchPlan();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
process.stdout.write(`${JSON.stringify({ mode: apply ? "apply" : "dry-run", projectRef: url ? new URL(url).hostname.split(".")[0] : null,
  archiveCurrent, lifecycleState: "waiting", startsAt: null, days: plan.days.map((day) => `Day ${day.dayNumber}: ${day.cityName}, ${day.countryName} (${day.scenePackId})`),
  nameVote: ["Milo", "Nur", "Sami", "Bek"], regularPlacements: 10, featuredPlacements: 1 }, null, 2)}\n`);
if (!apply) {
  process.stdout.write("Dry run. Re-run with --apply to create it. Add --archive-current only after reviewing the journey that will be archived.\n");
  process.exit(0);
}
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await supabase.rpc("prepare_paris_relaunch", { p_plan: plan, p_archive_current: archiveCurrent,
  p_actor: "relaunch_prepare_cli", p_now: new Date().toISOString() });
if (error) throw error;
process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
