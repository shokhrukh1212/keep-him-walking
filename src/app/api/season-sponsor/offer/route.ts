import { NextResponse } from "next/server";
import { sponsorshipMode } from "@/lib/config/sponsorship";
import { withRouteTelemetry } from "@/lib/observability/route";
import { loadSeasonOffer } from "@/lib/sponsors/season-data";
import { apiError } from "@/lib/validation/http";

export const dynamic = "force-dynamic";

/** The one season on offer. Public, identical for everyone and briefly cached. */
async function handleGet() {
  if (sponsorshipMode() !== "season") return apiError(404, "NOT_FOUND", "Season sponsorship is not offered.");
  try {
    return NextResponse.json(await loadSeasonOffer(), {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch {
    return apiError(503, "UNAVAILABLE", "The season offer is temporarily unavailable.");
  }
}

export const GET = withRouteTelemetry("season_sponsor_offer", handleGet);
