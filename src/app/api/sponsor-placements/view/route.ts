import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { attachVisitorCookie, visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { clientAddress } from "@/lib/security/client-address";
import { getServerSupabase } from "@/lib/supabase/server";
import { apiError, readLimitedJson } from "@/lib/validation/http";
import { hasTrustedOrigin } from "@/lib/validation/origin";

const schema = z.object({ publicId: z.uuid(), eventId: z.uuid() }).strict();

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return apiError(403, "FORBIDDEN", "Untrusted request origin.");
  let body: unknown;
  try { body = await readLimitedJson(request, 2_048); } catch { return apiError(400, "BAD_REQUEST", "Invalid view event."); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError(422, "UNPROCESSABLE", "Invalid view event.");
  const visitor = visitorFromRequest(request);
  const supabase = getServerSupabase();
  if (!supabase) return apiError(503, "UNAVAILABLE", "Sponsor metrics are unavailable.");
  const { data, error } = await supabase.rpc("record_journey_sponsor_view", {
    p_public_id: parsed.data.publicId, p_event_id: parsed.data.eventId,
    p_visitor_hash: hashOpaqueValue(`placement-view:${visitor.visitorId}`),
    p_network_hash: hashOpaqueValue(`placement-view-network:${clientAddress(request.headers)}`),
    p_now: new Date().toISOString(),
  });
  if (error) return apiError(error.code === "P0002" ? 404 : 503,
    error.code === "P0002" ? "NOT_FOUND" : "UNAVAILABLE", "Sponsor view was not recorded.");
  const response = NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
  return response;
}
