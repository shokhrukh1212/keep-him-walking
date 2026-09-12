import { NextRequest, NextResponse } from "next/server";
import { prewarmJourney } from "@/lib/launch/prewarm-service";
import { validCronAuthorization } from "@/lib/story-clock/cron-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!validCronAuthorization(request.headers.get("authorization"))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Invalid cron authorization." } }, { status: 403 });
  }
  try {
    const appOrigin = process.env.PRODUCTION_APP_URL || request.nextUrl.origin;
    const result = await prewarmJourney(appOrigin);
    return NextResponse.json(result, {
      status: result.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAVAILABLE";
    return NextResponse.json({ error: { code, message: "Prewarm reconciliation failed." } }, { status: 503 });
  }
}
