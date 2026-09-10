import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin/admin-auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { correctionModerationSchema } from "@/lib/validation/api";
import { apiError, readLimitedJson } from "@/lib/validation/http";
import { hasTrustedOrigin } from "@/lib/validation/origin";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  if (!validateAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!hasTrustedOrigin(request)) return apiError(403, "FORBIDDEN", "Untrusted request origin.");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return apiError(404, "NOT_FOUND", "Not found.");
  let candidate: unknown;
  try { candidate = await readLimitedJson(request, 512); } catch { return apiError(400, "BAD_REQUEST", "Invalid moderation request."); }
  const parsed = correctionModerationSchema.safeParse(candidate);
  if (!parsed.success) return apiError(422, "UNPROCESSABLE", "Choose accepted or rejected.");
  const supabase = getServerSupabase();
  if (!supabase) return apiError(503, "UNAVAILABLE", "Corrections are not configured.");
  const { data, error } = await supabase.rpc("moderate_correction", {
    p_id: id, p_status: parsed.data.status, p_now: new Date().toISOString(),
  });
  if (error) return error.code === "P0002"
    ? apiError(404, "NOT_FOUND", "Not found.")
    : apiError(503, "UNAVAILABLE", "Moderation could not be saved.");
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    id,
    status: parsed.data.status,
    packId: row?.out_pack_id ?? null,
    contributors: Number(row?.out_contributors ?? 0),
  }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}
