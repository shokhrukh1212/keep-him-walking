import { NextRequest, NextResponse } from "next/server";
import { liveBootstrapSnapshot } from "@/lib/bootstrap/server";
import { attachVisitorCookie, visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const visitor = visitorFromRequest(request);
  try {
    const snapshot = await liveBootstrapSnapshot(hashOpaqueValue(visitor.visitorId));
    if (!snapshot) {
      const response = NextResponse.json(
        { error: "Live journey is not configured or no country-day is active." },
        { status: 503 },
      );
      attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
      return response;
    }
    const response = NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
    attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
    return response;
  } catch {
    const response = NextResponse.json(
      { error: "The live snapshot is temporarily unavailable." },
      { status: 503 },
    );
    attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
    return response;
  }
}
