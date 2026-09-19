import { describe, expect, it } from "vitest";
import type { SponsorInventoryView } from "@/lib/contracts";
import { recordingSponsorInventory } from "./recording";

const inventory: SponsorInventoryView = {
  journeyId: "00000000-0000-4000-8000-000000000001",
  lifecycleState: "waiting",
  scheduledStartAt: null,
  startsAt: null,
  endsAt: null,
  durationDays: 14,
  regularFilled: 0,
  featuredFilled: false,
  checkoutEnabled: true,
  checkoutReason: null,
  slots: [
    ...Array.from({ length: 10 }, (_, index) => ({
      slotId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      tier: "regular" as const,
      position: index + 1,
      priceCents: 5_000 as const,
      currency: "USD" as const,
      state: "available" as const,
      placement: null,
    })),
    { slotId: "00000000-0000-4000-8000-000000000011", tier: "featured", position: 1,
      priceCents: 10_000, currency: "USD", state: "available", placement: null },
  ],
};

describe("recording sponsor inventory", () => {
  it("dresses every local slot without changing the source inventory", () => {
    const result = recordingSponsorInventory(inventory);
    expect(result.regularFilled).toBe(10);
    expect(result.featuredFilled).toBe(true);
    expect(result.slots.find((slot) => slot.tier === "featured")?.placement?.name).toBe("Postiz");
    expect(result.slots.filter((slot) => slot.tier === "regular").map((slot) => slot.placement?.name))
      .toEqual(["Google", "ChatGPT", "Claude", "Figma", "GitHub", "Notion", "Spotify", "Slack", "Canva", "Linear"]);
    expect(result.slots.every((slot) => slot.placement?.demo === true)).toBe(true);
    expect(inventory.slots.every((slot) => slot.placement === null)).toBe(true);
  });
});
