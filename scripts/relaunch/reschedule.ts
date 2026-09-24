/**
 * Moves the scheduled Paris relaunch to a new start, through the same RPC as the owner admin
 * journey control. It refuses unless exactly one journey is scheduled.
 *
 *   node --import tsx --env-file=.env.production.local scripts/relaunch/reschedule.ts 2026-09-24T18:00:00Z
 */
import { createClient } from "@supabase/supabase-js";

const startsAt = process.argv[2];
if (!startsAt || !Number.isFinite(Date.parse(startsAt))) throw new Error("Usage: reschedule.ts <ISO start>");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: rows, error } = await supabase.from("journeys")
  .select("id,lifecycle_state,scheduled_start_at,status")
  .eq("lifecycle_state", "scheduled");
if (error) throw error;
process.stdout.write(`${JSON.stringify({ projectRef: new URL(url).hostname.split(".")[0], scheduled: rows })}\n`);
if (rows?.length !== 1) throw new Error(`Expected exactly one scheduled journey, found ${rows?.length ?? 0}`);
const { data, error: moveError } = await supabase.rpc("set_relaunch_journey_state", {
  p_journey_id: rows[0].id,
  p_action: "schedule",
  p_scheduled_start: new Date(startsAt).toISOString(),
  p_actor: "owner_admin",
  p_now: new Date().toISOString(),
});
if (moveError) throw moveError;
process.stdout.write(`${JSON.stringify(data)}\n`);
