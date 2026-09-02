import { adminClient, requireApply, requireArgument } from "./lib";

const id = requireArgument("id");
const reason = requireArgument("reason");
requireApply({ id, action: "emergency removal", reason });
const supabase = adminClient();
const now = new Date().toISOString();
const { data, error } = await supabase.from("sponsorships").update({ status: "cancelled", removed_at: now, updated_at: now }).eq("id", id).in("status", ["approved", "scheduled", "live"]).select("slot_id").single();
if (error) throw error;
await supabase.from("sponsor_slots").update({ status: "closed", reserved_by: null, reserved_until: null, updated_at: now }).eq("id", data.slot_id);
process.stdout.write(`${JSON.stringify({ removed: true, id, reason })}\n`);
