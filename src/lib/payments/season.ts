import "server-only";

import { randomUUID } from "node:crypto";
import { trackServerEvent } from "@/lib/analytics/server";
import {
  seasonCheckoutState,
  seasonHoldGraceMinutes,
  seasonHoldMinutes,
  seasonPriceIncludesTax,
  seasonProductId,
  seasonSaleCutoffHours,
  seasonSponsorPriceCents,
  type SeasonPaymentProvider,
} from "@/lib/config/sponsorship";
import { writeOperationalLog } from "@/lib/observability/logger";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  DODO_PAYMENT_IN_PROGRESS,
  createDodoCheckout,
  dodoCheckoutBody,
  dodoEnvironment,
  getDodoCheckout,
  getDodoPayment,
  refundDodoPayment,
  seasonPaymentFacts,
  webhookPaymentId,
  type DodoWebhook,
  type SeasonPaymentFacts,
} from "./dodo";
import { createFixtureToken } from "./fixture";

type Supabase = NonNullable<ReturnType<typeof getServerSupabase>>;

/** A Dodo checkout session stays payable this long, so an in-progress payment keeps its hold. */
const CHECKOUT_SESSION_MS = 24 * 3_600_000;

export function dodoOptions() {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  return apiKey ? { apiKey, environment: dodoEnvironment() } : null;
}

export type SeasonCheckoutResult =
  | { state: "redirect"; url: string }
  | { state: "disabled" | "not_found" | "paid" | "not_approved" | "closed" | "quote_changed" | "schedule_changed" | "unavailable" | "provider_error" };

type HoldState = "paid" | "not_approved" | "closed" | "unavailable";
const HOLD_STATES = new Set<string>(["paid", "not_approved", "closed", "unavailable"]);

/**
 * Holds the season for one approved request, then creates the provider checkout at
 * the fixed price. The browser never names an amount, and a failure releases the
 * hold rather than leaving the week reserved.
 */
export async function startSeasonCheckout(publicId: string, origin: string, now = new Date()): Promise<SeasonCheckoutResult> {
  const supabase = getServerSupabase();
  if (!supabase) return { state: "disabled" };
  const { data: candidate, error: candidateError } = await supabase.from("season_sponsorships")
    .select("id,price_cents,quoted_starts_at,quoted_ends_at,journeys(season_number,starts_at,ends_at)")
    .eq("public_id", publicId)
    .maybeSingle();
  if (candidateError || !candidate) return { state: candidateError ? "provider_error" : "not_found" };
  const candidateSeason = (Array.isArray(candidate.journeys) ? candidate.journeys[0] : candidate.journeys) as {
    season_number: number; starts_at: string; ends_at: string;
  } | null;
  if (!candidateSeason) return { state: "not_found" };
  if (Date.parse(String(candidate.quoted_starts_at)) !== Date.parse(candidateSeason.starts_at)
    || Date.parse(String(candidate.quoted_ends_at)) !== Date.parse(candidateSeason.ends_at)) {
    return { state: "schedule_changed" };
  }
  const seasonNumber = Number(candidateSeason.season_number);
  if (Number(candidate.price_cents) !== seasonSponsorPriceCents(seasonNumber)) {
    return { state: "quote_changed" };
  }
  const gate = seasonCheckoutState(process.env, seasonNumber);
  if (!gate.enabled) return { state: "disabled" };
  const cutoffHours = seasonSaleCutoffHours();
  const { data, error } = await supabase.rpc("hold_season_sponsorship", {
    p_public_id: publicId,
    p_provider: gate.provider,
    p_test_mode: gate.testMode,
    p_hold_minutes: seasonHoldMinutes(),
    p_grace_minutes: seasonHoldGraceMinutes(),
    p_cutoff_hours: cutoffHours,
    p_now: now.toISOString(),
  });
  if (error) {
    if (error.code === "P0002") return { state: "not_found" };
    if (error.message.includes("season schedule changed")) return { state: "schedule_changed" };
    if (error.message.includes("season quote changed")) return { state: "quote_changed" };
    return { state: "provider_error" };
  }
  const hold = data as { state: string; id: string; holdExpiresAt?: string };
  if (hold.state !== "held") {
    return { state: HOLD_STATES.has(hold.state) ? hold.state as HoldState : "unavailable" };
  }
  const release = () => supabase.rpc("release_season_hold", {
    p_id: hold.id, p_reason: "checkout_failed", p_cutoff_hours: cutoffHours, p_now: new Date().toISOString(),
  });
  const { data: booking, error: bookingError } = await supabase.from("season_sponsorships")
    .select("id,journey_id,contact_email,contact_name,price_cents,journeys(season_number)")
    .eq("id", hold.id)
    .single();
  if (bookingError || !booking) {
    await release();
    return { state: "provider_error" };
  }
  const season = (Array.isArray(booking.journeys) ? booking.journeys[0] : booking.journeys) as { season_number: number } | null;
  const returnUrl = `${origin}/sponsors/request/${publicId}`;
  try {
    let checkoutId: string;
    let url: string;
    if (gate.provider === "fixture") {
      checkoutId = `fixture_${randomUUID()}`;
      const token = createFixtureToken({
        sponsorshipId: String(booking.id),
        expiresAt: hold.holdExpiresAt ?? new Date(now.getTime() + seasonHoldMinutes() * 60_000).toISOString(),
        returnUrl,
        kind: "season",
        checkoutId,
      });
      url = `${origin}/sponsor/fixture?token=${encodeURIComponent(token)}`;
    } else {
      const options = dodoOptions();
      if (!options) throw new Error("DODO_NOT_CONFIGURED");
      const productId = seasonProductId(Number(season?.season_number ?? seasonNumber));
      if (!productId) throw new Error("DODO_PRODUCT_NOT_CONFIGURED");
      const session = await createDodoCheckout(dodoCheckoutBody({
        productId,
        customerEmail: String(booking.contact_email),
        customerName: String(booking.contact_name),
        returnUrl,
        bookingId: String(booking.id),
        journeyId: String(booking.journey_id),
        seasonNumber: Number(season?.season_number ?? 0),
      }), options);
      checkoutId = session.sessionId;
      url = session.checkoutUrl;
    }
    const { data: attached, error: attachError } = await supabase.rpc("attach_season_checkout", {
      p_id: booking.id, p_checkout_id: checkoutId, p_now: new Date().toISOString(),
    });
    if (attachError || attached !== true) throw attachError ?? new Error("HOLD_LOST");
    trackServerEvent("season_sponsor_checkout_started", String(booking.id), {
      provider: gate.provider, test_mode: gate.testMode, price_cents: Number(booking.price_cents), season_number: seasonNumber,
    });
    return { state: "redirect", url };
  } catch {
    await release();
    return { state: "provider_error" };
  }
}

export type SeasonPaymentOutcome = {
  outcome: "scheduled" | "refund_required" | "refund_requested" | "refunded" | "unmatched";
  duplicate: boolean;
  bookingId: string | null;
  reason: string | null;
};

/**
 * Applies a payment the provider has confirmed. The database decides; a payment that
 * cannot be delivered (a late checkout, a second payment, a wrong amount) is sent
 * straight back to the provider for refund, and stays visible until it is.
 */
export async function applySeasonPayment(
  supabase: Supabase,
  provider: SeasonPaymentProvider,
  facts: SeasonPaymentFacts,
  testMode: boolean,
  now = new Date(),
): Promise<SeasonPaymentOutcome> {
  const { data, error } = await supabase.rpc("confirm_season_payment", {
    p_provider: provider,
    p_payment_id: facts.paymentId,
    p_booking_id: facts.bookingId,
    p_checkout_id: facts.checkoutId,
    p_amount_cents: facts.amountCents,
    p_tax_cents: facts.taxCents,
    p_currency: facts.currency,
    p_test_mode: testMode,
    p_product_matches: facts.productMatches,
    p_tax_inclusive: seasonPriceIncludesTax(),
    p_now: now.toISOString(),
  });
  if (error) throw error;
  const result = data as SeasonPaymentOutcome;
  if (result.duplicate) return result;
  if (result.outcome === "scheduled") {
    trackServerEvent("season_sponsor_payment_confirmed", result.bookingId ?? facts.paymentId, { provider, test_mode: testMode });
  } else if (result.outcome === "refund_required") {
    trackServerEvent("season_sponsor_refund_required", result.bookingId ?? facts.paymentId, { provider, reason: result.reason });
    void writeOperationalLog("warning", "season_sponsor_refund_required", { provider, reason: result.reason });
    await requestSeasonRefund(supabase, provider, facts.paymentId, result.reason ?? "refund_required", now);
  }
  return result;
}

/** Asks the provider for a full refund. Its own refund event later confirms it. */
export async function requestSeasonRefund(
  supabase: Supabase,
  provider: SeasonPaymentProvider,
  paymentId: string,
  reason: string,
  now = new Date(),
): Promise<boolean> {
  try {
    if (provider === "fixture") {
      const { error } = await supabase.rpc("record_season_refund", {
        p_provider: "fixture", p_payment_id: paymentId, p_now: now.toISOString(),
      });
      if (error) throw error;
      return true;
    }
    const options = dodoOptions();
    if (!options) throw new Error("DODO_NOT_CONFIGURED");
    await refundDodoPayment(paymentId, reason, options);
    const { error } = await supabase.rpc("mark_season_refund_requested", {
      p_provider: "dodo", p_payment_id: paymentId, p_now: now.toISOString(),
    });
    if (error) throw error;
    return true;
  } catch {
    void writeOperationalLog("error", "season_sponsor_refund_request_failed", { provider, reason });
    return false;
  }
}

/**
 * Releases holds that produced no payment. A lapsed Dodo hold is first checked with
 * the provider: a succeeded payment is applied, a payment still in progress keeps
 * the season held while its session can still pay, and an unreachable provider
 * releases nothing on a guess.
 */
export async function reconcileSeasonHolds(supabase: Supabase, now = new Date()) {
  const graceMs = seasonHoldGraceMinutes() * 60_000;
  const { data, error } = await supabase.from("season_sponsorships")
    .select("id,provider,provider_checkout_id,hold_expires_at,journeys(season_number)")
    .eq("status", "payment_pending")
    .lte("hold_expires_at", new Date(now.getTime() - graceMs).toISOString())
    .limit(50);
  if (error) throw error;
  const summary = { released: 0, confirmed: 0, waiting: 0 };
  for (const hold of data ?? []) {
    const options = hold.provider === "dodo" && hold.provider_checkout_id ? dodoOptions() : null;
    if (options) {
      try {
        const checkout = await getDodoCheckout(String(hold.provider_checkout_id), options);
        if (checkout.paymentStatus === "succeeded" && checkout.paymentId) {
          const payment = await getDodoPayment(checkout.paymentId, options);
          if (payment) {
            const season = (Array.isArray(hold.journeys) ? hold.journeys[0] : hold.journeys) as { season_number: number } | null;
            await applySeasonPayment(
              supabase,
              "dodo",
              seasonPaymentFacts(payment, seasonProductId(Number(season?.season_number ?? 0))),
              options.environment === "test_mode",
              now,
            );
            summary.confirmed += 1;
            continue;
          }
        }
        if (checkout.paymentStatus && DODO_PAYMENT_IN_PROGRESS.has(checkout.paymentStatus)
          && now.getTime() - Date.parse(String(hold.hold_expires_at)) < CHECKOUT_SESSION_MS) {
          summary.waiting += 1;
          continue;
        }
      } catch {
        summary.waiting += 1;
        continue;
      }
    }
    const { error: releaseError } = await supabase.rpc("release_season_hold", {
      p_id: hold.id, p_reason: "hold_expired", p_cutoff_hours: seasonSaleCutoffHours(), p_now: now.toISOString(),
    });
    if (!releaseError) summary.released += 1;
  }
  return summary;
}

const DISPUTE_STATES: Record<string, "opened" | "won" | "lost"> = {
  "dispute.opened": "opened",
  "dispute.won": "won",
  "dispute.lost": "lost",
};

/**
 * One verified Dodo event. A success is never trusted from the event body: the
 * payment is read back from the provider and every fact re-checked in Postgres.
 */
export async function handleDodoEvent(
  supabase: Supabase,
  event: DodoWebhook,
  now = new Date(),
): Promise<{ status: "processed" | "ignored"; errorCode?: string; bookingId?: string | null }> {
  const paymentId = webhookPaymentId(event);
  if (!paymentId) return { status: "ignored", errorCode: "NO_PAYMENT_ID" };
  if (event.type === "payment.succeeded") {
    const options = dodoOptions();
    if (!options) throw new Error("DODO_NOT_CONFIGURED");
    const payment = await getDodoPayment(paymentId, options);
    if (!payment) return { status: "ignored", errorCode: "UNKNOWN_PAYMENT" };
    const initial = seasonPaymentFacts(payment, "");
    let productId = "";
    if (initial.bookingId) {
      const { data: booking, error } = await supabase.from("season_sponsorships")
        .select("journeys(season_number)").eq("id", initial.bookingId).maybeSingle();
      if (error) throw error;
      const season = (Array.isArray(booking?.journeys) ? booking.journeys[0] : booking?.journeys) as { season_number: number } | null;
      productId = seasonProductId(Number(season?.season_number ?? 0));
    }
    if (!productId) {
      productId = [1, 2, 3].map((number) => seasonProductId(number))
        .find((candidate) => candidate && seasonPaymentFacts(payment, candidate).productMatches) ?? "";
    }
    const facts = seasonPaymentFacts(payment, productId);
    if (!facts.succeeded) return { status: "ignored", errorCode: "PAYMENT_NOT_SUCCEEDED" };
    if (!facts.bookingId && !facts.productMatches) return { status: "ignored", errorCode: "NOT_A_SEASON_PAYMENT" };
    const result = await applySeasonPayment(supabase, "dodo", facts, options.environment === "test_mode", now);
    return { status: "processed", bookingId: result.bookingId };
  }
  if (event.type === "refund.succeeded") {
    const { data, error } = await supabase.rpc("record_season_refund", {
      p_provider: "dodo", p_payment_id: paymentId, p_now: now.toISOString(),
    });
    if (error) throw error;
    return { status: "processed", bookingId: (data as { bookingId?: string | null } | null)?.bookingId ?? null };
  }
  const disputeState = DISPUTE_STATES[event.type];
  if (disputeState) {
    const { data, error } = await supabase.rpc("record_season_dispute", {
      p_provider: "dodo", p_payment_id: paymentId, p_state: disputeState, p_now: now.toISOString(),
    });
    if (error) throw error;
    return { status: "processed", bookingId: (data as { bookingId?: string | null } | null)?.bookingId ?? null };
  }
  return { status: "ignored", errorCode: "UNHANDLED_EVENT" };
}
