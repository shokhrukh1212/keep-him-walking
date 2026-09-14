import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * The small Dodo Payments adapter for the season offer: one-time checkout
 * sessions, the payment read-back, refunds and Standard Webhooks verification.
 * Plain HTTPS, no SDK. Checked against docs.dodopayments.com on 14 September 2026.
 */
export const DODO_API_BASE = {
  test_mode: "https://test.dodopayments.com",
  live_mode: "https://live.dodopayments.com",
} as const;

export type DodoEnvironment = keyof typeof DODO_API_BASE;

export function dodoEnvironment(environment: Record<string, string | undefined> = process.env): DodoEnvironment {
  return environment.DODO_PAYMENTS_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode";
}

/** Replay window for a signed event. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Standard Webhooks: HMAC-SHA256 over `${webhook-id}.${webhook-timestamp}.${body}`,
 * keyed by the base64 secret after its optional `whsec_` prefix, compared in
 * constant time against every space-separated `v1,<base64>` signature.
 */
export function verifyStandardWebhook(input: {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  secret: string;
  nowMs: number;
}): boolean {
  if (!input.id || !input.timestamp || !input.signature || !input.secret) return false;
  if (!/^\d{1,12}$/.test(input.timestamp)) return false;
  if (Math.abs(input.nowMs - Number(input.timestamp) * 1_000) > WEBHOOK_TOLERANCE_SECONDS * 1_000) return false;
  const key = Buffer.from(input.secret.replace(/^whsec_/, ""), "base64");
  if (key.length === 0) return false;
  const expected = Buffer.from(
    createHmac("sha256", key).update(`${input.id}.${input.timestamp}.${input.body}`).digest("base64"),
  );
  return input.signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",", 2);
    if (version !== "v1" || !value) return false;
    const received = Buffer.from(value);
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

const webhookSchema = z.object({
  type: z.string().min(1).max(80),
  data: z.record(z.string(), z.unknown()),
});

export type DodoWebhook = z.infer<typeof webhookSchema>;

export function parseDodoWebhook(rawBody: string): DodoWebhook {
  return webhookSchema.parse(JSON.parse(rawBody));
}

/** The payment an event is about. Refund and dispute events carry it too. */
export function webhookPaymentId(event: DodoWebhook): string | null {
  const value = event.data.payment_id;
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(value) ? value : null;
}

const paymentSchema = z.object({
  payment_id: z.string().min(1).max(120),
  status: z.string().nullable().optional(),
  total_amount: z.number().int().nonnegative(),
  tax: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().min(3).max(3),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  checkout_session_id: z.string().nullable().optional(),
  product_cart: z.array(z.object({
    product_id: z.string(),
    quantity: z.number().int(),
  }).passthrough()).nullable().optional(),
}).passthrough();

export type DodoPayment = z.infer<typeof paymentSchema>;

export type SeasonPaymentFacts = {
  paymentId: string;
  bookingId: string | null;
  checkoutId: string | null;
  amountCents: number;
  taxCents: number | null;
  currency: string;
  succeeded: boolean;
  productMatches: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the database needs to judge a payment, read from the provider's own record. */
export function seasonPaymentFacts(payment: unknown, productId: string): SeasonPaymentFacts {
  const parsed = paymentSchema.parse(payment);
  const booking = parsed.metadata?.season_sponsorship_id;
  const cart = parsed.product_cart ?? [];
  return {
    paymentId: parsed.payment_id,
    bookingId: typeof booking === "string" && UUID.test(booking) ? booking.toLowerCase() : null,
    checkoutId: parsed.checkout_session_id ?? null,
    amountCents: parsed.total_amount,
    taxCents: parsed.tax ?? null,
    currency: parsed.currency.toUpperCase(),
    succeeded: parsed.status === "succeeded",
    productMatches: cart.length === 1 && cart[0]?.product_id === productId && cart[0]?.quantity === 1,
  };
}

export function dodoCheckoutBody(input: {
  productId: string;
  customerEmail: string;
  customerName: string;
  returnUrl: string;
  bookingId: string;
  journeyId: string;
  seasonNumber: number;
}) {
  return {
    product_cart: [{ product_id: input.productId, quantity: 1 }],
    customer: { email: input.customerEmail, name: input.customerName },
    return_url: input.returnUrl,
    metadata: {
      kind: "season_sponsorship",
      season_sponsorship_id: input.bookingId,
      journey_id: input.journeyId,
      season_number: input.seasonNumber,
    },
  };
}

type DodoOptions = {
  apiKey: string;
  environment: DodoEnvironment;
  fetchImpl?: typeof fetch;
};

async function dodoRequest(path: string, options: DodoOptions, init: { method: "GET" | "POST"; body?: unknown }) {
  return (options.fetchImpl ?? fetch)(`${DODO_API_BASE[options.environment]}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      Accept: "application/json",
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(10_000),
  });
}

export async function createDodoCheckout(
  body: ReturnType<typeof dodoCheckoutBody>,
  options: DodoOptions,
): Promise<{ sessionId: string; checkoutUrl: string }> {
  const response = await dodoRequest("/checkouts", options, { method: "POST", body });
  if (!response.ok) throw new Error(`DODO_CHECKOUT_${response.status}`);
  const payload = await response.json() as { session_id?: unknown; checkout_url?: unknown };
  if (typeof payload.session_id !== "string" || typeof payload.checkout_url !== "string"
    || !payload.checkout_url.startsWith("https://")) {
    throw new Error("DODO_CHECKOUT_INVALID_RESPONSE");
  }
  return { sessionId: payload.session_id, checkoutUrl: payload.checkout_url };
}

/** The provider's own record of a payment, or null when it does not exist in this mode. */
export async function getDodoPayment(paymentId: string, options: DodoOptions): Promise<unknown | null> {
  const response = await dodoRequest(`/payments/${encodeURIComponent(paymentId)}`, options, { method: "GET" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`DODO_PAYMENT_${response.status}`);
  return response.json();
}

export async function getDodoCheckout(
  sessionId: string,
  options: DodoOptions,
): Promise<{ paymentId: string | null; paymentStatus: string | null }> {
  const response = await dodoRequest(`/checkouts/${encodeURIComponent(sessionId)}`, options, { method: "GET" });
  if (!response.ok) throw new Error(`DODO_CHECKOUT_READ_${response.status}`);
  const payload = await response.json() as { payment_id?: unknown; payment_status?: unknown };
  return {
    paymentId: typeof payload.payment_id === "string" ? payload.payment_id : null,
    paymentStatus: typeof payload.payment_status === "string" ? payload.payment_status : null,
  };
}

export async function refundDodoPayment(
  paymentId: string,
  reason: string,
  options: DodoOptions,
): Promise<{ refundId: string; status: string }> {
  const response = await dodoRequest("/refunds", options, {
    method: "POST",
    body: { payment_id: paymentId, reason: reason.slice(0, 300) },
  });
  if (!response.ok) throw new Error(`DODO_REFUND_${response.status}`);
  const payload = await response.json() as { refund_id?: unknown; status?: unknown };
  if (typeof payload.refund_id !== "string" || typeof payload.status !== "string") {
    throw new Error("DODO_REFUND_INVALID_RESPONSE");
  }
  return { refundId: payload.refund_id, status: payload.status };
}

/** Provider states in which money may still arrive, so a hold must not be released yet. */
export const DODO_PAYMENT_IN_PROGRESS = new Set([
  "processing",
  "requires_customer_action",
  "requires_merchant_action",
  "requires_payment_method",
  "requires_confirmation",
  "requires_capture",
  "partially_captured",
  "partially_captured_and_capturable",
]);
