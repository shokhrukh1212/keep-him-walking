import { NextRequest, NextResponse } from "next/server";
import { visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { shareDay } from "@/lib/share/data";
import { issueShareToken } from "@/lib/share/server-token";
import { getServerSupabase } from "@/lib/supabase/server";
import { hasTrustedOrigin } from "@/lib/validation/origin";

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Untrusted request origin." }, { status: 403 });
  const day = await shareDay();
  const supabase = getServerSupabase();
  if (!day || !supabase) return NextResponse.json({ error: "Share card unavailable." }, { status: 503 });
  const visitor = visitorFromRequest(request);
  const visitorHash = hashOpaqueValue(visitor.visitorId);
  const { data } = await supabase.from("visitor_day_contributions").select("active_seconds").eq("country_day_id", day.id).eq("visitor_hash", visitorHash).maybeSingle();
  const seconds = Math.max(0, Math.floor(Number(data?.active_seconds ?? 0)));
  const steps = Math.floor(seconds / .6);
  const token = issueShareToken({ purpose: "steps", day: day.dayNumber, seconds, steps });
  const imageUrl = `${request.nextUrl.origin}/api/og/steps?token=${encodeURIComponent(token)}`;
  const text = `I kept him walking for ${Math.floor(seconds / 60)} min in ${day.cityName}. ${steps.toLocaleString()} steps were mine. He only walks while someone is watching →`;
  return NextResponse.json({ token, imageUrl, text, url: request.nextUrl.origin, seconds, steps }, { headers: { "Cache-Control": "no-store" } });
}
