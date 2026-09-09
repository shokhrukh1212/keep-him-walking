import { NextResponse } from "next/server";
import { loadJourneyMap } from "@/lib/map/data";

export async function GET() {
  const data = await loadJourneyMap();
  if (!data) return NextResponse.json({ error: "Map unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60" } });
}
