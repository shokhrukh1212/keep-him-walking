import { NextResponse } from "next/server";
import { loadSponsorInventory } from "@/lib/sponsors/placements-data";

export async function GET() {
  try {
    return NextResponse.json(await loadSponsorInventory(), {
      headers: { "Cache-Control": "public, s-maxage=3, stale-while-revalidate=10" },
    });
  } catch {
    return NextResponse.json({ error: { code: "UNAVAILABLE", message: "Sponsor placements are temporarily unavailable." } }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
