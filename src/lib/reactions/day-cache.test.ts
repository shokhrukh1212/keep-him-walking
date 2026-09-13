import { describe, expect, it } from "vitest";
import { REACTION_DAY_CACHE_MS, cachedCountryDayUsable } from "./day-cache";

const found = Date.parse("2026-09-14T15:59:50Z");
const day = (endsAt: string, storyScale = 1) => ({ ends_at: endsAt, story_scale: storyScale });

describe("cachedCountryDayUsable", () => {
  it("reuses a day found a moment ago", () => {
    expect(cachedCountryDayUsable({ day: day("2026-09-14T16:00:00Z"), fetchedAtMs: found }, found + 4_999)).toBe(true);
  });

  it("looks again after a few seconds, or when the clock went backwards", () => {
    const entry = { day: day("2026-09-15T16:00:00Z"), fetchedAtMs: found };
    expect(cachedCountryDayUsable(entry, found + REACTION_DAY_CACHE_MS)).toBe(false);
    expect(cachedCountryDayUsable(entry, found - 1)).toBe(false);
  });

  it("never serves a day past its end", () => {
    const entry = { day: day("2026-09-14T16:00:00Z"), fetchedAtMs: found };
    expect(cachedCountryDayUsable(entry, Date.parse("2026-09-14T16:00:00Z"))).toBe(false);
  });

  it("ignores the real-time end on a rehearsal story clock", () => {
    const entry = { day: day("2026-09-14T15:59:00Z", 144), fetchedAtMs: found };
    expect(cachedCountryDayUsable(entry, found + 4_000)).toBe(true);
  });

  it("has nothing to reuse before the first lookup", () => {
    expect(cachedCountryDayUsable(null, found)).toBe(false);
  });
});
