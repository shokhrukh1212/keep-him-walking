/**
 * One vocabulary for the one fact "how did that day end".
 *
 * Three places used to decide this independently — the recap card, the day page
 * and the journey map — and each invented its own words for it. A day whose
 * outcome has not been finalized yet gets `null`: the passport shows an empty
 * frame rather than guessing a colour the server has not confirmed.
 */
export type Stamp = "gold" | "colour" | "grey" | "current";

export type StampInput = {
  /** Null when `day_outcomes` has no row yet, which is every unfinished day. */
  outcome: { marathon: boolean; landmarkReached: boolean } | null;
  status: "completed" | "live" | "scheduled" | "draft";
};

export function stampFor({ outcome, status }: StampInput): Stamp | null {
  if (status === "live") return "current";
  if (!outcome) return null;
  if (outcome.marathon) return "gold";
  return outcome.landmarkReached ? "colour" : "grey";
}

/** The words printed on the stamp itself, kept next to the colour that carries them. */
export const STAMP_LABELS: Record<Stamp, string> = {
  gold: "MARATHON",
  colour: "LANDMARK REACHED",
  grey: "UNFINISHED",
  current: "WALKING NOW",
};

export function stampLabel(stamp: Stamp | null): string {
  return stamp ? STAMP_LABELS[stamp] : "NOT YET STAMPED";
}
