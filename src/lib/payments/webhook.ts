import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export function webhookChecksum(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

export function verifyLemonSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(signature.toLowerCase(), "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

const lemonWebhookSchema = z.object({
  meta: z.object({
    event_name: z.enum(["order_created", "order_refunded"]),
    test_mode: z.boolean(),
    custom_data: z.object({
      sponsorship_id: z.string().uuid(),
      slot_id: z.string().uuid(),
    }).optional(),
  }),
  data: z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    attributes: z.object({
      status: z.string(),
      total: z.number().int().nonnegative(),
      currency: z.string().length(3),
    }).passthrough(),
  }),
});

export type LemonWebhook = z.infer<typeof lemonWebhookSchema>;

export type ExpectedLemonOrder = {
  sponsorshipId: string;
  slotId: string;
  priceCents: number;
  currency: string;
  testMode: boolean;
};

export function parseLemonWebhook(value: unknown): LemonWebhook {
  return lemonWebhookSchema.parse(value);
}

export function validateLemonOrder(event: LemonWebhook, expected: ExpectedLemonOrder): boolean {
  if (event.meta.event_name !== "order_created") return true;
  const custom = event.meta.custom_data;
  return event.data.attributes.status === "paid"
    && event.meta.test_mode === expected.testMode
    && event.data.attributes.total === expected.priceCents
    && event.data.attributes.currency.toUpperCase() === expected.currency.toUpperCase()
    && Boolean(custom)
    && custom?.sponsorship_id === expected.sponsorshipId
    && custom?.slot_id === expected.slotId;
}
