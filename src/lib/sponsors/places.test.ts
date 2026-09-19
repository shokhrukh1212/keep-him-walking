import { describe, expect, it } from "vitest";
import {
  SPONSOR_PLACES,
  SPONSOR_PLACES_PER_SIDE,
  SPONSOR_PLACE_PRICE_CENTS,
  carouselPlaces,
  placeName,
  placeNumber,
  placeTileLabel,
  placesOnSide,
  type SponsorPlace,
} from "./places";

const free = (side: "left" | "right", position: number): SponsorPlace =>
  ({ id: `${side}-${position}`, side, position, brand: null });

const sold = (side: "left" | "right", position: number, name: string): SponsorPlace => ({
  id: `${side}-${position}`,
  side,
  position,
  brand: { name, description: `${name} does a thing.`, href: "https://example.com", mark: "vercel", views: 1, clicks: 0 },
});

describe("SPONSOR_PLACES", () => {
  it("holds ten places, five down each side, at one price", () => {
    expect(SPONSOR_PLACES).toHaveLength(SPONSOR_PLACES_PER_SIDE * 2);
    expect(placesOnSide(SPONSOR_PLACES, "left")).toHaveLength(SPONSOR_PLACES_PER_SIDE);
    expect(placesOnSide(SPONSOR_PLACES, "right")).toHaveLength(SPONSOR_PLACES_PER_SIDE);
    expect(SPONSOR_PLACE_PRICE_CENTS).toBe(5_000);
  });

  it("gives every place its own id and numbers them 1 to 10 without a gap", () => {
    expect(new Set(SPONSOR_PLACES.map((place) => place.id)).size).toBe(SPONSOR_PLACES.length);
    expect(SPONSOR_PLACES.map(placeNumber).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("keeps the left side free and the right side taken, and every taken place links over https", () => {
    expect(placesOnSide(SPONSOR_PLACES, "left").every((place) => place.brand === null)).toBe(true);
    for (const place of placesOnSide(SPONSOR_PLACES, "right")) {
      expect(place.brand).not.toBeNull();
      expect(place.brand?.href.startsWith("https://")).toBe(true);
    }
  });
});

describe("placesOnSide", () => {
  it("keeps the places of one side in their drawn order and drops the other side", () => {
    const places = [free("left", 2), sold("right", 1, "A"), free("left", 1)];
    expect(placesOnSide(places, "left").map((place) => place.id)).toEqual(["left-2", "left-1"]);
    expect(placesOnSide(places, "right").map((place) => place.id)).toEqual(["right-1"]);
  });
});

describe("placeNumber and placeName", () => {
  it("continues the right side after the left rather than starting again", () => {
    expect(placeNumber(free("left", 1))).toBe(1);
    expect(placeNumber(free("left", 5))).toBe(5);
    expect(placeNumber(free("right", 1))).toBe(6);
    expect(placeNumber(free("right", 5))).toBe(10);
    expect(placeName(free("right", 3))).toBe("Place 8");
  });
});

describe("placeTileLabel", () => {
  it("names the sponsor when there is one and the offer when there is not", () => {
    expect(placeTileLabel(sold("right", 2, "Vercel"))).toBe("Vercel — sponsor of place 7");
    expect(placeTileLabel(free("left", 4))).toBe("Place 4 is free — sponsor it");
  });
});

describe("carouselPlaces", () => {
  it("alternates a taken place and a free one so the phone row is not five plus signs", () => {
    const row = carouselPlaces(SPONSOR_PLACES);
    expect(row).toHaveLength(SPONSOR_PLACES.length);
    expect(row.map((place) => place.brand !== null))
      .toEqual([true, false, true, false, true, false, true, false, true, false]);
  });

  it("keeps the remainder in order when the two sides are uneven", () => {
    const row = carouselPlaces([sold("right", 1, "A"), free("left", 1), free("left", 2), free("left", 3)]);
    expect(row.map((place) => place.id)).toEqual(["right-1", "left-1", "left-2", "left-3"]);
  });

  it("returns nothing for no places", () => {
    expect(carouselPlaces([])).toEqual([]);
  });
});
