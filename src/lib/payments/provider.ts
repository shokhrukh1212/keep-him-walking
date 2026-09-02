import "server-only";

import { createLemonCheckout } from "@/lib/payments/checkout";
import { createFixtureToken } from "@/lib/payments/fixture";
import { serverRuntimeConfig } from "@/lib/config/server";

export type SponsorCheckoutInput = {
  sponsorshipId: string;
  slotId: string;
  email: string;
  priceCents: number;
  expiresAt: string;
  returnUrl: string;
  origin: string;
};

export type SponsorCheckoutSession = {
  provider: "lemonsqueezy" | "fixture";
  providerCheckoutId: string | null;
  url: string;
};

export async function createSponsorCheckout(input: SponsorCheckoutInput): Promise<SponsorCheckoutSession> {
  if (serverRuntimeConfig().sponsorPaymentProvider === "fixture") {
    const token = createFixtureToken({
      sponsorshipId: input.sponsorshipId,
      expiresAt: input.expiresAt,
      returnUrl: input.returnUrl,
    });
    return {
      provider: "fixture",
      providerCheckoutId: null,
      url: `${input.origin}/sponsor/fixture?token=${encodeURIComponent(token)}`,
    };
  }
  const checkout = await createLemonCheckout(input);
  return { provider: "lemonsqueezy", providerCheckoutId: checkout.id, url: checkout.url };
}
