import { describe, expect, it } from "vitest";
import { findBannedTopics, readBannedTerms } from "../../../scripts/packs/safety";
import { MONOLOGUE_CUE_CHARACTERS, MONOLOGUE_MAX_SECONDS, monologueCues, monologueReadingSeconds, monologueTimeline } from "@/lib/preview/monologue";
import { PRELAUNCH_MONOLOGUES } from "./monologues";

const spoken = PRELAUNCH_MONOLOGUES.flatMap((line) => [line.text, ...(line.fallback ? [line.fallback] : [])]);

describe("prelaunch monologues", () => {
  it("keeps the owner's six lines verbatim and in order", () => {
    expect(PRELAUNCH_MONOLOGUES.map((line) => line.text)).toEqual([
      "My fourteen-day journey starts September 17.",
      "My maker’s first wedding anniversary is October 1.",
      "I’m taking the virtual journey. He’s planning the surprise in Tashkent.",
      "Once we start, watching is what keeps me walking.",
      "You’ll help choose the anniversary setting. Voting opens September 24.",
      "Watching is free. Thanks for keeping me company.",
    ]);
    expect(new Set(PRELAUNCH_MONOLOGUES.map((line) => line.id)).size).toBe(PRELAUNCH_MONOLOGUES.length);
  });

  it("dates only the lines that stop being true, and none mentions sponsorship", () => {
    expect(PRELAUNCH_MONOLOGUES.map((line) => line.requires?.before ?? null))
      .toEqual(["travelStart", null, null, "travelStart", "pollOpens", null]);
    for (const line of PRELAUNCH_MONOLOGUES) expect(line.requires?.sponsorOpen).toBeUndefined();
    for (const text of spoken) expect(text).not.toMatch(/sponsor/i);
  });

  it("claims no weather, audience numbers, travel already done or confirmed sponsor", () => {
    for (const text of spoken) {
      expect(text.replace(/(September|October) \d+/g, "")).not.toMatch(/\d/);
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
