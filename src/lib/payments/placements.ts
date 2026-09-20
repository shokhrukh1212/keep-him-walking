import "server-only";

import { randomUUID } from "node:crypto";
import { trackServerEvent } from "@/lib/analytics/server";
import {
  PLACEMENT_CHECKOUT_LIFETIME_MINUTES,
  placementCheckoutState,
  placementProductId,
  placementProviderProductId,
  type PlacementPaymentProvider,
} from "@/lib/config/placements";
import { serverRuntimeConfig } from "@/lib/config/server";
import { seasonPriceIncludesTax } from "@/lib/config/sponsorship";
import { writeOperationalLog } from "@/lib/observability/logger";
import { placementPriceCents, type SponsorPlacementTier } from "@/lib/relaunch/config";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  DODO_PAYMENT_IN_PROGRESS,
  createDodoCheckout,
  dodoCheckoutLinkExpired,
  dodoCheckoutUrl,
  dodoEnvironment,
  dodoPlacementCheckoutBody,
  getDodoCheckout,
  getDodoPayment,
  placementPaymentFacts,
  refundDodoPayment,
  webhookPaymentId,
  type DodoWebhook,
  type PlacementPaymentFacts,
} from "./dodo";
import { createFixtureToken } from "./fixture";

type Supabase = NonNullable<ReturnType<typeof getServerSupabase>>;

function dodoOptions() {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  return apiKey ? { apiKey, environment: dodoEnvironment() } : null;
}

async function releasePlacementCheckout(supabase: Supabase, order: {
  id: string; private_logo_path?: string | null;
}, reason: string, now: Date): Promise<boolean> {
  const released = await supabase.rpc("release_journey_sponsor_reservation", {
    p_order_id: order.id, p_provider_terminal: true, p_reason: reason, p_now: now.toISOString(),
  });
  if (released.error) return false;
  if (order.private_logo_path) {
    await supabase.storage.from(serverRuntimeConfig().sponsorPrivateBucket).remove([order.private_logo_path]);
  }
  return true;
}

export async function placementCheckoutDisplayState(supabase: Supabase, order: {
  id: string;
  status: string;
  provider: string;
  provider_checkout_id: string | null;
  private_logo_path: string | null;
}, now = new Date()): Promise<{ status: string; checkoutUrl: string | null }> {
  if (order.status !== "payment_pending" || order.provider !== "dodo" || !order.provider_checkout_id) {
    return { status: order.status, checkoutUrl: null };
  }
  const options = dodoOptions();
  if (!options) return { status: order.status, checkoutUrl: null };
  try {
    const checkout = await getDodoCheckout(order.provider_checkout_id, options);
    if (checkout.paymentStatus === "requires_payment_method") {
      const expired = await dodoCheckoutLinkExpired(order.provider_checkout_id, options);
      if (expired) {
        const released = await releasePlacementCheckout(supabase, order, "checkout_expired", now);
        return { status: released ? "expired" : order.status, checkoutUrl: null };
      }
      return {
        status: "checkout_incomplete",
        checkoutUrl: dodoCheckoutUrl(order.provider_checkout_id, options.environment),
      };
    }
    if (checkout.paymentStatus && checkout.paymentStatus !== "succeeded"
      && !DODO_PAYMENT_IN_PROGRESS.has(checkout.paymentStatus)) {
      const released = await releasePlacementCheckout(supabase, order, "checkout_expired", now);
      return { status: released ? "expired" : order.status, checkoutUrl: null };
    }
  } catch {
    // A provider read failure is not proof that payment cannot still arrive.
  }
  return { status: order.status, checkoutUrl: null };
}

export type PlacementCheckoutResult =
  | { state: "checkout"; checkoutUrl: string; publicId: string; expiresAt: string }
  | { state: "disabled" | "not_found" | "unavailable" | "provider_error" };

export async function startPlacementCheckout(
  supabase: Supabase,
  orderId: string,
  origin: string,
  now = new Date(),
): Promise<PlacementCheckoutResult> {
  const gate = placementCheckoutState();
  if (!gate.enabled) return { state: "disabled" };
  const { data: order, error } = await supabase.from("journey_sponsor_orders")
    .select("id,public_id,journey_id,slot_id,tier,status")
    .eq("id", orderId).maybeSingle();
  if (error || !order) return { state: error ? "provider_error" : "not_found" };
  if (order.status !== "reserved") return { state: "unavailable" };
  const tier = order.tier as SponsorPlacementTier;
  const productId = placementProviderProductId(tier, gate.provider);
  if (!productId) return { state: "disabled" };
  const expiresAt = new Date(now.getTime() + PLACEMENT_CHECKOUT_LIFETIME_MINUTES * 60_000).toISOString();
  const returnUrl = `${origin}/sponsor/return`;
  try {
    let checkoutId: string;
    let checkoutUrl: string;
    if (gate.provider === "fixture") {
      checkoutId = `fixture_${randomUUID()}`;
      const token = createFixtureToken({
        sponsorshipId: String(order.id), kind: "placement", checkoutId, expiresAt, returnUrl,
      });
      checkoutUrl = `${origin}/sponsor/fixture?token=${encodeURIComponent(token)}`;
    } else {
      const options = dodoOptions();
      if (!options) throw new Error("DODO_NOT_CONFIGURED");
      const session = await createDodoCheckout(dodoPlacementCheckoutBody({
        productId,
        amountCents: placementPriceCents(tier),
        returnUrl,
        orderId: String(order.id),
        journeyId: String(order.journey_id),
        slotId: String(order.slot_id),
        tier,
      }), options);
      checkoutId = session.sessionId;
      checkoutUrl = session.checkoutUrl;
    }
    const attached = await supabase.rpc("attach_journey_sponsor_checkout", {
      p_order_id: order.id, p_checkout_id: checkoutId, p_expires_at: expiresAt, p_now: now.toISOString(),
    });
    if (attached.error) throw attached.error;
    trackServerEvent("journey_sponsor_checkout_started", String(order.id), {
      provider: gate.provider, tier, test_mode: gate.testMode,
    });
    return { state: "checkout", checkoutUrl, publicId: String(order.public_id), expiresAt };
  } catch {
    await supabase.rpc("release_journey_sponsor_reservation", {
      p_order_id: order.id, p_provider_terminal: true, p_reason: "checkout_failed", p_now: new Date().toISOString(),
    });
    return { state: "provider_error" };
  }
}

export function placementModerationReason(input: { name: string; description: string; productUrl: string }): string | null {
  const text = `${input.name} ${input.description} ${input.productUrl}`.toLocaleLowerCase("en");
  const flagged = ["casino", "gambling", "porn", "adult-only", "payday loan", "weapon", "tobacco", "vape"];
  return flagged.some((term) => text.includes(term)) ? "automated_policy_flag" : null;
}

async function ensurePublicLogo(supabase: Supabase, order: {
  id: string; journey_id: string; private_logo_path: string; public_logo_path: string | null;
}): Promise<string> {
  if (order.public_logo_path) return order.public_logo_path;
  const config = serverRuntimeConfig();
  const downloaded = await supabase.storage.from(config.sponsorPrivateBucket).download(order.private_logo_path);
  if (downloaded.error || !downloaded.data) throw downloaded.error ?? new Error("SPONSOR_LOGO_MISSING");
  const path = `placements/${order.journey_id}/${order.id}.webp`;
  const uploaded = await supabase.storage.from(config.sponsorPublicBucket)
    .upload(path, downloaded.data, { contentType: "image/webp", cacheControl: "31536000", upsert: true });
  if (uploaded.error) throw uploaded.error;
  return path;
}

export type PlacementPaymentOutcome = {
  outcome: "active" | "pending_review" | "refund_required" | "refund_requested" | "refunded" | "unmatched";
  duplicate: boolean;
  orderId: string | null;
  publicId?: string | null;
  reason: string | null;
};

export async function applyPlacementPayment(
  supabase: Supabase,
  provider: PlacementPaymentProvider,
  facts: PlacementPaymentFacts,
  testMode: boolean,
  now = new Date(),
): Promise<PlacementPaymentOutcome> {
  const { data: order } = facts.orderId
    ? await supabase.from("journey_sponsor_orders")
      .select("id,journey_id,slot_id,tier,product_name,description,product_url,private_logo_path,public_logo_path")
      .eq("id", facts.orderId).maybeSingle()
    : { data: null };
  const publicLogoPath = order ? await ensurePublicLogo(supabase, {
    id: String(order.id), journey_id: String(order.journey_id),
    private_logo_path: String(order.private_logo_path), public_logo_path: order.public_logo_path,
  }) : "unmatched.webp";
  const expectedProduct = order
    ? placementProviderProductId(order.tier as SponsorPlacementTier, provider)
    : "";
  const productMatches = facts.productMatches && Boolean(expectedProduct)
    && facts.journeyId === String(order?.journey_id ?? "")
    && facts.slotId === String(order?.slot_id ?? "")
    && facts.tier === order?.tier;
  const flagged = order ? placementModerationReason({
    name: String(order.product_name), description: String(order.description), productUrl: String(order.product_url),
  }) : null;
  const { data, error } = await supabase.rpc("confirm_journey_sponsor_payment", {
    p_provider: provider,
    p_payment_id: facts.paymentId,
    p_order_id: facts.orderId,
    p_checkout_id: facts.checkoutId,
    p_amount_cents: facts.amountCents,
    p_tax_cents: facts.taxCents,
    p_currency: facts.currency,
    p_test_mode: testMode,
    p_product_matches: productMatches,
    p_tax_inclusive: seasonPriceIncludesTax(),
    p_public_logo_path: publicLogoPath,
    p_customer_email: facts.customerEmail,
    p_flagged_reason: flagged,
    p_now: now.toISOString(),
  });
  if (error) throw error;
  const result = data as PlacementPaymentOutcome;
  if (!result.duplicate && result.outcome === "refund_required") {
    void writeOperationalLog("warning", "journey_sponsor_refund_required", { provider, reason: result.reason });
    await requestPlacementRefund(supabase, provider, facts.paymentId, result.reason ?? "refund_required", now);
  }
  return result;
}

export async function requestPlacementRefund(
  supabase: Supabase,
  provider: PlacementPaymentProvider,
  paymentId: string,
  reason: string,
  now = new Date(),
): Promise<boolean> {
  try {
    if (provider === "fixture") {
      const result = await supabase.rpc("record_journey_sponsor_refund", {
        p_provider: provider, p_payment_id: paymentId, p_now: now.toISOString(),
      });
      if (result.error) throw result.error;
      return true;
    }
    const options = dodoOptions();
    if (!options) throw new Error("DODO_NOT_CONFIGURED");
    await refundDodoPayment(paymentId, reason, options);
    const result = await supabase.rpc("mark_journey_sponsor_refund_requested", {
      p_provider: provider, p_payment_id: paymentId, p_now: now.toISOString(),
    });
    if (result.error) throw result.error;
    return true;
  } catch {
    void writeOperationalLog("error", "journey_sponsor_refund_request_failed", { provider, reason });
    return false;
  }
}

export async function handlePlacementDodoEvent(
  supabase: Supabase,
  event: DodoWebhook,
  now = new Date(),
): Promise<null | { status: "processed" | "ignored"; errorCode?: string; orderId?: string | null }> {
  const paymentId = webhookPaymentId(event);
  if (!paymentId) return null;
  if (event.type === "refund.succeeded") {
    const existing = await supabase.from("journey_sponsor_payments").select("order_id")
      .eq("provider", "dodo").eq("payment_id", paymentId).maybeSingle();
    if (!existing.data) return null;
    const result = await supabase.rpc("record_journey_sponsor_refund", {
      p_provider: "dodo", p_payment_id: paymentId, p_now: now.toISOString(),
    });
    if (result.error) throw result.error;
    return { status: "processed", orderId: String(existing.data.order_id) };
  }
  if (event.type.startsWith("dispute.")) {
    const existing = await supabase.from("journey_sponsor_payments").select("order_id")
      .eq("provider", "dodo").eq("payment_id", paymentId).maybeSingle();
    if (!existing.data) return null;
    if (event.type === "dispute.opened" || event.type === "dispute.lost") {
      const result = await supabase.rpc("record_journey_sponsor_chargeback", {
        p_provider: "dodo", p_payment_id: paymentId, p_now: now.toISOString(),
      });
      if (result.error) throw result.error;
    }
    return { status: "processed", orderId: String(existing.data.order_id) };
  }
  if (!["payment.succeeded", "payment.failed", "payment.cancelled"].includes(event.type)) return null;
  const options = dodoOptions();
  if (!options) throw new Error("DODO_NOT_CONFIGURED");
  const payment = await getDodoPayment(paymentId, options);
  if (!payment) return { status: "ignored", errorCode: "UNKNOWN_PAYMENT" };
  const first = placementPaymentFacts(payment, "");
  if (!first.orderId) return null;
  const { data: order, error } = await supabase.from("journey_sponsor_orders")
    .select("id,tier,status,provider_checkout_id").eq("id", first.orderId).maybeSingle();
  if (error) throw error;
  if (!order) return { status: "ignored", errorCode: "UNKNOWN_PLACEMENT_ORDER" };
  const facts = placementPaymentFacts(payment, placementProductId(order.tier as SponsorPlacementTier));
  if (event.type === "payment.succeeded") {
    if (!facts.succeeded) return { status: "ignored", errorCode: "PAYMENT_NOT_SUCCEEDED" };
    const result = await applyPlacementPayment(supabase, "dodo", facts, options.environment === "test_mode", now);
    return { status: "processed", orderId: result.orderId };
  }
  if (facts.checkoutId !== order.provider_checkout_id || !["reserved", "payment_pending"].includes(String(order.status))) {
    return { status: "ignored", errorCode: "CHECKOUT_NOT_HELD" };
  }
  const released = await supabase.rpc("release_journey_sponsor_reservation", {
    p_order_id: order.id, p_provider_terminal: true,
    p_reason: event.type === "payment.failed" ? "payment_failed" : "cancelled", p_now: now.toISOString(),
  });
  if (released.error) throw released.error;
  return { status: "processed", orderId: String(order.id) };
}

export async function reconcilePlacementHolds(supabase: Supabase, now = new Date()) {
  const { data, error } = await supabase.from("journey_sponsor_orders")
    .select("id,tier,status,provider,provider_checkout_id,reservation_expires_at,private_logo_path")
    .in("status", ["reserved", "payment_pending"]).limit(50);
  if (error) throw error;
  const summary = { released: 0, confirmed: 0, waiting: 0 };
  for (const order of data ?? []) {
    const holdExpired = new Date(String(order.reservation_expires_at)).getTime() <= now.getTime();
    if (!holdExpired && !(order.status === "payment_pending" && order.provider === "dodo")) continue;
    if (order.provider === "dodo" && order.provider_checkout_id) {
      const options = dodoOptions();
      if (!options) { summary.waiting += 1; continue; }
      try {
        const checkout = await getDodoCheckout(String(order.provider_checkout_id), options);
        if (checkout.paymentStatus === "succeeded" && checkout.paymentId) {
          const payment = await getDodoPayment(checkout.paymentId, options);
          if (payment) {
            await applyPlacementPayment(supabase, "dodo", placementPaymentFacts(payment,
              placementProductId(order.tier as SponsorPlacementTier)), options.environment === "test_mode", now);
            summary.confirmed += 1;
            continue;
          }
        }
        if (checkout.paymentStatus === "requires_payment_method") {
          const linkExpired = await dodoCheckoutLinkExpired(String(order.provider_checkout_id), options);
          if (!linkExpired) {
            summary.waiting += 1;
            continue;
          }
        } else if (checkout.paymentStatus && DODO_PAYMENT_IN_PROGRESS.has(checkout.paymentStatus)) {
          summary.waiting += 1;
          continue;
        }
      } catch { summary.waiting += 1; continue; }
    }
    if (await releasePlacementCheckout(supabase, {
      id: String(order.id), private_logo_path: order.private_logo_path,
    }, "checkout_expired", now)) summary.released += 1;
  }
  return summary;
}

export async function reconcilePlacementRefunds(supabase: Supabase, now = new Date()) {
  const { data, error } = await supabase.from("journey_sponsor_payments")
    .select("provider,payment_id").eq("outcome", "refund_required").limit(50);
  if (error) throw error;
  let requested = 0;
  for (const payment of data ?? []) {
    if (await requestPlacementRefund(supabase, payment.provider as PlacementPaymentProvider,
      String(payment.payment_id), "refund_required", now)) requested += 1;
  }
  return { requested };
}
