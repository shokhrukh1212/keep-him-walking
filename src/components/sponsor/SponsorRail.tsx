"use client";

import { placesOnSide, type SponsorPlace, type SponsorPlaceSide } from "@/lib/sponsors/places";
import { SponsorPlaceTile } from "./SponsorPlaceTile";

type Props = {
  places: readonly SponsorPlace[];
  side: SponsorPlaceSide;
  onOpen: (place: SponsorPlace) => void;
};

/**
 * A desktop-only column of places down one edge of the scene. It is hidden on a
 * narrow screen, where the same places ride in one row above the footer instead.
 * The rail takes no pointer events of its own, so the scene behind the gaps
 * between the tiles is still the scene.
 */
export function SponsorRail({ places, side, onOpen }: Props) {
  const column = placesOnSide(places, side);
  if (column.length === 0) return null;
  return (
    <aside
      className="sponsor-rail"
      data-side={side}
      aria-label={side === "left" ? "Sponsor places, left" : "Sponsor places, right"}
    >
      {column.map((place) => <SponsorPlaceTile key={place.id} place={place} onOpen={onOpen} />)}
    </aside>
  );
}
