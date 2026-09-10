import "server-only";
import { serverRuntimeConfig } from "@/lib/config/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { storePendingRecaps, type PendingRecap } from "@/lib/recap/store";
import { nextDayPackIdForWinner, planNextDay, type VoteWinner } from "@/lib/story-clock/next-day";
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
    const config = serverRuntimeConfig();
    // Close today's ballot first: tomorrow's country is whatever it chose.
    const { data: winnerRow, error: winnerError } = await supabase.rpc(
      "close_and_pick_vote_winner",
      { p_real_now: now.toISOString() },
    );
    if (winnerError) throw winnerError;
    const winner = (winnerRow ?? { state: "no_closing_vote" }) as VoteWinner;
    const nextPackId = nextDayPackIdForWinner(winner);
    const nextDay = nextPackId
      ? await createNextDay(supabase, { ...winner, winnerPackId: nextPackId }, now)
      : null;

    const [{ data: state, error: stateError }, { data: cleanup, error: cleanupError }] = await Promise.all([
      supabase.rpc("reconcile_phase2_state_v2", {
        p_real_now: now.toISOString(),
        p_ttl_seconds: config.presenceTtlSeconds,
        p_steps_per_second: config.stepsPerActiveSecond,
        p_pace_cap: config.paceCap,
      }),
      supabase.rpc("cleanup_phase2_retention", { p_now: now.toISOString() }),
    ]);
    if (stateError || cleanupError) throw stateError ?? cleanupError;
    // Pricing runs after reconciliation, because reconciliation is what finalizes
    // yesterday's unique watchers, and after tomorrow's day exists, so the date it
    // was sold as can finally point at a real country-day.
    const sponsorWindow = await openSponsorWindow(supabase, winner, nextDay, now);
    const recapDays = Array.isArray(state?.recapDays) ? state.recapDays as PendingRecap[] : [];
    const recapImages = await storePendingRecaps(recapDays);
    const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
    const { error: metricsError } = await supabase.rpc("aggregate_sponsor_metrics", { p_metric_date: yesterday, p_now: now.toISOString() });
    if (metricsError) throw metricsError;
    await supabase.from("operation_ledger").update({ status: "completed", completed_at: now.toISOString(), payload_json: { state, cleanup, winner, nextDay, recapImages, sponsorWindow } }).eq("operation_key", operationKey);
    return { duplicate: false, operationKey, state, cleanup, winner, nextDay, recapImages, sponsorWindow };
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
    .select("day_number,country_code,ends_at")
    .eq("journey_id", winner.journeyId!)
    .order("day_number", { ascending: true });
  if (error) throw error;
  const rows = (days ?? []) as Array<{ day_number: number; country_code: string; ends_at: string }>;
  const dayNumber = rows.reduce((highest, row) => Math.max(highest, row.day_number), 0) + 1;
  const previous = rows.at(-1);
  if (!previous) return null;

  const plan = planNextDay({
    winnerPackId: winner.winnerPackId!,
    dayNumber,
    visitedCountryCodes: rows.map((row) => row.country_code),
    startsAt: new Date(previous.ends_at),
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

/**
 * Binds the date that was already on sale to the country-day the vote just chose,
 * then opens whatever the rolling window is still missing. Both RPCs are
 * idempotent, so a replayed rollover changes nothing and an already-open day
 * keeps the price it opened at.
 */
async function openSponsorWindow(
  supabase: NonNullable<ReturnType<typeof getServerSupabase>>,
  winner: VoteWinner,
  nextDay: unknown,
  now: Date,
) {
  // The window opens every rollover, not only on days a ballot closed, so resolve
  // the journey the same way reconciliation does rather than relying on the winner.
  const { data: journeyRow, error: journeyError } = await supabase
    .from("journeys")
    .select("id")
    .eq("phase2_enabled", true)
    .in("status", ["preview", "active"])
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (journeyError) throw journeyError;
  const journeyId = journeyRow?.id ?? winner.journeyId;
  if (!journeyId) return { state: "no_journey" as const };
  const config = serverRuntimeConfig();

  const created = nextDay as { countryDayId?: string } | null;
  if (created?.countryDayId) {
    const { error } = await supabase.rpc("bind_sponsor_slot_day", {
      p_country_day_id: created.countryDayId,
      p_real_now: now.toISOString(),
    });
    if (error) throw error;
  }

  const { data, error } = await supabase.rpc("open_sponsor_pricing_window", {
    p_journey_id: journeyId,
    p_real_now: now.toISOString(),
    p_floor_cents: config.sponsorFloorCents,
    p_cents_per_unique: config.sponsorCentsPerUnique,
    p_founding_cents: config.sponsorFoundingCents,
    p_cap_cents: config.sponsorCapCents,
    p_window_days: config.sponsorWindowDays,
    p_currency: "USD",
  });
  if (error) throw error;
  return data;
}
