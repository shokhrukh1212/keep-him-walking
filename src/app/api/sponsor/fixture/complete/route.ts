import { NextRequest, NextResponse } from "next/server";
import { fixturePaymentsAllowed } from "@/lib/config/phase2-policy";
import {
  SEASON_SPONSOR_CURRENCY,
  SEASON_SPONSOR_PRICE_CENTS,
  legacyPurchasesOpen,
  seasonSaleCutoffHours,
} from "@/lib/config/sponsorship";
import { verifyFixtureToken } from "@/lib/payments/fixture";
import { applySeasonPayment } from "@/lib/payments/season";
import { getServerSupabase } from "@/lib/supabase/server";
import { hasTrustedOrigin } from "@/lib/validation/origin";

type Supabase = NonNullable<ReturnType<typeof getServerSupabase>>;

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
  if (claims.kind === "season") {
    return completeSeasonFixture(supabase, { ...claims, kind: "season" }, action);
  }
  // Day sponsorship fixtures rehearse daily mode only.
  if (!legacyPurchasesOpen()) return NextResponse.json({ error: "Fixture checkout is unavailable." }, { status: 404 });

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
    await supabase.from("tickets").update({ status: "cancelled", updated_at: now })
      .eq("sponsorship_id", sponsorship.id).eq("status", "pending_review");
  }
  const redirect = action === "confirm"
    ? claims.returnUrl
    : new URL("/?fixture=cancelled", request.url).toString();
  return NextResponse.redirect(redirect, 303);
}

/**
 * The no-money season rehearsal. A confirm goes through the same payment path a
 * verified provider payment does, with one payment id per checkout, so submitting
 * twice is a duplicate rather than a second sale.
 */
async function completeSeasonFixture(
  supabase: Supabase,
  claims: { sponsorshipId: string; returnUrl: string; checkoutId?: string; kind: "season" },
  action: "confirm" | "cancel",
) {
  const now = new Date();
  if (action === "confirm") {
    const checkoutId = claims.checkoutId ?? `fixture_${claims.sponsorshipId}`;
    await applySeasonPayment(supabase, "fixture", {
      paymentId: `${checkoutId}_paid`,
      bookingId: claims.sponsorshipId,
      checkoutId,
      amountCents: SEASON_SPONSOR_PRICE_CENTS,
      taxCents: 0,
      currency: SEASON_SPONSOR_CURRENCY,
      succeeded: true,
      productMatches: true,
    }, true, now);
  } else {
    await supabase.rpc("release_season_hold", {
      p_id: claims.sponsorshipId, p_reason: "checkout_cancelled", p_cutoff_hours: seasonSaleCutoffHours(), p_now: now.toISOString(),
    });
  }
  return NextResponse.redirect(claims.returnUrl, 303);
}
