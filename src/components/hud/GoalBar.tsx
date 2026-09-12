"use client";

import { useId, useState } from "react";
import { distanceProgress, formatGoalKm } from "@/lib/world/progress-copy";
import { PlaceDots, type PlaceDot } from "./PlaceDots";

type Props = {
  distanceMetres: number;
  dailyGoalMetres: number;
  marathonMetres: number;
  freshness: "extrapolated" | "last confirmed" | "reconnecting";
  places: readonly PlaceDot[];
  currentPlaceIndex: number;
  secondsToNextVisit: number;
  visitSeconds: number;
};

/**
 * Two separate facts in one row: which place he is in (from the walking clock)
 * and how far everyone has carried him (from the server's distance). Neither is
 * used to invent the other.
 */
export function GoalBar({
  distanceMetres, dailyGoalMetres, marathonMetres, freshness,
  places, currentPlaceIndex, secondsToNextVisit, visitSeconds,
}: Props) {
  const [infoOpen, setInfoOpen] = useState(false);
  const infoId = useId();
  const progress = distanceProgress(distanceMetres, dailyGoalMetres, marathonMetres);
  return (
    <section className="goal-bar" data-hud-region="goal" data-goal={progress.goal} data-marathon={progress.goal !== "daily"}>
      <PlaceDots
        places={places}
        currentIndex={currentPlaceIndex}
        secondsToNextVisit={secondsToNextVisit}
        visitSeconds={visitSeconds}
      />
      <div className="goal-distance">
        <div className="goal-track" aria-hidden="true">
          <span style={{ width: `${progress.fill * 100}%` }} />
        </div>
        <p className="goal-copy">
          <strong aria-label={progress.text}>
            <span className="goal-copy-long" aria-hidden="true">{progress.text}</span>
            <span className="goal-copy-short" aria-hidden="true">{progress.shortText}</span>
          </strong>
          <small className="goal-freshness" data-freshness={freshness}>{freshness}</small>
          <button
            type="button"
            className="goal-info"
            aria-expanded={infoOpen}
            aria-controls={infoOpen ? infoId : undefined}
            aria-label="About the distance goals"
            onClick={() => setInfoOpen((open) => !open)}
          >
            <span aria-hidden="true">i</span>
          </button>
        </p>
        {infoOpen ? (
          <div id={infoId} className="goal-info-popover" role="note">
            <p>
              <strong>{formatGoalKm(dailyGoalMetres)} km</strong> is today&apos;s shared goal. It grows only while he walks,
              faster when more people watch, and pauses while he stops.
            </p>
            <p>
              After that, the next goal is a <strong>{formatGoalKm(marathonMetres)} km</strong> marathon, counted
              over the same day.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
