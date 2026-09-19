import { describe, expect, it } from "vitest";
import { SPONSOR_PLACES_PER_SIDE, carouselPlaces, placeName, placeTileLabel, placesOnSide, type SponsorPlace } from "./places";

const place = (position: number, occupied = false, tier: "regular" | "featured" = "regular"): SponsorPlace => ({
  slotId: `00000000-0000-4000-8000-${String(position).padStart(12, "0")}`,
  tier, position, priceCents: tier === "featured" ? 10_000 : 5_000, currency: "USD",
  state: occupied ? "occupied" : "available",
  placement: occupied ? { publicId: "10000000-0000-4000-8000-000000000001", name: "A product",
    description: "A useful product.", websiteUrl: "https://example.com/", logoUrl: "https://example.com/logo.webp",
    logoFit: "contain", views: 0 } : null,
});

describe("sponsor placement layout", () => {
  const regular = Array.from({ length: 10 }, (_, index) => place(index + 1, index === 6));

  it("splits ten persisted positions into aligned five-place rails", () => {
    expect(SPONSOR_PLACES_PER_SIDE).toBe(5);
    expect(placesOnSide(regular, "left").map((item) => item.position)).toEqual([1, 2, 3, 4, 5]);
    expect(placesOnSide(regular, "right").map((item) => item.position)).toEqual([6, 7, 8, 9, 10]);
  });

  it("keeps all regular positions in order in the mobile carousel and omits featured", () => {
    expect(carouselPlaces([...regular, place(1, false, "featured")]).map((item) => item.position))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("builds truthful labels from persisted placement state", () => {
    expect(placeName(regular[0]!)).toBe("Sponsor spot 1");
    expect(placeTileLabel(regular[0]!)).toContain("available for $50");
    expect(placeTileLabel(regular[6]!)).toContain("A product");
    expect(placeName(place(1, false, "featured"))).toBe("Featured Sponsor");
  });
});
