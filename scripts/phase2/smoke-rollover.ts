import { adminClient, requireApply } from "./lib";

const now = new Date();
requireApply({ at: now.toISOString(), operation: "reconcile Phase 2 schedule" });
const { data, error } = await adminClient().rpc("reconcile_phase2_state", { p_real_now: now.toISOString() });
if (error) throw error;
process.stdout.write(`${JSON.stringify({ ok: true, state: data })}\n`);
