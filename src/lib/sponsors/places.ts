import type { SponsorPlacementView } from "@/lib/contracts";

export const SPONSOR_PLACES_PER_SIDE = 5;
export type SponsorPlaceSide = "left" | "right";
export type SponsorPlace = SponsorPlacementView;

export function placesOnSide(places: readonly SponsorPlace[], side: SponsorPlaceSide): readonly SponsorPlace[] {
  return places.filter((place) => place.tier === "regular"
    && (side === "left" ? place.position <= SPONSOR_PLACES_PER_SIDE : place.position > SPONSOR_PLACES_PER_SIDE));
}

export function placeNumber(place: SponsorPlace): number { return place.position; }

export function placeName(place: SponsorPlace): string {
  return place.tier === "featured" ? "Featured Sponsor" : `Sponsor spot ${placeNumber(place)}`;
}

export function placeTileLabel(place: SponsorPlace): string {
  if (place.placement) return `${place.placement.name} — open sponsored product profile`;
  if (place.state === "available") return `${placeName(place)} is available for $${place.priceCents / 100}`;
  return `${placeName(place)} is currently unavailable`;
}

export function carouselPlaces(places: readonly SponsorPlace[]): readonly SponsorPlace[] {
  return places.filter((place) => place.tier === "regular").sort((a, b) => a.position - b.position);
}
