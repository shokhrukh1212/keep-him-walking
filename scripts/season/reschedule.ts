/**
 * Moves one season that has not started to a new start. Nothing is written without --apply.
 *
 *   pnpm season:reschedule --season 1 --starts-at 2026-09-18T16:00:00Z
 *   pnpm production:season:reschedule --season 1 --starts-at 2026-09-18T16:00:00Z --apply
 *
 * Its cities stay; every day, departure beat and ballot moves by the same amount.
 * The database refuses a season that has started, a sponsor payment in progress or done,
 * and an overlap with another season.
 */
import { createClient } from "@supabase/supabase-js";
import { parseSeasonStartsAt } from "../../src/lib/season/plan";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const rawStartsAt = argument("--starts-at");
if (!rawStartsAt) throw new Error("Missing required argument: --starts-at <ISO timestamp on a whole UTC hour>");
const startsAt = parseSeasonStartsAt(rawStartsAt, Date.now());
const seasonNumber = Number(argument("--season") ?? "1");
if (!Number.isInteger(seasonNumber) || seasonNumber < 1) throw new Error("--season must be a positive whole number");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: season, error } = await supabase.from("journeys")
  .select("id,status,starts_at,ends_at,total_days")
  .eq("season_number", seasonNumber)
  .not("ends_at", "is", null)
  .maybeSingle();
if (error) throw error;
if (!season) throw new Error(`Season ${seasonNumber} is not configured`);
const { data: requests, error: requestError } = await supabase.from("season_sponsorships")
  .select("status")
  .eq("journey_id", season.id);
if (requestError) throw requestError;

const apply = process.argv.includes("--apply");
process.stdout.write(`${JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  projectRef: new URL(url).hostname.split(".")[0],
  season: seasonNumber,
  status: season.status,
  from: { startsAt: season.starts_at, endsAt: season.ends_at },
  to: { startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + Number(season.total_days) * 86_400_000).toISOString() },
  sponsorRequests: (requests ?? []).map((request) => request.status),
}, null, 2)}\n`);

if (!apply) {
  process.stdout.write("Dry run. Re-run with --apply to move this season.\n");
  process.exit(0);
}
const { data, error: moveError } = await supabase.rpc("reschedule_season", {
  p_season_number: seasonNumber,
  p_starts_at: startsAt.toISOString(),
  p_now: new Date().toISOString(),
});
if (moveError) throw moveError;
process.stdout.write(`${JSON.stringify(data)}\n`);
