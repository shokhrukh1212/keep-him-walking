/** Guarded pack rollback; dry-run unless --apply is explicit. */
import { createClient } from "@supabase/supabase-js";
import { getCountryPack } from "../src/content/countries/registry";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const dayId = argument("--day-id");
const from = argument("--from");
const to = argument("--to");
if (!dayId || !from || !to) throw new Error("Provide --day-id, --from and --to");
const currentPack = getCountryPack(from);
const replacementPack = getCountryPack(to);
if (!currentPack || !replacementPack) throw new Error("Both pack versions must be registered");
if (currentPack.countryCode !== replacementPack.countryCode) {
  throw new Error("A rollback pack must represent the same country");
}
const apply = process.argv.includes("--apply");
process.stdout.write(`${JSON.stringify({ mode: apply ? "apply" : "dry-run", dayId, from, to, countryCode: currentPack.countryCode })}\n`);
if (!apply) process.exit(0);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await supabase.rpc("switch_country_day_pack", {
  p_country_day_id: dayId,
  p_expected_current: from,
  p_replacement: to,
  p_now: new Date().toISOString(),
});
if (error) throw error;
process.stdout.write(`${JSON.stringify({ changed: data === true })}\n`);
