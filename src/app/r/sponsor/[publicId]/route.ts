import { NextRequest, NextResponse } from "next/server";
import { visitorFromRequest, attachVisitorCookie } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.redirect(new URL("/", request.url));
  const { data } = await supabase.from("sponsorships")
    .select("id,cta_url,status,slot_id,sponsor_slots(country_day_id)")
    .eq("public_id", publicId).eq("status", "live").maybeSingle();
  if (!data?.cta_url) return NextResponse.redirect(new URL("/", request.url));
  let destination: URL;
  try { destination = new URL(data.cta_url); } catch { return NextResponse.redirect(new URL("/", request.url)); }
  if (destination.protocol !== "https:") return NextResponse.redirect(new URL("/", request.url));
  const visitor = visitorFromRequest(request);
  const slotRelation = Array.isArray(data.sponsor_slots) ? data.sponsor_slots[0] : data.sponsor_slots;
  const countryDayId = String(slotRelation?.country_day_id ?? "unknown");
  const visitorDayHash = hashOpaqueValue(`${visitor.visitorId}:${countryDayId}`);
  const fiveMinuteWindow = Math.floor(Date.now() / 300_000);
  const { data: allowed } = await supabase.rpc("consume_mutation_rate_limit", {
    p_key_hash: visitorDayHash, p_action: "sponsor_click", p_limit: 20, p_window_seconds: 300, p_now: new Date().toISOString(),
  });
  if (allowed) {
    await supabase.from("sponsor_metric_events").upsert({
      sponsorship_id: data.id,
      event_type: "cta_click",
      visitor_day_hash: visitorDayHash,
      dedupe_key: `${visitorDayHash}:${fiveMinuteWindow}`,
      occurred_at: new Date().toISOString(),
    }, { onConflict: "sponsorship_id,event_type,dedupe_key", ignoreDuplicates: true });
  }
  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "no-store");
  attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
  return response;
}
