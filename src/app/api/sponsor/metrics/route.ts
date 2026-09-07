import { NextRequest, NextResponse } from "next/server";
import { visitorFromRequest, attachVisitorCookie } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { sponsorMetricBodySchema } from "@/lib/validation/api";
import { apiError, readLimitedJson } from "@/lib/validation/http";
import { hasTrustedOrigin } from "@/lib/validation/origin";
import { RATE_LIMITS, consumeRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { withRouteTelemetry } from "@/lib/observability/route";

async function handlePost(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return apiError(403, "FORBIDDEN", "Untrusted request origin.");
  let body: unknown;
  try { body = await readLimitedJson(request, 4_096); } catch { return apiError(400, "BAD_REQUEST", "Invalid metric request."); }
  const parsed = sponsorMetricBodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "UNPROCESSABLE", "Invalid metric request.");
  const supabase = getServerSupabase();
  if (!supabase) return apiError(503, "UNAVAILABLE", "Metrics are unavailable.");
  const { data: sponsor } = await supabase.from("sponsorships")
    .select("id,status,sponsor_slots(country_day_id)").eq("public_id", parsed.data.publicId).eq("status", "live").maybeSingle();
  if (!sponsor) return apiError(404, "NOT_FOUND", "Sponsor placement is unavailable.");
  const slot = Array.isArray(sponsor.sponsor_slots) ? sponsor.sponsor_slots[0] : sponsor.sponsor_slots;
  const visitor = visitorFromRequest(request);
  const visitorDayHash = hashOpaqueValue(`${visitor.visitorId}:${slot?.country_day_id ?? "unknown"}`);
  const limit = await consumeRateLimit(visitorDayHash, RATE_LIMITS.sponsorMetric);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);
  const dedupeKey = `${visitorDayHash}:${parsed.data.eventType}`;
  await supabase.from("sponsor_metric_events").upsert({
    sponsorship_id: sponsor.id,
    event_type: parsed.data.eventType,
    visitor_day_hash: visitorDayHash,
    dedupe_key: dedupeKey,
    occurred_at: new Date().toISOString(),
  }, { onConflict: "sponsorship_id,event_type,dedupe_key", ignoreDuplicates: true });
  const response = NextResponse.json({ accepted: true });
  attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
  return response;
}

export const POST = withRouteTelemetry("sponsor_metrics", handlePost);
