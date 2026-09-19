"use client";

import { placeName, placeTileLabel, type SponsorPlace } from "@/lib/sponsors/places";
import { SponsorPlaceMark, SponsorPlusMark } from "./SponsorPlaceMark";

type Props = {
  place: SponsorPlace;
  /** The phone row names the product under its mark; the side rails have no room. */
  showName?: boolean;
  onOpen: (place: SponsorPlace) => void;
};

/**
 * One place, taken or free. Both open the same modal, because a visitor who taps a
 * product wants to know what it is and a visitor who taps a gap wants to know what
 * it costs, and neither of those belongs on top of the walk.
 */
export function SponsorPlaceTile({ place, showName = false, onOpen }: Props) {
  return (
    <button
      type="button"
      className="sponsor-place"
      data-state={place.brand ? "taken" : "free"}
      data-place={place.id}
      aria-haspopup="dialog"
      aria-label={placeTileLabel(place)}
      title={place.brand ? place.brand.name : `${placeName(place)} — free`}
      onClick={() => onOpen(place)}
    >
      <span className="sponsor-place-mark">
        {place.brand ? <SponsorPlaceMark mark={place.brand.mark} /> : <SponsorPlusMark />}
      </span>
      {showName ? (
        <span className="sponsor-place-name">{place.brand ? place.brand.name : "Your product"}</span>
      ) : null}
    </button>
  );
}
