import { NextRequest, NextResponse } from "next/server";
import { rolloverUtcHour } from "@/lib/config/server";
import { prewarmJourney } from "@/lib/launch/prewarm-service";
import { reconcileSeasonHolds, reconcileSeasonRefunds } from "@/lib/payments/season";
import { reconcilePlacementHolds, reconcilePlacementRefunds } from "@/lib/payments/placements";
import { seasonBoundaryHourAt } from "@/lib/season/clock";
import { loadSeasons, reconcileSeasonsNow } from "@/lib/season/state";
import { minuteReconciliationPlan } from "@/lib/story-clock/boundary";
import { validCronAuthorization } from "@/lib/story-clock/cron-auth";
import { reconcilePhase2 } from "@/lib/story-clock/rollover";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!validCronAuthorization(request.headers.get("authorization"))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Invalid cron authorization." } }, { status: 403 });
  }
  const now = new Date();
  try {
    const supabase = getServerSupabase();
    // A season near its days turns over on its own stored hour (Tashkent midnight for
    // Season 1); otherwise the configured daily hour. Checkout plays no part in this.
    const boundaryHour = (supabase ? seasonBoundaryHourAt(await loadSeasons(supabase), now.getTime()) : null)
      ?? rolloverUtcHour();
    const plan = minuteReconciliationPlan(now, boundaryHour);
    const rollover = await reconcilePhase2(now, plan.boundary);
    // Every minute, not only at the boundary: a season starts and ends on the wall
    // clock, its votes close at their own time, and a lapsed sponsor checkout is released
    // once no payment can arrive. All are idempotent, so repeats change nothing.
    const seasons = supabase ? await reconcileSeasonsNow(supabase, now) : null;
    const holds = supabase ? await reconcileSeasonHolds(supabase, now) : null;
    const refunds = supabase ? await reconcileSeasonRefunds(supabase, now) : null;
    const placementLifecycle = supabase
      ? await supabase.rpc("reconcile_relaunch_journeys", { p_now: now.toISOString() })
      : null;
    const placementHolds = supabase ? await reconcilePlacementHolds(supabase, now) : null;
    const placementRefunds = supabase ? await reconcilePlacementRefunds(supabase, now) : null;
    const prewarm = plan.prewarmDue
      ? await prewarmJourney(process.env.PRODUCTION_APP_URL || request.nextUrl.origin, now)
      : null;
    return NextResponse.json({ ok: prewarm?.ok ?? true, boundary: plan.boundary.toISOString(), boundaryHour,
      rollover, seasons, holds, refunds, placementLifecycle: placementLifecycle?.data ?? null,
      placementHolds, placementRefunds, prewarm }, {
      status: prewarm && !prewarm.ok ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: { code: "UNAVAILABLE", message: "Minute reconciliation failed." } }, { status: 503 });
  }
}
