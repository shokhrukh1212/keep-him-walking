import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin/admin-auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { supporterActionSchema } from "@/lib/supporters/validation";
import { apiError, readLimitedJson } from "@/lib/validation/http";
import { hasTrustedOrigin } from "@/lib/validation/origin";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  if (!validateAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) return apiError(404, "NOT_FOUND", "Not found.");
  if (!hasTrustedOrigin(request)) return apiError(403, "FORBIDDEN", "Untrusted request origin.");
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return apiError(404, "NOT_FOUND", "Not found.");
  let body: unknown;
  try { body = await readLimitedJson(request, 512); } catch { return apiError(400, "BAD_REQUEST", "Invalid supporter action."); }
  const parsed = supporterActionSchema.safeParse(body);
  if (!parsed.success) return apiError(422, "UNPROCESSABLE", "Choose publish, unpublish or remove.");
  const supabase = getServerSupabase();
  if (!supabase) return apiError(503, "UNAVAILABLE", "Supporter records are not configured.");
  const { data, error } = await supabase.rpc("set_supporter_contribution_status", {
    p_id: id,
    p_action: parsed.data.action,
    p_now: new Date().toISOString(),
  });
  if (error) {
    if (error.code === "P0002") return apiError(404, "NOT_FOUND", "Not found.");
    if (error.code === "55000") return apiError(409, "CONFLICT", "Verify the contribution and record acknowledgment permission before publishing.");
    return apiError(503, "UNAVAILABLE", "The supporter action could not be saved.");
  }
  return NextResponse.json({ id, status: data }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}
