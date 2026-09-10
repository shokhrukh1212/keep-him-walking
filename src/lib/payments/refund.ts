export async function refundSponsorOrder(
  orderId: string | null,
  options: {
    provider: "fixture" | "lemonsqueezy";
    apiKey?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<"fixture" | "lemonsqueezy"> {
  if (options.provider === "fixture") return "fixture";
  const apiKey = options.apiKey;
  if (!apiKey || !orderId) throw new Error("Paid Lemon Squeezy order is required for a refund");
  const response = await (options.fetchImpl ?? fetch)(`https://api.lemonsqueezy.com/v1/orders/${encodeURIComponent(orderId)}/refund`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ data: { type: "orders", id: orderId, attributes: {} } }),
  });
  if (!response.ok) throw new Error(`Lemon Squeezy refund failed (${response.status})`);
  return "lemonsqueezy";
}
