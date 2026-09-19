import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin/admin-auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { apiError, readLimitedJson } from "@/lib/validation/http";
import { hasTrustedOrigin } from "@/lib/validation/origin";

const bodySchema = z.object({ action: z.enum(["waiting", "schedule", "cancel", "start"]), scheduledStartAt: z.iso.datetime().nullable() }).strict();

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validateAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!hasTrustedOrigin(request)) return apiError(403, "FORBIDDEN", "Untrusted request origin.");
  const id = (await params).id;
  if (!z.uuid().safeParse(id).success) return apiError(404, "NOT_FOUND", "Not found.");
  let body: unknown;
  try { body = await readLimitedJson(request, 1_024); } catch { return apiError(400, "BAD_REQUEST", "Invalid action."); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success || (parsed.data.action === "schedule" && !parsed.data.scheduledStartAt)) return apiError(422, "UNPROCESSABLE", "Choose a valid future launch time.");
  const supabase = getServerSupabase();
  if (!supabase) return apiError(503, "UNAVAILABLE", "Journey control is unavailable.");
  const { data, error } = await supabase.rpc("set_relaunch_journey_state", { p_journey_id: id,
    p_action: parsed.data.action, p_scheduled_start: parsed.data.scheduledStartAt,
    p_actor: "owner_admin", p_now: new Date().toISOString() });
  if (error) return apiError(409, "CONFLICT", error.message);
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
