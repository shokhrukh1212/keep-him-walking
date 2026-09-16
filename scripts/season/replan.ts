/**
 * Rewrites Season 1 as "The Anniversary Journey". Nothing is written without --apply.
 *
 *   pnpm season:replan
 *   pnpm production:season:replan --apply
 *
 * It keeps the season's configured cities in their stored order and walks each for two
 * days from 17 September 00:00 Asia/Tashkent, with the name vote until launch and the
 * anniversary-setting poll, all taken from src/lib/season/anniversary.ts. The database
 * refuses a season that has started, has any visitor activity, or has a sponsor payment.
 */
import { access } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getCountryPack } from "../../src/content/countries/registry";
import { isVoteReadyPack, type CountryPackV3 } from "../../src/lib/content/schema";
import { ANNIVERSARY_JOURNEY } from "../../src/lib/season/anniversary";
import { buildAnniversaryPlan } from "../../src/lib/season/plan";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: season, error } = await supabase.from("journeys")
  .select("id,slug,status,title,starts_at,ends_at,total_days")
  .eq("season_number", ANNIVERSARY_JOURNEY.seasonNumber)
  .not("ends_at", "is", null)
  .maybeSingle();
if (error) throw error;
if (!season) throw new Error(`Season ${ANNIVERSARY_JOURNEY.seasonNumber} is not configured`);
const { data: days, error: dayError } = await supabase.from("country_days")
  .select("day_number,scene_pack_id")
  .eq("journey_id", season.id)
  .order("day_number", { ascending: true });
if (dayError) throw dayError;

// The configured cities in their stored order, each named once.
const packIds = (days ?? []).map((day) => String(day.scene_pack_id))
  .filter((id, index, all) => index === 0 || all[index - 1] !== id);
const cityCount = ANNIVERSARY_JOURNEY.totalDays / ANNIVERSARY_JOURNEY.daysPerCity;
if (new Set(packIds).size !== cityCount || packIds.length !== cityCount) {
  throw new Error(`Season ${ANNIVERSARY_JOURNEY.seasonNumber} names ${packIds.length} cities (${packIds.join(", ")}); expected ${cityCount} distinct cities`);
}
const itinerary: CountryPackV3[] = packIds.map((id) => {
  const pack = getCountryPack(id);
  if (!pack || pack.schemaVersion !== 3 || !isVoteReadyPack(pack)) throw new Error(`${id} is not an approved, asset-ready v3 pack`);
  return pack;
});
for (const pack of itinerary) {
  for (const zone of pack.route.zones) {
    for (const file of [zone.fallbackUrl, ...(zone.variants?.city.map((variant) => variant.url) ?? [])]) {
      await access(path.join(process.cwd(), "public", file)).catch(() => {
        throw new Error(`${pack.assetVersion} is not asset-ready: ${file} is missing`);
      });
    }
  }
}

const plan = buildAnniversaryPlan(itinerary);
const apply = process.argv.includes("--apply");
process.stdout.write(`${JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  projectRef: new URL(url).hostname.split(".")[0],
  from: { slug: season.slug, status: season.status, title: season.title, startsAt: season.starts_at, endsAt: season.ends_at, totalDays: season.total_days },
  to: plan.season,
  days: plan.days.map((day) => `Day ${day.dayNumber}: ${day.cityName} (${day.scenePackId}, ${day.arrivalMode}, starts ${new Date(Date.parse(plan.season.startsAt) + (day.dayNumber - 1) * 86_400_000).toISOString()}${day.events.length ? ", departure beat" : ""})`),
  votes: plan.votes.map((vote) => `${vote.kind}: ${vote.opensAt} → ${vote.closesAt} (${vote.options.map((option) => option.label).join(" / ")})`),
}, null, 2)}\n`);

if (!apply) {
  process.stdout.write("Dry run. Re-run with --apply to replan this season.\n");
  process.exit(0);
}
const { data, error: replanError } = await supabase.rpc("replan_season", { p_plan: plan, p_now: new Date().toISOString() });
if (replanError) throw replanError;
process.stdout.write(`${JSON.stringify(data)}\n`);
