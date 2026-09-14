import { NextRequest, NextResponse } from "next/server";
import { attachVisitorCookie, visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/security/rate-limit";
import { getServerSupabase } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The disclosed season sponsor link: counts one click per visitor per five minutes,
 * then sends the visitor to the approved https website. A booking that was never
 * paid, or was refunded or removed, leads back to the walk instead.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const home = NextResponse.redirect(new URL("/", request.url));
  const supabase = getServerSupabase();
  if (!supabase || !UUID.test(publicId)) return home;
  const { data } = await supabase.from("season_sponsorships")
    .select("id,website_url,status")
    .eq("public_id", publicId)
    .in("status", ["scheduled", "active", "completed"])
    .maybeSingle();
  if (!data?.website_url) return home;
  let destination: URL;
  try {
    destination = new URL(String(data.website_url));
  } catch {
    return home;
  }
  if (destination.protocol !== "https:") return home;
  const visitor = visitorFromRequest(request);
  const visitorKey = hashOpaqueValue(`${visitor.visitorId}:season-sponsor:${publicId}`);
  const limit = await consumeRateLimit(visitorKey, RATE_LIMITS.sponsorClick);
  if (limit.allowed) {
    await supabase.from("season_sponsor_metric_events").upsert({
      season_sponsorship_id: data.id,
      event_type: "cta_click",
      dedupe_key: `${visitorKey}:${Math.floor(Date.now() / 300_000)}`,
      occurred_at: new Date().toISOString(),
    }, { onConflict: "season_sponsorship_id,event_type,dedupe_key", ignoreDuplicates: true });
  }
  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "no-store");
  attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
  return response;
}
