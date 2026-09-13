/** What the database decided about one reaction request. */
export const REACTION_OUTCOMES = [
  "counted",
  "scheduled",
  "cooldown",
  "rate_limited",
  "resting",
  "not_watching",
] as const;

export type ReactionOutcome = (typeof REACTION_OUTCOMES)[number];

export function reactionOutcome(value: unknown): ReactionOutcome | null {
  return typeof value === "string" && (REACTION_OUTCOMES as readonly string[]).includes(value)
    ? value as ReactionOutcome
    : null;
}

/**
 * The HTTP answer for an outcome. A request that counted or booked is 200. Asking too
 * soon is 429, because asking again later works. Asking while he rests, or without a
 * live watch, is 409: the request was understood and refused. Anything the database
 * did not name is 503.
 */
export function reactionHttpStatus(outcome: ReactionOutcome | null): 200 | 409 | 429 | 503 {
  switch (outcome) {
    case "counted":
    case "scheduled":
      return 200;
    case "cooldown":
    case "rate_limited":
      return 429;
    case "resting":
    case "not_watching":
      return 409;
    default:
      return 503;
  }
}
