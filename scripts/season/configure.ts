/**
 * Plans one seven-day season. Nothing is written without --apply.
 *
 *   pnpm season:configure --starts-at 2026-09-23T16:00:00Z
 *   pnpm season:configure --starts-at 2026-09-23T16:00:00Z --season 1 --apply
 *   pnpm season:configure --starts-at 2026-09-30T16:00:00Z --season 2 \
 *     --itinerary paris-v3,prague-v1,vienna-v1,bratislava-v1,ljubljana-v1,zagreb-v1,belgrade-v1
 *
 * The start is always an explicit future 16:00 UTC boundary. Season 1 carries the
 * approved Day-1 name ballot unless --no-name-ballot or --traveler-name is given.
 */
import { access } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { registeredCountryPacks } from "../../src/content/countries/registry";
import { buildSeasonPlan, parseSeasonStartsAt, planSeasonItinerary } from "../../src/lib/season/plan";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const rawStartsAt = argument("--starts-at");
if (!rawStartsAt) throw new Error("Missing required argument: --starts-at <ISO timestamp at 16:00 UTC>");
const startsAt = parseSeasonStartsAt(rawStartsAt, Date.now());
const seasonNumber = Number(argument("--season") ?? "1");
const explicit = argument("--itinerary")?.split(",").map((id) => id.trim()).filter(Boolean);
const itinerary = planSeasonItinerary({
  packs: registeredCountryPacks(),
  firstPackId: argument("--first"),
  explicit,
});

// Asset-ready means every painting each place names is in the runtime tree that is
// mirrored to the asset CDN. A missing file stops the plan rather than a live day.
for (const pack of itinerary) {
  for (const zone of pack.route.zones) {
    for (const url of [zone.fallbackUrl, ...(zone.variants?.city.map((variant) => variant.url) ?? [])]) {
      await access(path.join(process.cwd(), "public", url)).catch(() => {
        throw new Error(`${pack.assetVersion} is not asset-ready: ${url} is missing`);
      });
    }
  }
}

const travelerName = argument("--traveler-name") ?? null;
const plan = buildSeasonPlan({
  startsAt,
  seasonNumber,
  itinerary,
  title: argument("--title"),
  travelerName,
  nameBallot: seasonNumber === 1 && !travelerName && !process.argv.includes("--no-name-ballot"),
});
const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
process.stdout.write(`${JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  projectRef: url ? new URL(url).hostname.split(".")[0] : null,
  season: plan.season,
  days: plan.days.map((day) => `Day ${day.dayNumber}: ${day.cityName}, ${day.countryName} (${day.scenePackId}, ${day.arrivalMode}, ${pack(day.scenePackId)} places)`),
  countries: new Set(plan.days.map((day) => day.countryCode)).size,
  nameBallot: Boolean(plan.vote),
}, null, 2)}\n`);

function pack(id: string) {
  return itinerary.find((entry) => entry.assetVersion === id)?.route.zones.length ?? 0;
}

if (!apply) {
  process.stdout.write("Dry run. Re-run with --apply to configure this season.\n");
  process.exit(0);
}
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await supabase.rpc("configure_season", { p_plan: plan, p_now: new Date().toISOString() });
if (error) throw error;
process.stdout.write(`${JSON.stringify(data)}\n`);
