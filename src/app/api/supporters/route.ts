import { NextRequest, NextResponse } from "next/server";
import { loadPublicSupporters } from "@/lib/supporters/data";

export async function GET(request: NextRequest) {
  const beforeAt = request.nextUrl.searchParams.get("beforeAt");
  const rawBeforeId = request.nextUrl.searchParams.get("beforeId");
  const beforeId = rawBeforeId === null ? null : Number(rawBeforeId);
  if ((beforeAt === null) !== (beforeId === null)
    || (beforeAt !== null && !Number.isFinite(new Date(beforeAt).getTime()))
    || (beforeId !== null && (!Number.isSafeInteger(beforeId) || beforeId < 1))) {
    return NextResponse.json({ error: "Invalid supporter page." }, { status: 400 });
  }
  try {
    const page = await loadPublicSupporters(beforeAt, beforeId);
    return NextResponse.json(page, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    });
  } catch {
    return NextResponse.json({ error: "Supporters are temporarily unavailable." }, { status: 503 });
  }
}
