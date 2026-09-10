import { expect, it, vi } from "vitest";
import { refundSponsorOrder } from "./refund";

it("uses the fixture refund without a network request", async () => {
  const fetchImpl = vi.fn<typeof fetch>();
  await expect(refundSponsorOrder(null, { provider: "fixture", fetchImpl })).resolves.toBe("fixture");
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("requests a full Lemon Squeezy order refund", async () => {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
  await expect(refundSponsorOrder("order/12", { provider: "lemonsqueezy", apiKey: "secret", fetchImpl })).resolves.toBe("lemonsqueezy");
  expect(fetchImpl).toHaveBeenCalledWith(
    "https://api.lemonsqueezy.com/v1/orders/order%2F12/refund",
    expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer secret" }) }),
  );
});
