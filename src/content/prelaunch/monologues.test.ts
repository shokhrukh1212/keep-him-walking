import { describe, expect, it } from "vitest";
import { findBannedTopics, readBannedTerms } from "../../../scripts/packs/safety";
import { MONOLOGUE_CUE_CHARACTERS, MONOLOGUE_MAX_SECONDS, monologueCues, monologueReadingSeconds, monologueTimeline } from "@/lib/preview/monologue";
import { PRELAUNCH_MONOLOGUES } from "./monologues";

const spoken = PRELAUNCH_MONOLOGUES.flatMap((line) => [line.text, ...(line.fallback ? [line.fallback] : [])]);

describe("prelaunch monologues", () => {
  it("keeps the owner's eight lines verbatim and in order", () => {
    expect(PRELAUNCH_MONOLOGUES.map((line) => line.text)).toEqual([
      "Right now, I’m waiting in Paris. Once Season 1 starts, I’ll only walk while someone is watching.",
      "I’ve packed for seven cities. Somehow, I still think I forgot something.",
      "Paris first. I’m trying to look like I know where I’m going.",
      "During the season, you can wave, offer water, or ask for a photo. For now, I’m practicing my patient face.",
      "Someone has to be the first to say hello. Today, that’s me.",
      "Seven cities, one bag. I may have overpacked.",
      "The first season is looking for a sponsor. If you’re building something, the Sponsor button has the details.",
      "Thanks for stopping by. A little company makes the waiting better.",
    ]);
    expect(new Set(PRELAUNCH_MONOLOGUES.map((line) => line.id)).size).toBe(PRELAUNCH_MONOLOGUES.length);
  });

  it("gives every conditional line a neutral fallback, and only one line mentions sponsorship", () => {
    for (const line of PRELAUNCH_MONOLOGUES) {
      if (line.requires) expect(line.fallback?.trim()).toBeTruthy();
      if (line.requires?.city) expect(line.fallback).not.toContain(line.requires.city);
    }
    const sponsorLines = PRELAUNCH_MONOLOGUES.filter((line) => /sponsor/i.test(line.text));
    expect(sponsorLines.map((line) => line.requires?.sponsorOpen)).toEqual([true]);
    for (const text of spoken.filter((value) => !sponsorLines.some((line) => line.text === value))) {
      expect(text).not.toMatch(/sponsor/i);
    }
  });

  it("claims no weather, audience numbers, travel already done or confirmed sponsor", () => {
    for (const text of spoken) {
      expect(text.replace("Season 1", "")).not.toMatch(/\d/);
      expect(text).not.toMatch(/\b(rain|sun|snow|cold|hot|degrees|weather|viewers?|visitors|people watching|walked|kilomet|miles|sponsored by)\b/i);
    }
  });

  it("passes the authored-content safety list", async () => {
    expect(findBannedTopics(PRELAUNCH_MONOLOGUES, await readBannedTerms(process.cwd()), "monologues")).toEqual([]);
  });

  it("fits every line into readable cues and at most four talk takes", () => {
    for (const text of spoken) {
      expect(monologueReadingSeconds(text)).toBeLessThanOrEqual(monologueTimeline(text).durationSeconds);
      expect(monologueTimeline(text).durationSeconds).toBeLessThanOrEqual(MONOLOGUE_MAX_SECONDS);
      for (const cue of monologueCues(text)) expect(cue.length).toBeLessThanOrEqual(MONOLOGUE_CUE_CHARACTERS);
    }
  });
});
