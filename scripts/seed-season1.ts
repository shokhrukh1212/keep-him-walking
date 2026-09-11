/**
 * Plans Season 1 without writing by default.
 *
 *   pnpm seed:season1 --launch-at 2034-09-20T16:00:00Z
 *   pnpm seed:season1 --launch-at 2034-09-20T16:00:00Z --apply
 */
import { createClient } from "@supabase/supabase-js";
import { getCountryPack } from "../src/content/countries/registry";
import { buildSeason1LaunchPlan, parseSeason1LaunchAt } from "../src/lib/launch/seed-plan";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const rawLaunchAt = argument("--launch-at");
if (!rawLaunchAt) throw new Error("Missing required argument: --launch-at <ISO timestamp>");
const launchAt = parseSeason1LaunchAt(rawLaunchAt);
const packId = argument("--pack") ?? "london-v1";
const pack = getCountryPack(packId);
if (!pack || pack.schemaVersion !== 3) {
  throw new Error(`Launch pack ${packId} is not a registered, reviewed v3 pack`);
}
const foundingPriceCents = Number(process.env.SPONSOR_FOUNDING_CENTS ?? "2900");
const plan = buildSeason1LaunchPlan(launchAt, pack, foundingPriceCents);
const apply = process.argv.includes("--apply");

process.stdout.write(`${JSON.stringify({ mode: apply ? "apply" : "dry-run", plan }, null, 2)}\n`);
if (!apply) {
  process.stdout.write("Dry run. Re-run with --apply only after the launch checklist passes.\n");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await supabase.rpc("seed_season1_launch", {
  p_plan: plan,
  p_now: new Date().toISOString(),
});
if (error) throw error;
process.stdout.write(`${JSON.stringify(data)}\n`);
