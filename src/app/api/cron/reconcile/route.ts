import { NextRequest, NextResponse } from "next/server";
import { prewarmJourney } from "@/lib/launch/prewarm-service";
import { reconcileSeasonHolds } from "@/lib/payments/season";
import { reconcileSeasonsNow } from "@/lib/season/state";
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
  const plan = minuteReconciliationPlan(now);
  try {
    const rollover = await reconcilePhase2(now, plan.boundary);
    // Every minute, not only at the boundary: a season starts and ends on the wall
    // clock, and a lapsed sponsor checkout is released once no payment can arrive.
    // Both are idempotent, so the boundary run above repeating them changes nothing.
    const supabase = getServerSupabase();
    const seasons = supabase ? await reconcileSeasonsNow(supabase, now) : null;
    const holds = supabase ? await reconcileSeasonHolds(supabase, now) : null;
    const prewarm = plan.prewarmDue
      ? await prewarmJourney(process.env.PRODUCTION_APP_URL || request.nextUrl.origin, now)
      : null;
    return NextResponse.json({ ok: prewarm?.ok ?? true, boundary: plan.boundary.toISOString(), rollover, seasons, holds, prewarm }, {
      status: prewarm && !prewarm.ok ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: { code: "UNAVAILABLE", message: "Minute reconciliation failed." } }, { status: 503 });
  }
}
