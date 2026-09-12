/**
 * The words the progress row uses. Place sequence and collective distance are
 * separate facts: a place comes from the walking clock, kilometres from the
 * server's distance. Neither ever claims more than was confirmed.
 */

/** Distance never rounds up: 7.96 km is "7.9", so the goal is never shown reached early. */
export function formatDistanceKm(metres: number): string {
  const value = Math.floor(Math.max(0, Number.isFinite(metres) ? metres : 0) / 100) / 10;
  return value.toFixed(1);
}

/** Goals are labels, not measurements: 8 km, 42.2 km. */
export function formatGoalKm(metres: number): string {
  const value = Math.max(0, Number.isFinite(metres) ? metres : 0) / 1_000;
  const fixed = value.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

export type DistanceProgress = {
  goal: "daily" | "marathon" | "complete";
  /** 0..1 of the goal currently shown. */
  fill: number;
  percent: number;
  text: string;
  shortText: string;
  /** What comes after the goal on screen, for the info disclosure. */
  nextGoalText: string | null;
};

export function distanceProgress(
  distanceMetres: number,
  dailyGoalMetres: number,
  marathonMetres: number,
): DistanceProgress {
  const distance = Math.max(0, Number.isFinite(distanceMetres) ? distanceMetres : 0);
  const done = formatDistanceKm(distance);
  if (distance < dailyGoalMetres) {
    const fill = Math.min(1, distance / dailyGoalMetres);
    const percent = Math.floor(fill * 100);
    const goal = formatGoalKm(dailyGoalMetres);
    return {
      goal: "daily",
      fill,
      percent,
      text: `${done} / ${goal} km together · ${percent}%`,
      shortText: `${done}/${goal} km · ${percent}%`,
      nextGoalText: `After ${goal} km the next goal is a ${formatGoalKm(marathonMetres)} km marathon.`,
    };
  }
  if (distance < marathonMetres) {
    const fill = Math.min(1, distance / marathonMetres);
    const percent = Math.floor(fill * 100);
    const goal = formatGoalKm(marathonMetres);
    return {
      goal: "marathon",
      fill,
      percent,
      text: `${done} / ${goal} km together · ${percent}%`,
      shortText: `${done}/${goal} km · ${percent}%`,
      nextGoalText: null,
    };
  }
  return {
    goal: "complete",
    fill: 1,
    percent: 100,
    text: `${done} km together · marathon reached`,
    shortText: `${done} km · marathon`,
    nextGoalText: null,
  };
}

export type PlaceEta = {
  minutes: number;
  text: string;
  shortText: string;
  ariaText: string;
};

/** Minutes of active walking, which pause while he stops or waits; never a distance. */
export function nextPlaceEta(secondsToNextVisit: number): PlaceEta {
  const seconds = Math.max(0, Number.isFinite(secondsToNextVisit) ? secondsToNextVisit : 0);
  if (seconds < 60) {
    return {
      minutes: 0,
      text: "Next place in under a walking minute",
      shortText: "<1 walking min",
      ariaText: "Next place in less than one minute of walking",
    };
  }
  const minutes = Math.ceil(seconds / 60);
  return {
    minutes,
    text: `Next place in ~${minutes} walking min`,
    shortText: `~${minutes} walking min`,
    ariaText: `Next place in about ${minutes} ${minutes === 1 ? "minute" : "minutes"} of walking`,
  };
}

export function stopLabel(zoneIndex: number, placeCount: number): { text: string; shortText: string } {
  const count = Math.max(1, Math.floor(placeCount));
  const stop = Math.min(count, Math.max(1, Math.floor(zoneIndex) + 1));
  return { text: `Stop ${stop} of ${count}`, shortText: `${stop}/${count}` };
}
