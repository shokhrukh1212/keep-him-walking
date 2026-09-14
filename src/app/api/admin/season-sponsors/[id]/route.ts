import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin/admin-auth";
import { serverRuntimeConfig } from "@/lib/config/server";
import { seasonSaleCutoffHours } from "@/lib/config/sponsorship";
import { requestSeasonRefund } from "@/lib/payments/season";
import { getServerSupabase } from "@/lib/supabase/server";
import { apiError, readLimitedJson } from "@/lib/validation/http";
import { hasTrustedOrigin } from "@/lib/validation/origin";

type Context = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bodySchema = z.object({
  action: z.enum(["approve", "reject", "cancel", "remove", "require_refund", "refund", "mark_refunded"]),
}).strict();

const PRIVATE = { "Cache-Control": "private, no-store", Vary: "Cookie" };

/** Private review and servicing for season bookings. Unauthenticated requests get a real 404. */
export async function PATCH(request: NextRequest, { params }: Context) {
  if (!validateAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!hasTrustedOrigin(request)) return apiError(403, "FORBIDDEN", "Untrusted request origin.");
  const id = (await params).id;
  if (!UUID.test(id)) return apiError(404, "NOT_FOUND", "Not found.");
  let candidate: unknown;
  try {
    candidate = await readLimitedJson(request, 256);
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid action.");
  }
  const parsed = bodySchema.safeParse(candidate);
  if (!parsed.success) return apiError(422, "UNPROCESSABLE", "Unknown action.");
  const supabase = getServerSupabase();
  if (!supabase) return apiError(503, "UNAVAILABLE", "Sponsorship is not configured.");
  const { data: booking } = await supabase.from("season_sponsorships")
    .select("id,status,journey_id,private_logo_path,provider,provider_payment_id")
    .eq("id", id).maybeSingle();
  if (!booking) return apiError(404, "NOT_FOUND", "Not found.");
  const now = new Date().toISOString();
  const action = parsed.data.action;

  if (action === "approve") {
    // The reviewed logo is copied once to an immutable public path; the private
    // original never becomes public.
    const config = serverRuntimeConfig();
    const { data: logo, error: downloadError } = await supabase.storage.from(config.sponsorPrivateBucket)
      .download(String(booking.private_logo_path));
    if (downloadError || !logo) return apiError(503, "UNAVAILABLE", "The submitted logo could not be read.");
    const publicPath = `season/${booking.journey_id}/${booking.id}-${Date.now()}.webp`;
    const { error: uploadError } = await supabase.storage.from(config.sponsorPublicBucket)
      .upload(publicPath, logo, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
    if (uploadError) return apiError(503, "UNAVAILABLE", "The approved logo could not be published.");
    const { error } = await supabase.rpc("review_season_sponsorship", {
      p_id: id, p_decision: "approved", p_public_logo_path: publicPath, p_now: now, p_cutoff_hours: seasonSaleCutoffHours(),
    });
    if (error) {
      await supabase.storage.from(config.sponsorPublicBucket).remove([publicPath]);
      return apiError(409, "CONFLICT", error.message);
    }
  } else if (action === "reject") {
    const { error } = await supabase.rpc("review_season_sponsorship", {
      p_id: id, p_decision: "rejected", p_public_logo_path: null, p_now: now, p_cutoff_hours: seasonSaleCutoffHours(),
    });
    if (error) return apiError(409, "CONFLICT", error.message);
  } else if (action === "refund") {
    if (booking.status !== "refund_required" || !booking.provider || !booking.provider_payment_id) {
      return apiError(409, "CONFLICT", "Only a booking that needs a refund can be refunded.");
    }
    const requested = await requestSeasonRefund(
      supabase, booking.provider as "dodo" | "fixture", String(booking.provider_payment_id), "operator_refund",
    );
    if (!requested) return apiError(503, "UNAVAILABLE", "The provider did not accept the refund request.");
  } else {
    const { error } = await supabase.rpc("admin_season_sponsorship_action", { p_id: id, p_action: action, p_now: now });
    if (error) return apiError(409, "CONFLICT", error.message);
  }
  return NextResponse.json({ id, action }, { headers: PRIVATE });
}
