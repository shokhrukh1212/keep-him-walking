import { describe, expect, it } from "vitest";
import { REACTION_OUTCOMES, reactionHttpStatus, reactionOutcome } from "./outcome";

describe("reaction outcomes", () => {
  it("names only the outcomes the database returns", () => {
    for (const outcome of REACTION_OUTCOMES) expect(reactionOutcome(outcome)).toBe(outcome);
    expect(reactionOutcome("no_runtime")).toBeNull();
    expect(reactionOutcome(undefined)).toBeNull();
  });

  it("answers each outcome with a status the browser can act on", () => {
    expect(reactionHttpStatus("counted")).toBe(200);
    expect(reactionHttpStatus("scheduled")).toBe(200);
    expect(reactionHttpStatus("cooldown")).toBe(429);
    expect(reactionHttpStatus("rate_limited")).toBe(429);
    expect(reactionHttpStatus("resting")).toBe(409);
    expect(reactionHttpStatus("not_watching")).toBe(409);
    expect(reactionHttpStatus(null)).toBe(503);
  });
});
