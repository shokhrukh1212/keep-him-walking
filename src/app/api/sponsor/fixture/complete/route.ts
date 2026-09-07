import { NextRequest, NextResponse } from "next/server";
import { fixturePaymentsAllowed } from "@/lib/config/phase2-policy";
import { verifyFixtureToken } from "@/lib/payments/fixture";
import { getServerSupabase } from "@/lib/supabase/server";
import { hasTrustedOrigin } from "@/lib/validation/origin";

export async function POST(request: NextRequest) {
  if (!fixturePaymentsAllowed() || !hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Fixture checkout is unavailable." }, { status: 404 });
  }
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const action = form.get("action") === "cancel" ? "cancel" : "confirm";
  const claims = verifyFixtureToken(token);
  const supabase = getServerSupabase();
  if (!claims || !supabase) return NextResponse.json({ error: "Invalid or expired fixture checkout." }, { status: 400 });

  const result = await supabase.from("sponsorships")
    .select("id,public_id,slot_id,status")
    .eq("id", claims.sponsorshipId)
    .maybeSingle();
  if (result.error || !result.data) return NextResponse.json({ error: "Unknown fixture checkout." }, { status: 404 });
  const sponsorship = result.data;
  const now = new Date().toISOString();

  if (action === "confirm" && sponsorship.status === "checkout_pending") {
    const update = await supabase.from("sponsorships")
      .update({ status: "paid_pending_review", paid_at: now, updated_at: now })
      .eq("id", sponsorship.id).eq("status", "checkout_pending");
    if (update.error) return NextResponse.json({ error: "Fixture transition failed." }, { status: 409 });
    await supabase.from("sponsor_slots")
      .update({ status: "sold", reserved_by: null, reserved_until: null, updated_at: now })
      .eq("id", sponsorship.slot_id);
  }
  if (action === "cancel" && sponsorship.status === "checkout_pending") {
    await supabase.from("sponsorships")
      .update({ status: "cancelled", updated_at: now })
      .eq("id", sponsorship.id).eq("status", "checkout_pending");
    await supabase.from("sponsor_slots")
      .update({ status: "available", reserved_by: null, reserved_until: null, updated_at: now })
      .eq("id", sponsorship.slot_id);
  }
  const redirect = action === "confirm"
    ? claims.returnUrl
    : new URL("/?fixture=cancelled", request.url).toString();
  return NextResponse.redirect(redirect, 303);
}
