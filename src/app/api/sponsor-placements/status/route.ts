import { NextRequest, NextResponse } from "next/server";
import { attachVisitorCookie, visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { PLACEMENT_ORDER_COOKIE } from "@/lib/sponsors/placement-cookie";
import { getServerSupabase } from "@/lib/supabase/server";
import { apiError } from "@/lib/validation/http";

export async function GET(request: NextRequest) {
  const publicId = request.cookies.get(PLACEMENT_ORDER_COOKIE)?.value;
  if (!publicId || !/^[0-9a-f-]{36}$/i.test(publicId)) {
    return NextResponse.json({ purchase: null }, { headers: { "Cache-Control": "no-store" } });
  }
  const visitor = visitorFromRequest(request);
  const supabase = getServerSupabase();
  if (!supabase) return apiError(503, "UNAVAILABLE", "Sponsor status is unavailable.");
  const { data, error } = await supabase.from("journey_sponsor_orders")
    .select("public_id,status,tier,slot_id,moderation_reason")
    .eq("public_id", publicId)
    .eq("buyer_hash", hashOpaqueValue(`placement-buyer:${visitor.visitorId}`))
    .maybeSingle();
  if (error) return apiError(503, "UNAVAILABLE", "Sponsor status is unavailable.");
  if (!data) return apiError(404, "NOT_FOUND", "Sponsor order not found.");
  const response = NextResponse.json({ purchase: data.public_id, status: data.status, tier: data.tier,
    slotId: data.slot_id, needsReview: data.status === "pending_review",
    refundable: ["refund_required", "refund_requested"].includes(data.status) },
  { headers: { "Cache-Control": "no-store" } });
  if (!["reserved", "payment_pending", "paid_pending_publish"].includes(String(data.status))) {
    response.cookies.set(PLACEMENT_ORDER_COOKIE, "", { path: "/", maxAge: 0 });
  }
  attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
  return response;
}
