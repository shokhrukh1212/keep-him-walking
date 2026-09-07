import { NextRequest, NextResponse } from "next/server";
import { trackServerEvent } from "@/lib/analytics/server";
import { reconcilePhase2 } from "@/lib/story-clock/rollover";
import { validCronAuthorization } from "@/lib/story-clock/cron-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!validCronAuthorization(request.headers.get("authorization"))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Invalid cron authorization." } }, { status: 403 });
  }
  try {
    const result = await reconcilePhase2();
    if (!result.duplicate) trackServerEvent("rollover_completed", "phase2-operations", { operation_key: result.operationKey });
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ error: { code: "UNAVAILABLE", message: "Rollover reconciliation failed." } }, { status: 503 });
  }
}
