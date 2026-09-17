/**
 * Rewrites Season 1 as "The Anniversary Journey". Nothing is written without --apply.
 *
 *   pnpm season:replan
 *   pnpm production:season:replan --apply
 *
 * It follows the single Season 1 route, one city per Tashkent calendar day, with the name vote until launch and the
 * anniversary-setting poll, all taken from src/lib/season/anniversary.ts. Pending
 * city-art packs use the generic fallback. The database refuses a season that has
 * started, has visitor activity, or has a sponsor payment. Deploy matching code first.
 */
import { access } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getCountryPack } from "../../src/content/countries/registry";
import { SEASON_ONE_FALLBACK_IDS } from "../../src/content/countries/season1-fallback";
import { isVoteReadyPack, type CountryPackV3 } from "../../src/lib/content/schema";
import { ANNIVERSARY_JOURNEY, SEASON_ONE_ROUTE } from "../../src/lib/season/anniversary";
import { SEASON_SCENE_FALLBACK } from "../../src/lib/season/asset-manifest";
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
const itinerary: CountryPackV3[] = SEASON_ONE_ROUTE.map(({ packId: id }) => {
  const pack = getCountryPack(id);
  if (!pack || pack.schemaVersion !== 3 || (!isVoteReadyPack(pack) && !(
    SEASON_ONE_FALLBACK_IDS.has(id)
    && pack.culturalReview.status === "pending"
    && pack.route.zones.length === 1
    && pack.route.zones[0]?.fallbackUrl === SEASON_SCENE_FALLBACK
  ))) throw new Error(`${id} is neither a reviewed pack nor the safe, explicitly pending fallback`);
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
const discardPrelaunchActivity = process.argv.includes("--discard-prelaunch-activity");
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
const { data, error: replanError } = await supabase.rpc(
  discardPrelaunchActivity ? "replan_prelaunch_season" : "replan_season",
  { p_plan: discardPrelaunchActivity ? { ...plan, confirmDiscardPrelaunchActivity: true } : plan, p_now: new Date().toISOString() },
);
if (replanError) throw replanError;
process.stdout.write(`${JSON.stringify(data)}\n`);
