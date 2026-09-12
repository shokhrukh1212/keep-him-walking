"use client";

import { useId, useState } from "react";
import { distanceProgress, formatGoalKm } from "@/lib/world/progress-copy";
import { PlaceDots, type PlaceDot } from "./PlaceDots";

type Props = {
  /** Null while the server has not confirmed a live distance. */
  distanceMetres: number | null;
  dailyGoalMetres: number;
  marathonMetres: number;
  freshness: "extrapolated" | "last confirmed" | "reconnecting" | "unavailable";
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
  const progress = distanceMetres === null ? null : distanceProgress(distanceMetres, dailyGoalMetres, marathonMetres);
  return (
    <section className="goal-bar" data-hud-region="goal" data-goal={progress?.goal ?? "unavailable"} data-marathon={Boolean(progress && progress.goal !== "daily")}>
      <PlaceDots
        places={places}
        currentIndex={currentPlaceIndex}
        secondsToNextVisit={secondsToNextVisit}
        visitSeconds={visitSeconds}
      />
      <div className="goal-distance">
        <div className="goal-track" aria-hidden="true">
          {progress ? <span style={{ width: `${progress.fill * 100}%` }} /> : null}
        </div>
        <p className="goal-copy">
          <strong aria-label={progress?.text ?? "Daily distance unavailable"}>
            <span className="goal-copy-long" aria-hidden="true">{progress?.text ?? "Daily distance unavailable"}</span>
            <span className="goal-copy-short" aria-hidden="true">{progress?.shortText ?? "Distance unavailable"}</span>
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
