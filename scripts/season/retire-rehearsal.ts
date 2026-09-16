/**
 * Marks an ended rehearsal journey completed so no "latest journey" read can pick it
 * instead of the real season. Nothing is written without --apply; no row is deleted.
 *
 *   pnpm production:season:retire-rehearsal --slug phase2-seven-day-preview
 *   pnpm production:season:retire-rehearsal --slug phase2-seven-day-preview --apply
 *
 * It refuses a season, a journey that is not in preview, and one with any day that has
 * not ended. Reverse it by setting the status back to 'preview'.
 */
import { createClient } from "@supabase/supabase-js";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const slug = argument("--slug");
if (!slug) throw new Error("Missing required argument: --slug <rehearsal journey slug>");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: journey, error } = await supabase.from("journeys")
  .select("id,slug,status,ends_at,starts_at").eq("slug", slug).maybeSingle();
if (error) throw error;
if (!journey) throw new Error(`${slug} does not exist`);
if (journey.ends_at) throw new Error(`${slug} is a season, not a rehearsal`);
if (journey.status !== "preview") throw new Error(`${slug} is ${journey.status}, not preview`);
const now = new Date().toISOString();
const { data: days, error: dayError } = await supabase.from("country_days")
  .select("day_number,status,ends_at").eq("journey_id", journey.id).order("day_number");
if (dayError) throw dayError;
const unfinished = (days ?? []).filter((day) => day.status !== "completed" || String(day.ends_at) > now);
const apply = process.argv.includes("--apply");
process.stdout.write(`${JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  projectRef: new URL(url).hostname.split(".")[0],
  journey: { slug: journey.slug, status: journey.status, startsAt: journey.starts_at },
  days: days?.length ?? 0,
  unfinishedDays: unfinished.map((day) => day.day_number),
}, null, 2)}\n`);
if (unfinished.length) throw new Error(`${slug} still has days that have not ended`);
if (!apply) {
  process.stdout.write("Dry run. Re-run with --apply to mark it completed.\n");
  process.exit(0);
}
const { data: updated, error: updateError } = await supabase.from("journeys")
  .update({ status: "completed", updated_at: now })
  .eq("id", journey.id).eq("status", "preview").is("ends_at", null)
  .select("slug,status");
if (updateError) throw updateError;
process.stdout.write(`${JSON.stringify(updated)}\n`);
