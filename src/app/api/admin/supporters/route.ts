import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin/admin-auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { supporterSaveSchema } from "@/lib/supporters/validation";
import { apiError, readLimitedJson } from "@/lib/validation/http";
import { hasTrustedOrigin } from "@/lib/validation/origin";

export async function POST(request: NextRequest) {
  if (!validateAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) return apiError(404, "NOT_FOUND", "Not found.");
  if (!hasTrustedOrigin(request)) return apiError(403, "FORBIDDEN", "Untrusted request origin.");
  let body: unknown;
  try { body = await readLimitedJson(request, 12_000); } catch { return apiError(400, "BAD_REQUEST", "Invalid supporter record."); }
  const parsed = supporterSaveSchema.safeParse(body);
  if (!parsed.success) return apiError(422, "UNPROCESSABLE", parsed.error.issues[0]?.message ?? "Invalid supporter record.");
  const supabase = getServerSupabase();
  if (!supabase) return apiError(503, "UNAVAILABLE", "Supporter records are not configured.");
  const value = parsed.data;
  const { data, error } = await supabase.rpc("save_supporter_contribution", {
    p_id: value.id,
    p_source: value.source,
    p_external_transaction_id: value.externalTransactionId,
    p_occurred_at: value.occurredAt,
    p_display_name: value.displayName,
    p_is_anonymous: value.isAnonymous,
    p_coffee_count: value.coffeeCount,
    p_x_url: value.xUrl,
    p_x_verified: value.xVerified,
    p_startup_url: value.startupUrl,
    p_startup_verified: value.startupVerified,
    p_private_email: value.privateEmail,
    p_private_payment_id: value.privatePaymentId,
    p_private_message: value.privateMessage,
    p_payment_verified: value.paymentVerified,
    p_acknowledgment_permission: value.acknowledgmentPermission,
    p_now: new Date().toISOString(),
  });
  if (error) {
    if (error.code === "23505") return apiError(409, "CONFLICT", "That transaction ID already exists.");
    if (error.code === "P0002") return apiError(404, "NOT_FOUND", "Not found.");
    return apiError(503, "UNAVAILABLE", "The supporter record could not be saved.");
  }
  return NextResponse.json({ id: Number(data) }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}
