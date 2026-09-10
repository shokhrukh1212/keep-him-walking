import { NextRequest, NextResponse } from "next/server";
import { getCountryPack } from "@/content/countries/registry";
import { countryFromHeader, COUNTRY_HEADER } from "@/lib/countries/header";
import { attachVisitorCookie, visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { correctionBodySchema } from "@/lib/validation/api";
import { apiError, readLimitedJson } from "@/lib/validation/http";
import { hasTrustedOrigin } from "@/lib/validation/origin";

export async function handleCorrectionPost(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return apiError(403, "FORBIDDEN", "Untrusted request origin.");
  let candidate: unknown;
  try { candidate = await readLimitedJson(request, 2_048); } catch { return apiError(400, "BAD_REQUEST", "Invalid correction."); }
  const parsed = correctionBodySchema.safeParse(candidate);
  if (!parsed.success) return apiError(422, "UNPROCESSABLE", "Check the category and keep the correction under 280 characters.");
  const pack = getCountryPack(parsed.data.packId);
  if (!pack) return apiError(404, "NOT_FOUND", "That city pack is not available.");
  const zoneId = parsed.data.zoneId ?? null;
  if (zoneId && !pack.route.zones.some((zone) => zone.id === zoneId)) {
    return apiError(422, "UNPROCESSABLE", "That route zone does not belong to this city.");
  }
  const supabase = getServerSupabase();
  if (!supabase) return apiError(503, "UNAVAILABLE", "Corrections are not configured.");
  const visitor = visitorFromRequest(request);
  const { data, error } = await supabase.rpc("submit_correction", {
    p_visitor_hash: hashOpaqueValue(visitor.visitorId),
    p_pack_id: pack.assetVersion,
    p_zone_id: zoneId,
    p_category: parsed.data.category,
    p_body: parsed.data.body,
    p_country_code: countryFromHeader(request.headers.get(COUNTRY_HEADER)),
    p_now: new Date().toISOString(),
  });
  if (error) return apiError(503, "UNAVAILABLE", "The correction could not be stored.");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return apiError(503, "UNAVAILABLE", "Correction confirmation is unavailable.");
  if (row.out_rate_limited) {
    const response = apiError(429, "RATE_LIMITED", "You can send three corrections per hour.");
    response.headers.set("Retry-After", "3600");
    response.headers.set("Cache-Control", "private, no-store");
    attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
    return response;
  }
  const response = NextResponse.json({ accepted: true }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
  return response;
}
