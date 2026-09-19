"use client";

import { useCallback, useEffect, useRef } from "react";
import { carouselPlaces, type SponsorPlace } from "@/lib/sponsors/places";
import { SponsorPlaceTile } from "./SponsorPlaceTile";

/** How long one place stays at the left edge before the row moves on. */
const STEP_MS = 2_600;
/** After a swipe, the row waits this long before it starts moving again. */
const RESUME_MS = 6_000;

type Props = {
  places: readonly SponsorPlace[];
  /** Nothing moves on its own for a visitor who asked for less motion. */
  reducedMotion: boolean;
  /** Held still while a modal is open over it. */
  paused?: boolean;
  onOpen: (place: SponsorPlace) => void;
};

/**
 * The phone's one row of places. It drifts right to left on its own and is an
 * ordinary horizontal scroller underneath, so a swipe in either direction works and
 * takes precedence: touching it, or moving focus into it, stops the drift, and it
 * only picks up again once the visitor has left it alone. A hidden tab, an open
 * modal and a reduced-motion preference each stop it too.
 */
export function SponsorPlaceCarousel({ places, reducedMotion, paused = false, onOpen }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const held = useRef(false);
  const resumeTimer = useRef<number | null>(null);
  const row = carouselPlaces(places);

  const hold = useCallback(() => {
    held.current = true;
    if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current);
    resumeTimer.current = null;
  }, []);

  const release = useCallback(() => {
    if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => {
      held.current = false;
      resumeTimer.current = null;
    }, RESUME_MS);
  }, []);

  useEffect(() => () => {
    if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current);
  }, []);

  useEffect(() => {
    if (reducedMotion || paused || row.length < 2) return;
    const element = track.current;
    if (!element || typeof element.scrollTo !== "function") return;
    const timer = window.setInterval(() => {
      if (held.current || document.visibilityState !== "visible") return;
      const first = element.children[0] as HTMLElement | undefined;
      const second = element.children[1] as HTMLElement | undefined;
      const step = first && second ? second.offsetLeft - first.offsetLeft : element.clientWidth;
      const end = element.scrollWidth - element.clientWidth;
      // Back to the start rather than stopping dead at the last place.
      const next = element.scrollLeft + step > end - 1 ? 0 : element.scrollLeft + step;
      element.scrollTo({ left: next, behavior: "smooth" });
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [reducedMotion, paused, row.length]);

  if (row.length === 0) return null;

  return (
    <div
      className="sponsor-carousel"
      ref={track}
      data-testid="sponsor-carousel"
      role="group"
      aria-label="Sponsor places"
      onPointerDown={hold}
      onPointerUp={release}
      onPointerCancel={release}
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocusCapture={hold}
      onBlurCapture={release}
    >
      {row.map((place) => <SponsorPlaceTile key={place.id} place={place} showName onOpen={onOpen} />)}
    </div>
  );
}
