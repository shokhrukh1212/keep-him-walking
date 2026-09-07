import "server-only";

type CheckoutInput = {
  sponsorshipId: string;
  slotId: string;
  email: string;
  priceCents: number;
  expiresAt: string;
  returnUrl: string;
};

export async function createLemonCheckout(input: CheckoutInput): Promise<{ id: string; url: string }> {
  const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
  const storeId = process.env.LEMON_SQUEEZY_STORE_ID;
  const variantId = process.env.LEMON_SQUEEZY_VARIANT_ID;
  if (!apiKey || !storeId || !variantId) throw new Error("LEMON_NOT_CONFIGURED");
  const testMode = process.env.LEMON_SQUEEZY_TEST_MODE !== "false";
  const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          custom_price: input.priceCents,
          expires_at: input.expiresAt,
          test_mode: testMode,
          product_options: { redirect_url: input.returnUrl },
          checkout_data: {
            email: input.email,
            custom: { sponsorship_id: input.sponsorshipId, slot_id: input.slotId },
          },
        },
        relationships: {
          store: { data: { type: "stores", id: storeId } },
          variant: { data: { type: "variants", id: variantId } },
        },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`LEMON_CHECKOUT_${response.status}`);
  const payload = await response.json() as { data?: { id?: string; attributes?: { url?: string } } };
  if (!payload.data?.id || !payload.data.attributes?.url) throw new Error("LEMON_INVALID_RESPONSE");
  return { id: payload.data.id, url: payload.data.attributes.url };
}
