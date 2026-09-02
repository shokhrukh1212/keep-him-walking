import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canTransitionSponsorship, nextPaymentState } from "./state-machine";
import { parseLemonWebhook, validateLemonOrder, verifyLemonSignature, webhookChecksum } from "./webhook";

describe("sponsorship payment invariants", () => {
  it("requires review between payment and scheduling", () => {
    expect(nextPaymentState("checkout_pending", "order_created")).toBe("paid_pending_review");
    expect(canTransitionSponsorship("paid_pending_review", "scheduled")).toBe(false);
    expect(canTransitionSponsorship("paid_pending_review", "approved")).toBe(true);
  });

  it("allows a verified refund to remove any non-refunded sponsor", () => {
    expect(nextPaymentState("live", "order_refunded")).toBe("refunded");
    expect(nextPaymentState("completed", "order_refunded")).toBe("refunded");
  });

  it("keeps duplicate success idempotent and rejects an illegal late success", () => {
    expect(nextPaymentState("paid_pending_review", "order_created")).toBe("paid_pending_review");
    expect(() => nextPaymentState("live", "order_created")).toThrow(/Illegal sponsor transition/);
  });

  it("verifies raw-body HMAC without parsing first", () => {
    const body = '{"data":{"id":"1"}}';
    const signature = createHmac("sha256", "secret").update(body).digest("hex");
    expect(verifyLemonSignature(body, signature, "secret")).toBe(true);
    expect(verifyLemonSignature(`${body} `, signature, "secret")).toBe(false);
    expect(verifyLemonSignature(body, null, "secret")).toBe(false);
    expect(webhookChecksum(body)).toHaveLength(64);
  });

  it("parses only supported, correlated Lemon events", () => {
    const event = parseLemonWebhook({
      meta: { event_name: "order_created", test_mode: true, custom_data: { sponsorship_id: "00000000-0000-4000-8000-000000000001", slot_id: "00000000-0000-4000-8000-000000000002" } },
      data: { id: "42", type: "orders", attributes: { status: "paid", total: 100, currency: "USD" } },
    });
    expect(event.data.id).toBe("42");
    expect(validateLemonOrder(event, {
      sponsorshipId: "00000000-0000-4000-8000-000000000001",
      slotId: "00000000-0000-4000-8000-000000000002",
      priceCents: 100,
      currency: "USD",
      testMode: true,
    })).toBe(true);
    expect(validateLemonOrder(event, {
      sponsorshipId: "00000000-0000-4000-8000-000000000001",
      slotId: "00000000-0000-4000-8000-000000000099",
      priceCents: 100,
      currency: "USD",
      testMode: true,
    })).toBe(false);
    expect(() => parseLemonWebhook({ meta: { event_name: "license_key_created" } })).toThrow();
  });
});
