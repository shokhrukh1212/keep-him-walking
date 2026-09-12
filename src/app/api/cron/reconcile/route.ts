import { NextRequest, NextResponse } from "next/server";
import { prewarmJourney } from "@/lib/launch/prewarm-service";
import { minuteReconciliationPlan } from "@/lib/story-clock/boundary";
import { validCronAuthorization } from "@/lib/story-clock/cron-auth";
import { reconcilePhase2 } from "@/lib/story-clock/rollover";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!validCronAuthorization(request.headers.get("authorization"))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Invalid cron authorization." } }, { status: 403 });
  }
  const now = new Date();
  const plan = minuteReconciliationPlan(now);
  try {
    const rollover = await reconcilePhase2(now, plan.boundary);
    const prewarm = plan.prewarmDue
      ? await prewarmJourney(process.env.PRODUCTION_APP_URL || request.nextUrl.origin, now)
      : null;
    return NextResponse.json({ ok: prewarm?.ok ?? true, boundary: plan.boundary.toISOString(), rollover, prewarm }, {
      status: prewarm && !prewarm.ok ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: { code: "UNAVAILABLE", message: "Minute reconciliation failed." } }, { status: 503 });
  }
}
