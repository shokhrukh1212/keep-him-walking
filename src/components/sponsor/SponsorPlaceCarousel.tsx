"use client";

import { useEffect, useMemo, useRef } from "react";
import { carouselPlaces, type SponsorPlace } from "@/lib/sponsors/places";
import { SponsorPlaceTile } from "./SponsorPlaceTile";

const SPEED_PX_PER_SECOND = 24;

type Props = { places: readonly SponsorPlace[]; reducedMotion: boolean; onOpen: (place: SponsorPlace) => void };

export function SponsorPlaceCarousel({ places, reducedMotion, onOpen }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const row = useMemo(() => carouselPlaces(places), [places]);
  useEffect(() => {
    if (reducedMotion || row.length < 2) return;
    const element = viewport.current;
    if (!element) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (document.visibilityState === "visible") {
        const half = element.scrollWidth / 2;
        element.scrollLeft += SPEED_PX_PER_SECOND * Math.min(50, now - last) / 1_000;
        if (half > 0 && element.scrollLeft >= half) element.scrollLeft -= half;
      }
      last = now;
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [reducedMotion, row.length]);
  if (row.length === 0) return null;
  return (
    <div className="sponsor-carousel-wrap">
      <div className="sponsor-carousel" ref={viewport} data-testid="sponsor-carousel" role="group" aria-label="Sponsor spots">
        <div className="sponsor-carousel-track">
          {row.map((place) => <SponsorPlaceTile key={place.slotId} place={place} showName onOpen={onOpen} />)}
          {!reducedMotion ? row.map((place) => <SponsorPlaceTile key={`copy-${place.slotId}`} place={place} showName duplicate onOpen={onOpen} />) : null}
        </div>
      </div>
    </div>
  );
}
