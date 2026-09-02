import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";

export async function reconcilePhase2(now = new Date()) {
  const supabase = getServerSupabase();
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const operationKey = `rollover:${now.toISOString().slice(0, 10)}`;
  const { data: claimed, error: claimError } = await supabase.rpc("claim_operation", {
    p_operation_key: operationKey, p_operation_type: "rollover", p_now: now.toISOString(),
  });
  if (claimError) throw claimError;
  if (!claimed) return { duplicate: true, operationKey };
  try {
    const [{ data: state, error: stateError }, { data: cleanup, error: cleanupError }] = await Promise.all([
      supabase.rpc("reconcile_phase2_state", { p_real_now: now.toISOString() }),
      supabase.rpc("cleanup_phase2_retention", { p_now: now.toISOString() }),
    ]);
    if (stateError || cleanupError) throw stateError ?? cleanupError;
    const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
    const { error: metricsError } = await supabase.rpc("aggregate_sponsor_metrics", { p_metric_date: yesterday, p_now: now.toISOString() });
    if (metricsError) throw metricsError;
    await supabase.from("operation_ledger").update({ status: "completed", completed_at: now.toISOString(), payload_json: { state, cleanup } }).eq("operation_key", operationKey);
    return { duplicate: false, operationKey, state, cleanup };
  } catch (error) {
    await supabase.from("operation_ledger").update({ status: "failed", completed_at: now.toISOString(), error_code: "RECONCILIATION_FAILED" }).eq("operation_key", operationKey);
    throw error;
  }
}
