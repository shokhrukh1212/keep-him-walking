"use client";

import { useEffect, useId, useRef, useState } from "react";
import { nextPlaceEta, stopLabel } from "@/lib/world/progress-copy";

export type PlaceDot = { id: string; label: string; description?: string };

type Props = {
  places: readonly PlaceDot[];
  currentIndex: number;
  secondsToNextVisit: number;
  visitSeconds: number;
};

function minutesText(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `~${minutes} walking min`;
}

/**
 * The day's places in order, generated from the pinned manifest. A dot only
 * describes its place: tapping one never moves the shared traveler.
 */
export function PlaceDots({ places, currentIndex, secondsToNextVisit, visitSeconds }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const popoverId = useId();
  const root = useRef<HTMLDivElement>(null);
  const count = places.length;
  const stop = stopLabel(currentIndex, count);
  const eta = nextPlaceEta(secondsToNextVisit);

  useEffect(() => {
    if (!openId) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenId(null); };
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpenId(null);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openId]);

  if (count === 0) return null;
  const openIndex = places.findIndex((place) => place.id === openId);
  const open = openIndex >= 0 ? places[openIndex]! : null;
  const stepsAhead = open ? (openIndex - currentIndex + count) % count : 0;
  const status = !open
    ? ""
    : stepsAhead === 0
      ? `You are here · next place in ${eta.shortText}`
      : `In ${minutesText(secondsToNextVisit + (stepsAhead - 1) * visitSeconds)}`;

  return (
    <div className="place-dots" ref={root} data-hud-region="places">
      <ol className="place-dots-list" aria-label={`${stop.text}. ${eta.ariaText}.`}>
        {places.map((place, index) => {
          const current = index === currentIndex;
          return (
            <li key={place.id}>
              <button
                type="button"
                className="place-dot"
                data-current={current}
                aria-current={current ? "step" : undefined}
                aria-expanded={openId === place.id}
                aria-controls={openId === place.id ? popoverId : undefined}
                aria-label={`Stop ${index + 1} of ${count}, ${place.label}${current ? ", you are here" : ""}`}
                onClick={() => setOpenId(openId === place.id ? null : place.id)}
              >
                <span aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
      <span className="place-dots-summary" aria-hidden="true">
        <strong>{stop.shortText}</strong>
        <span className="place-dots-eta">Next {eta.shortText}</span>
      </span>
      {open ? (
        <div id={popoverId} className="place-popover" role="status">
          <span className="eyebrow">Stop {openIndex + 1} of {count}</span>
          <strong>{open.label}</strong>
          <span>{status}</span>
          {open.description ? <p>{open.description}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
