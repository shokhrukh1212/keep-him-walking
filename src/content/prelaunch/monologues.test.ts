import { describe, expect, it } from "vitest";
import { findBannedTopics, readBannedTerms } from "../../../scripts/packs/safety";
import { CLIP_SPECS } from "@/lib/characters/manifest";
import { MONOLOGUE_CUE_CHARACTERS, MONOLOGUE_MAX_SECONDS, MONOLOGUE_MIN_SECONDS, monologueCues, monologueReadingSeconds, monologueTimeline } from "@/lib/preview/monologue";
import { PRELAUNCH_MONOLOGUES, arrangePrelaunchMonologues } from "./monologues";

const spoken = PRELAUNCH_MONOLOGUES.flatMap((line) => [line.text.replace("{filledRegular}", "10"), ...(line.fallback ? [line.fallback] : [])]);

describe("Paris waiting monologues", () => {
  it("contains the eighteen reviewed core beats with stable identities and restrained sponsor copy", () => {
    expect(PRELAUNCH_MONOLOGUES).toHaveLength(18);
    expect(PRELAUNCH_MONOLOGUES[0]?.text).toBe("Oh, good. Company. I was about to interview that pigeon.");
    expect(PRELAUNCH_MONOLOGUES.at(-1)?.text).toBe("Come back for the first steps. I'd like witnesses.");
    expect(new Set(PRELAUNCH_MONOLOGUES.map((line) => line.id)).size).toBe(18);
    expect(PRELAUNCH_MONOLOGUES.filter((line) => line.category === "sponsor").length).toBeLessThanOrEqual(4);
  });

  it("names only installed character clips", () => {
    for (const line of PRELAUNCH_MONOLOGUES) expect(line.action && line.action in CLIP_SPECS).toBe(true);
  });

  it("makes the direct sales line conditional on real availability", () => {
    const sales = PRELAUNCH_MONOLOGUES.find((line) => line.id === "sponsor");
    expect(sales?.requires?.sponsorOpen).toBe(true);
    expect(sales?.fallback).not.toMatch(/product|spot|sponsor/i);
  });

  it("passes the authored-content safety list", async () => {
    expect(findBannedTopics(PRELAUNCH_MONOLOGUES, await readBannedTerms(process.cwd()), "monologues")).toEqual([]);
  });

  it("fits every line into readable 5–8 second caption beats", () => {
    for (const text of spoken) {
      const timeline = monologueTimeline(text);
      expect(monologueReadingSeconds(text)).toBeLessThanOrEqual(timeline.durationSeconds);
      expect(timeline.durationSeconds).toBeGreaterThanOrEqual(MONOLOGUE_MIN_SECONDS);
      expect(timeline.durationSeconds).toBeLessThanOrEqual(MONOLOGUE_MAX_SECONDS);
      for (const cue of monologueCues(text)) expect(cue.length).toBeLessThanOrEqual(MONOLOGUE_CUE_CHARACTERS);
    }
  });

  it("shuffles into a category-aware order and rotates a remembered opener", () => {
    const first = arrangePrelaunchMonologues(PRELAUNCH_MONOLOGUES, [], () => 0.5);
    const second = arrangePrelaunchMonologues(PRELAUNCH_MONOLOGUES, [first[0]!.id], () => 0.5);
    expect(first[0]?.category).toBe("greeting");
    expect(second[0]?.category).toBe("greeting");
    expect(second[0]?.id).not.toBe(first[0]?.id);
    for (let index = 1; index < first.length; index += 1) {
      expect(first[index]?.category).not.toBe(first[index - 1]?.category);
    }
  });
});
