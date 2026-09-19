"use client";

import { placeTileLabel, type SponsorPlace } from "@/lib/sponsors/places";
import { SponsorPlusMark } from "./SponsorPlaceMark";

type Props = { place: SponsorPlace; showName?: boolean; duplicate?: boolean; onOpen: (place: SponsorPlace) => void };

export function SponsorPlaceTile({ place, showName = false, duplicate = false, onOpen }: Props) {
  const occupied = place.state === "occupied" ? place.placement : null;
  const available = place.state === "available";
  return (
    <button type="button" className="sponsor-place" data-state={occupied ? "taken" : available ? "free" : "held"}
      data-place={place.slotId} aria-haspopup={available || occupied ? "dialog" : undefined}
      aria-label={duplicate ? undefined : placeTileLabel(place)} aria-hidden={duplicate || undefined}
      tabIndex={duplicate ? -1 : undefined} disabled={!occupied && !available}
      title={occupied ? occupied.name : available ? `Sponsor spot ${place.position} · $50` : "Checkout in progress"}
      onClick={() => onOpen(place)}>
      <span className="sponsor-place-mark">
        {occupied ? /* eslint-disable-next-line @next/next/no-img-element */
          <img src={occupied.logoUrl} alt="" className="sponsor-place-logo" data-fit={occupied.logoFit} />
          : <><SponsorPlusMark /><i className="sponsor-invite-dots" aria-hidden="true"><b /><b /><b /></i></>}
      </span>
      {showName ? <span className="sponsor-place-name">{occupied ? occupied.name : available ? "Your product · $50" : "Checkout in progress"}</span> : null}
    </button>
  );
}
