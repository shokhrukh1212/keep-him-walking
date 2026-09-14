import { NextResponse } from "next/server";
import { fetchAudienceCounts } from "@/lib/analytics/datafast";
import { withRouteTelemetry } from "@/lib/observability/route";
import { apiError } from "@/lib/validation/http";

// The handler runs on every miss; the DataFast reads underneath keep their own cache.
export const revalidate = 0;

/** Site visitor counts from DataFast. Public, identical for everyone and briefly cached. */
async function handleGet() {
  const apiKey = process.env.DATAFAST_API_KEY;
  if (!apiKey) return apiError(503, "UNAVAILABLE", "Visitor counts are not configured.");
  const counts = await fetchAudienceCounts(apiKey, new Date());
  if (counts.online === null && counts.last24Hours === null && counts.allTime === null) {
    return apiError(503, "UNAVAILABLE", "Visitor counts are temporarily unavailable.");
  }
  return NextResponse.json(counts, {
    headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=45" },
  });
}

export const GET = withRouteTelemetry("audience", handleGet);
