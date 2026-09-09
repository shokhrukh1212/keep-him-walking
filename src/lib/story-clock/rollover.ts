import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import { planNextDay, type VoteWinner } from "@/lib/story-clock/next-day";
import { writeOperationalLog } from "@/lib/observability/logger";

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
    // Close today's ballot first: tomorrow's country is whatever it chose.
    const { data: winnerRow, error: winnerError } = await supabase.rpc(
      "close_and_pick_vote_winner",
      { p_real_now: now.toISOString() },
    );
    if (winnerError) throw winnerError;
    const winner = (winnerRow ?? { state: "no_closing_vote" }) as VoteWinner;
    const nextDay = winner.state === "closed" && winner.winnerPackId
      ? await createNextDay(supabase, winner, now)
      : null;

    const [{ data: state, error: stateError }, { data: cleanup, error: cleanupError }] = await Promise.all([
      supabase.rpc("reconcile_phase2_state", { p_real_now: now.toISOString() }),
      supabase.rpc("cleanup_phase2_retention", { p_now: now.toISOString() }),
    ]);
    if (stateError || cleanupError) throw stateError ?? cleanupError;
    const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
    const { error: metricsError } = await supabase.rpc("aggregate_sponsor_metrics", { p_metric_date: yesterday, p_now: now.toISOString() });
    if (metricsError) throw metricsError;
    await supabase.from("operation_ledger").update({ status: "completed", completed_at: now.toISOString(), payload_json: { state, cleanup, winner, nextDay } }).eq("operation_key", operationKey);
    return { duplicate: false, operationKey, state, cleanup, winner, nextDay };
  } catch (error) {
    await supabase.from("operation_ledger").update({ status: "failed", completed_at: now.toISOString(), error_code: "RECONCILIATION_FAILED" }).eq("operation_key", operationKey);
    throw error;
  }
}

/**
 * Builds tomorrow from the winning pack and hands it to the RPC that writes it.
 * The registry supplies the content; Postgres still owns the write and the
 * (journey_id, day_number) idempotency.
 */
async function createNextDay(
  supabase: NonNullable<ReturnType<typeof getServerSupabase>>,
  winner: VoteWinner,
  now: Date,
) {
  const { data: days, error } = await supabase
    .from("country_days")
    .select("day_number,country_code")
    .eq("journey_id", winner.journeyId!)
    .order("day_number", { ascending: true });
  if (error) throw error;
  const rows = (days ?? []) as Array<{ day_number: number; country_code: string }>;
  const dayNumber = rows.reduce((highest, row) => Math.max(highest, row.day_number), 0) + 1;

  const plan = planNextDay({
    winnerPackId: winner.winnerPackId!,
    dayNumber,
    visitedCountryCodes: rows.map((row) => row.country_code),
    now,
  });
  if (!plan) return null;
  if (plan.usedFallback) {
    // Neighbours ran out: the ballot is an explicit transfer, not a land border.
    void writeOperationalLog("warning", "vote_candidates_fallback", {
      pack_id: plan.day.scenePackId,
      candidate_count: plan.vote?.options.length ?? 0,
    });
  }

  const { data, error: createError } = await supabase.rpc("create_next_country_day", {
    p_real_now: now.toISOString(),
    p_day: plan.day,
    p_vote: plan.vote,
  });
  if (createError) throw createError;
  return data;
}
