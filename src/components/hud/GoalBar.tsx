"use client";

import { useId, useState } from "react";
import { distanceProgress, formatDistanceKm, formatGoalKm, nextPlaceEta, stopLabel } from "@/lib/world/progress-copy";
import type { WalkingStatus } from "@/lib/presence/status-label";

type Props = {
  walking: boolean;
  activityLabel: string;
  activityTone: WalkingStatus["tone"];
  /** Null while the server has not confirmed a live distance. */
  distanceMetres: number | null;
  dailyGoalMetres: number;
  marathonMetres: number;
  freshness: "extrapolated" | "last confirmed" | "reconnecting" | "unavailable";
  placeCount: number;
  currentPlaceIndex: number;
  secondsToNextVisit: number;
  prelaunchMessage?: string | null;
};

/**
 * One compact landing summary. The scene counter comes from the walking clock
 * and the goal bar comes from server-owned distance; neither invents the other.
 * The bar follows whichever goal is current: today's shared distance until it is
 * reached, then the marathon the explanation has been promising all along.
 */
export function GoalBar({
  walking, activityLabel, activityTone,
  distanceMetres, dailyGoalMetres, marathonMetres, freshness,
  placeCount, currentPlaceIndex, secondsToNextVisit,
  prelaunchMessage = null,
}: Props) {
  const [infoOpen, setInfoOpen] = useState(false);
  const infoId = useId();
  const stop = stopLabel(currentPlaceIndex, placeCount);
  const eta = nextPlaceEta(secondsToNextVisit);
  const goalKm = formatGoalKm(dailyGoalMetres);
  const distanceKm = distanceMetres === null ? null : formatDistanceKm(distanceMetres);
  // One goal is current at a time, and the same pure function decides which one
  // here, in the Journey panel and in the accessible explanation below.
  const progress = distanceMetres === null
    ? null
    : distanceProgress(distanceMetres, dailyGoalMetres, marathonMetres);
  const activeGoalMetres = progress === null || progress.goal === "daily" ? dailyGoalMetres : marathonMetres;
  const fill = progress?.fill ?? null;
  const estimated = freshness === "extrapolated";
  const freshnessLabel = freshness === "reconnecting"
    ? "last confirmed"
    : freshness === "unavailable"
      ? "unavailable"
      : freshness === "last confirmed"
        ? "confirmed"
        : "estimated";
  const punctuatedActivity = /[.!?…]$/.test(activityLabel) ? activityLabel : `${activityLabel}.`;
  const secondary = activityTone === "prelaunch"
    ? prelaunchMessage ?? "Milo is getting ready for his first walk."
    : activityTone === "complete"
      ? "Journey complete."
      : `${stop.text} · Next scene in ${eta.shortText}`;
  const distanceLabel = distanceKm === null || progress === null
    ? "Today · distance unavailable"
    : progress.goal === "complete"
      ? `Today · ${estimated ? "~" : ""}${distanceKm} km · marathon reached`
      : progress.goal === "marathon"
        ? `Today · ${estimated ? "~" : ""}${distanceKm} / ${formatGoalKm(marathonMetres)} km marathon`
        : `Today · ${estimated ? "~" : ""}${distanceKm} / ${goalKm} km`;
  return (
    <section className="goal-bar journey-progress-panel" data-hud-region="goal" data-goal={progress?.goal ?? "daily"}>
      <div className="journey-progress-heading">
        <p className="journey-progress-primary" data-tone={activityTone} role="status">
          <span aria-hidden="true">{walking ? "→" : activityTone === "reconnecting" ? "↻" : "•"}</span>
          <strong>{punctuatedActivity}</strong>
        </p>
        <p className="journey-progress-secondary">{secondary}</p>
      </div>
      {/* Nothing has been walked before launch: no distance row, not even an "unavailable" one. */}
      {activityTone === "prelaunch" ? null : <div className="goal-distance">
        <p className="goal-copy">
          <strong>{distanceLabel}</strong>
          <small className="goal-freshness" data-freshness={freshness}>{freshnessLabel}</small>
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
        <div className="goal-track" aria-label={distanceLabel} role="progressbar" aria-valuemin={0} aria-valuemax={activeGoalMetres} aria-valuenow={distanceMetres === null ? undefined : Math.min(distanceMetres, activeGoalMetres)}>
          {fill !== null ? <span style={{ width: `${fill * 100}%` }} /> : null}
        </div>
        {infoOpen ? (
          <div id={infoId} className="goal-info-popover" role="note">
            {progress?.goal === "marathon" ? (
              <p>
                Today&apos;s <strong>{goalKm} km</strong> is reached, so the goal is now
                a <strong>{formatGoalKm(marathonMetres)} km</strong> marathon over the same day. Distance grows
                only while he walks and pauses while he stops.
              </p>
            ) : progress?.goal === "complete" ? (
              <p>
                Today&apos;s <strong>{goalKm} km</strong> and the <strong>{formatGoalKm(marathonMetres)} km</strong> marathon
                are both reached. Distance keeps counting until the day ends.
              </p>
            ) : (
              <>
                <p>
                  <strong>{goalKm} km</strong> is today&apos;s shared goal. Distance grows only while he walks and pauses while he stops.
                </p>
                <p>
                  After that, the next goal is a <strong>{formatGoalKm(marathonMetres)} km</strong> marathon, counted
                  over the same day.
                </p>
              </>
            )}
            <p>An estimated distance is marked with ~ and is bounded to at most 60 seconds beyond the last server confirmation.</p>
          </div>
        ) : null}
      </div>}
    </section>
  );
}
