import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin/admin-auth";
import { requestPlacementRefund } from "@/lib/payments/placements";
import { getServerSupabase } from "@/lib/supabase/server";
import { apiError, readLimitedJson } from "@/lib/validation/http";
import { hasTrustedOrigin } from "@/lib/validation/origin";

const schema = z.object({ action: z.enum(["approve", "remove"]), reason: z.enum(["moderation_removed", "rights_issue", "illegal_content", "delivery_failure"]).nullable() }).strict();

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validateAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!hasTrustedOrigin(request)) return apiError(403, "FORBIDDEN", "Untrusted request origin.");
  const id = (await params).id;
  if (!z.uuid().safeParse(id).success) return apiError(404, "NOT_FOUND", "Not found.");
  let body: unknown;
  try { body = await readLimitedJson(request, 512); } catch { return apiError(400, "BAD_REQUEST", "Invalid action."); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError(422, "UNPROCESSABLE", "Invalid action.");
  const supabase = getServerSupabase();
  if (!supabase) return apiError(503, "UNAVAILABLE", "Placement control is unavailable.");
  const now = new Date();
  const result = await supabase.rpc("admin_journey_sponsor_action", { p_order_id: id,
    p_action: parsed.data.action, p_reason: parsed.data.reason, p_now: now.toISOString() });
  if (result.error) return apiError(409, "CONFLICT", result.error.message);
  if (parsed.data.action === "remove") {
    const { data: order } = await supabase.from("journey_sponsor_orders").select("provider,provider_payment_id").eq("id", id).single();
    if (order?.provider_payment_id) await requestPlacementRefund(supabase, order.provider as "dodo" | "fixture", String(order.provider_payment_id), parsed.data.reason ?? "moderation_removed", now);
  }
  return NextResponse.json(result.data, { headers: { "Cache-Control": "private, no-store" } });
}
