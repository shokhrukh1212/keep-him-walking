import { NextRequest, NextResponse } from "next/server";
import { loadSponsorInventory } from "@/lib/sponsors/placements-data";
import { recordingSponsorInventory } from "@/lib/sponsors/recording";

export async function GET(request: NextRequest) {
  try {
    const recording = process.env.NODE_ENV !== "production" && request.nextUrl.searchParams.get("recording") === "1";
    const inventory = await loadSponsorInventory();
    return NextResponse.json(recording ? recordingSponsorInventory(inventory) : inventory, {
      headers: { "Cache-Control": recording ? "no-store" : "public, s-maxage=3, stale-while-revalidate=10" },
    });
  } catch {
    return NextResponse.json({ error: { code: "UNAVAILABLE", message: "Sponsor placements are temporarily unavailable." } }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
