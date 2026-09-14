import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { attachVisitorCookie, visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { withRouteTelemetry } from "@/lib/observability/route";
import { RATE_LIMITS, consumeRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { getServerSupabase } from "@/lib/supabase/server";
import { apiError, readLimitedJson } from "@/lib/validation/http";
import { hasTrustedOrigin } from "@/lib/validation/origin";

const bodySchema = z.object({ publicId: z.uuid() }).strict();

/** One first-party view per visitor per UTC day, only while the placement is live. */
async function handlePost(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return apiError(403, "FORBIDDEN", "Untrusted request origin.");
  let body: unknown;
  try {
    body = await readLimitedJson(request, 512);
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid metric request.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "UNPROCESSABLE", "Invalid metric request.");
  const supabase = getServerSupabase();
  if (!supabase) return apiError(503, "UNAVAILABLE", "Metrics are unavailable.");
  const visitor = visitorFromRequest(request);
  const limit = await consumeRateLimit(hashOpaqueValue(`season-metric:${visitor.visitorId}`), RATE_LIMITS.sponsorMetric);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);
  const now = new Date();
  const { data: booking } = await supabase.from("season_sponsorships")
    .select("id,journeys!inner(starts_at,ends_at)")
    .eq("public_id", parsed.data.publicId)
    .in("status", ["scheduled", "active"])
    .lte("journeys.starts_at", now.toISOString())
    .gt("journeys.ends_at", now.toISOString())
    .maybeSingle();
  if (!booking) return apiError(404, "NOT_FOUND", "Sponsor placement is unavailable.");
  const day = now.toISOString().slice(0, 10);
  await supabase.from("season_sponsor_metric_events").upsert({
    season_sponsorship_id: booking.id,
    event_type: "impression",
    dedupe_key: hashOpaqueValue(`${visitor.visitorId}:${parsed.data.publicId}:${day}`),
    occurred_at: now.toISOString(),
  }, { onConflict: "season_sponsorship_id,event_type,dedupe_key", ignoreDuplicates: true });
  const response = NextResponse.json({ accepted: true }, { headers: { "Cache-Control": "no-store" } });
  attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
  return response;
}

export const POST = withRouteTelemetry("season_sponsor_metrics", handlePost);
