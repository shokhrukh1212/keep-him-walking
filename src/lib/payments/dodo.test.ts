import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  dodoPlacementCheckoutBody,
  createDodoCheckout,
  dodoCheckoutBody,
  dodoEnvironment,
  getDodoCheckout,
  getDodoPayment,
  parseDodoWebhook,
  refundDodoPayment,
  seasonPaymentFacts,
  verifyStandardWebhook,
  webhookPaymentId,
} from "./dodo";

const rawKey = Buffer.from("a-thirty-two-byte-long-test-key!");
const secret = `whsec_${rawKey.toString("base64")}`;
const now = Date.parse("2026-09-14T10:00:00Z");
const timestamp = String(Math.floor(now / 1_000));
const body = JSON.stringify({ type: "payment.succeeded", data: { payment_id: "pay_123" } });

function sign(id: string, time: string, payload: string, key = rawKey) {
  return `v1,${createHmac("sha256", key).update(`${id}.${time}.${payload}`).digest("base64")}`;
}

describe("Standard Webhooks verification", () => {
  it("accepts a correctly signed, fresh event", () => {
    expect(verifyStandardWebhook({ id: "msg_1", timestamp, signature: sign("msg_1", timestamp, body), body, secret, nowMs: now })).toBe(true);
  });

  it("accepts any one valid signature among several during key rotation", () => {
    const signature = `v1,bm90LXRoaXMtb25l ${sign("msg_1", timestamp, body)}`;
    expect(verifyStandardWebhook({ id: "msg_1", timestamp, signature, body, secret, nowMs: now })).toBe(true);
  });

  it("refuses a changed body, id, key, version or a replayed timestamp", () => {
    const signature = sign("msg_1", timestamp, body);
    expect(verifyStandardWebhook({ id: "msg_1", timestamp, signature, body: `${body} `, secret, nowMs: now })).toBe(false);
    expect(verifyStandardWebhook({ id: "msg_2", timestamp, signature, body, secret, nowMs: now })).toBe(false);
    expect(verifyStandardWebhook({ id: "msg_1", timestamp, signature: sign("msg_1", timestamp, body, Buffer.from("another-key-entirely-32-bytes!!!")), body, secret, nowMs: now })).toBe(false);
    expect(verifyStandardWebhook({ id: "msg_1", timestamp, signature: signature.replace("v1,", "v2,"), body, secret, nowMs: now })).toBe(false);
    expect(verifyStandardWebhook({ id: "msg_1", timestamp, signature, body, secret, nowMs: now + 301_000 })).toBe(false);
    expect(verifyStandardWebhook({ id: "msg_1", timestamp: "soon", signature, body, secret, nowMs: now })).toBe(false);
    expect(verifyStandardWebhook({ id: null, timestamp, signature, body, secret, nowMs: now })).toBe(false);
    expect(verifyStandardWebhook({ id: "msg_1", timestamp, signature, body, secret: "", nowMs: now })).toBe(false);
  });
});

describe("Dodo payloads", () => {
  it("sets the server-owned placement price on the approved dynamic-price product", () => {
    expect(dodoPlacementCheckoutBody({
      productId: "pdt_approved", amountCents: 10_000, returnUrl: "https://keephimwalking.com/sponsor/return",
      orderId: "order", journeyId: "journey", slotId: "slot", tier: "featured",
    })).toMatchObject({
      product_cart: [{ product_id: "pdt_approved", quantity: 1, amount: 10_000 }],
      metadata: { kind: "journey_placement", tier: "featured" },
    });
  });

  it("reads the event type and the payment it concerns", () => {
    const event = parseDodoWebhook(body);
    expect(event.type).toBe("payment.succeeded");
    expect(webhookPaymentId(event)).toBe("pay_123");
    expect(webhookPaymentId(parseDodoWebhook(JSON.stringify({ type: "refund.succeeded", data: { payment_id: "../x" } })))).toBeNull();
    expect(() => parseDodoWebhook("{}")).toThrow();
  });

  it("derives the facts the database re-checks from the provider's own payment record", () => {
    const bookingId = "6f1c5b8e-2a4d-4e7b-9c1a-3d2e1f0a9b8c";
    const facts = seasonPaymentFacts({
      payment_id: "pay_123",
      status: "succeeded",
      total_amount: 54_390,
      tax: 4_490,
      currency: "usd",
      checkout_session_id: "cks_1",
      metadata: { season_sponsorship_id: bookingId.toUpperCase() },
      product_cart: [{ product_id: "pdt_season", quantity: 1 }],
    }, "pdt_season");
    expect(facts).toEqual({
      paymentId: "pay_123",
      bookingId,
      checkoutId: "cks_1",
      amountCents: 54_390,
      taxCents: 4_490,
      currency: "USD",
      succeeded: true,
      productMatches: true,
    });
  });

  it("marks a different product, quantity or status and ignores forged metadata", () => {
    const base = { payment_id: "pay_1", status: "processing", total_amount: 49_900, currency: "USD" };
    expect(seasonPaymentFacts({ ...base, product_cart: [{ product_id: "pdt_other", quantity: 1 }] }, "pdt_season").productMatches).toBe(false);
    expect(seasonPaymentFacts({ ...base, product_cart: [{ product_id: "pdt_season", quantity: 2 }] }, "pdt_season").productMatches).toBe(false);
    expect(seasonPaymentFacts({ ...base, metadata: { season_sponsorship_id: "drop table" } }, "pdt_season").bookingId).toBeNull();
    expect(seasonPaymentFacts(base, "pdt_season").succeeded).toBe(false);
  });
});

describe("Dodo API calls", () => {
  const options = (fetchImpl: typeof fetch) => ({ apiKey: "sk_test", environment: "test_mode" as const, fetchImpl });

  it("selects test mode unless live mode is explicit", () => {
    expect(dodoEnvironment({})).toBe("test_mode");
    expect(dodoEnvironment({ DODO_PAYMENTS_ENVIRONMENT: "live_mode" })).toBe("live_mode");
  });

  it("creates a one-product checkout whose metadata names the booking", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ session_id: "cks_1", checkout_url: "https://test.checkout.dodopayments.com/session/cks_1" }));
    const request = dodoCheckoutBody({
      productId: "pdt_season", amountCents: 5_000, customerEmail: "a@b.co", customerName: "Casey", returnUrl: "https://keephimwalking.com/sponsors/request/x",
      bookingId: "b-1", journeyId: "j-1", seasonNumber: 2,
    });
    await expect(createDodoCheckout(request, options(fetchImpl as unknown as typeof fetch))).resolves.toEqual({
      sessionId: "cks_1", checkoutUrl: "https://test.checkout.dodopayments.com/session/cks_1",
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://test.dodopayments.com/checkouts");
    expect(init.headers).toMatchObject({ Authorization: "Bearer sk_test" });
    expect(JSON.parse(String(init.body))).toMatchObject({
      product_cart: [{ product_id: "pdt_season", quantity: 1, amount: 5_000 }],
      metadata: { kind: "season_sponsorship", season_sponsorship_id: "b-1", season_number: 2 },
    });
  });

  it("fails closed on provider errors and odd responses", async () => {
    const request = dodoCheckoutBody({ productId: "p", amountCents: 5_000, customerEmail: "a@b.co", customerName: "C", returnUrl: "https://x.y/", bookingId: "b", journeyId: "j", seasonNumber: 1 });
    await expect(createDodoCheckout(request, options((async () => new Response("", { status: 422 })) as unknown as typeof fetch))).rejects.toThrow("DODO_CHECKOUT_422");
    await expect(createDodoCheckout(request, options((async () => Response.json({ session_id: "cks", checkout_url: "http://plain" })) as unknown as typeof fetch))).rejects.toThrow("INVALID_RESPONSE");
  });

  it("reads payments and checkouts, and requests refunds", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/payments/pay_missing")) return new Response("", { status: 404 });
      if (url.includes("/payments/")) return Response.json({ payment_id: "pay_1" });
      if (url.includes("/checkouts/")) return Response.json({ payment_id: "pay_1", payment_status: "processing" });
      return Response.json({ refund_id: "ref_1", status: "pending" });
    }) as unknown as typeof fetch;
    await expect(getDodoPayment("pay_missing", options(fetchImpl))).resolves.toBeNull();
    await expect(getDodoPayment("pay_1", options(fetchImpl))).resolves.toEqual({ payment_id: "pay_1" });
    await expect(getDodoCheckout("cks_1", options(fetchImpl))).resolves.toEqual({ paymentId: "pay_1", paymentStatus: "processing" });
    await expect(refundDodoPayment("pay_1", "season_unavailable", options(fetchImpl))).resolves.toEqual({ refundId: "ref_1", status: "pending" });
  });
});
