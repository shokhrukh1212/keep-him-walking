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

/** Goals are labels, not measurements: 129.6 km, 42.2 km. */
export function formatGoalKm(metres: number): string {
  const value = Math.max(0, Number.isFinite(metres) ? metres : 0) / 1_000;
  const fixed = value.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

/** A day is 24 hours unless its own schedule says otherwise. */
const DEFAULT_DAY_SECONDS = 24 * 60 * 60;

/**
 * Today's goal: the whole day walked, every second of it watched, at his pace.
 * It is the most he can possibly cover today, so nothing on screen ever passes it
 * the way he used to pass the old fixed 8 km before breakfast. Pure: the day's own
 * bounds and the pace are the only inputs.
 */
export function fullDayGoalMetres(startsAt: string, endsAt: string, metresPerSecond: number): number {
  const seconds = (Date.parse(endsAt) - Date.parse(startsAt)) / 1_000;
  const daySeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_DAY_SECONDS;
  const pace = Number.isFinite(metresPerSecond) && metresPerSecond > 0 ? metresPerSecond : 0;
  return Math.floor(daySeconds * pace);
}

export type DistanceProgress = {
  /** "complete" only when the whole day's goal has been walked. */
  goal: "daily" | "complete";
  /** 0..1 of today's goal. */
  fill: number;
  percent: number;
  /** The marathon is a milestone inside the day, not a goal after it. */
  marathonReached: boolean;
  text: string;
  shortText: string;
  /** The milestone still ahead, for the info disclosure; null once passed or out of reach today. */
  nextGoalText: string | null;
};

export function distanceProgress(
  distanceMetres: number,
  dailyGoalMetres: number,
  marathonMetres: number,
): DistanceProgress {
  const distance = Math.max(0, Number.isFinite(distanceMetres) ? distanceMetres : 0);
  const done = formatDistanceKm(distance);
  const goal = formatGoalKm(dailyGoalMetres);
  const complete = dailyGoalMetres > 0 && distance >= dailyGoalMetres;
  const fill = dailyGoalMetres > 0 ? Math.min(1, distance / dailyGoalMetres) : 0;
  const percent = Math.floor(fill * 100);
  const marathonReached = distance >= marathonMetres;
  const marathonAhead = !marathonReached && marathonMetres < dailyGoalMetres;
  const milestone = marathonReached ? " · marathon reached" : "";
  return {
    goal: complete ? "complete" : "daily",
    fill,
    percent,
    marathonReached,
    text: complete
      ? `${done} km today · whole day walked`
      : `${done} / ${goal} km today · ${percent}%${milestone}`,
    shortText: complete ? `${done} km · whole day` : `${done}/${goal} km · ${percent}%`,
    nextGoalText: marathonAhead
      ? `The ${formatGoalKm(marathonMetres)} km marathon is a milestone on the way.`
      : null,
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
