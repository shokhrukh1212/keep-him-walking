"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { carouselPlaces, type SponsorPlace } from "@/lib/sponsors/places";
import { SponsorPlaceTile } from "./SponsorPlaceTile";

const SPEED_PX_PER_SECOND = 24;
const RESUME_MS = 4_000;

type Props = { places: readonly SponsorPlace[]; reducedMotion: boolean; paused?: boolean; onOpen: (place: SponsorPlace) => void };

export function SponsorPlaceCarousel({ places, reducedMotion, paused = false, onOpen }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const resumeTimer = useRef<number | null>(null);
  const [manualPause, setManualPause] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const row = useMemo(() => carouselPlaces(places), [places]);
  const moving = !reducedMotion && !paused && !manualPause && !interacting;
  const hold = useCallback(() => {
    if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current);
    setInteracting(true);
  }, []);
  const release = useCallback(() => {
    if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setInteracting(false), RESUME_MS);
  }, []);
  useEffect(() => () => { if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current); }, []);
  useEffect(() => {
    if (!moving || row.length < 2) return;
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
  }, [moving, row.length]);
  if (row.length === 0) return null;
  return (
    <div className="sponsor-carousel-wrap">
      <div className="sponsor-carousel" ref={viewport} data-testid="sponsor-carousel" role="group" aria-label="Sponsor spots"
        onPointerDown={hold} onPointerUp={release} onPointerCancel={release}
        onMouseEnter={hold} onMouseLeave={release} onFocusCapture={hold} onBlurCapture={release}>
        <div className="sponsor-carousel-track">
          {row.map((place) => <SponsorPlaceTile key={place.slotId} place={place} showName onOpen={onOpen} />)}
          {!reducedMotion ? row.map((place) => <SponsorPlaceTile key={`copy-${place.slotId}`} place={place} showName duplicate onOpen={onOpen} />) : null}
        </div>
      </div>
      {!reducedMotion ? <button type="button" className="sponsor-carousel-pause" aria-pressed={manualPause}
        onClick={() => setManualPause((value) => !value)}>{manualPause ? "Resume sponsors" : "Pause sponsors"}</button> : null}
    </div>
  );
}
