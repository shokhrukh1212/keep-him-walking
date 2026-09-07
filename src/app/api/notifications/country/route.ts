import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { attachVisitorCookie, visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { RATE_LIMITS, consumeRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { hasTrustedOrigin } from "@/lib/validation/origin";
import { readLimitedJson } from "@/lib/validation/http";
import { withRouteTelemetry } from "@/lib/observability/route";

const schema = z.object({ countryCode: z.string().regex(/^[A-Z]{2}$/), enabled: z.boolean() });

async function handlePost(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Untrusted request origin." }, { status: 403 });
  if (!process.env.NOTIFICATION_DELIVERY_PROVIDER) return NextResponse.json({ error: "Notifications are not available yet. Use the calendar reminder instead." }, { status: 503 });
  let body: unknown; try { body = await readLimitedJson(request, 1_024); } catch { return NextResponse.json({ error: "Invalid preference." }, { status: 400 }); }
  const parsed = schema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "Invalid preference." }, { status: 422 });
  const visitor = visitorFromRequest(request); const visitorHash = hashOpaqueValue(visitor.visitorId);
  const limit = await consumeRateLimit(visitorHash, RATE_LIMITS.notification); if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);
  const supabase = getServerSupabase(); if (!supabase) return NextResponse.json({ error: "Notifications are unavailable." }, { status: 503 });
  const { data, error } = await supabase.rpc("set_country_notification_opt_in", { p_visitor_hash: visitorHash, p_country_code: parsed.data.countryCode, p_enabled: parsed.data.enabled, p_now: new Date().toISOString() });
  if (error) return NextResponse.json({ error: "Preference could not be saved." }, { status: 503 });
  const response = NextResponse.json({ status: data }); attachVisitorCookie(response, visitor.visitorId, visitor.isNew); return response;
}

export const POST = withRouteTelemetry("country_notification", handlePost);
