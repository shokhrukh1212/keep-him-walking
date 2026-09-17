import { describe, expect, it } from "vitest";
import type { PrelaunchMonologueLine } from "@/content/prelaunch/monologues";
import { PRELAUNCH_MONOLOGUES as ANNIVERSARY_LINES } from "@/content/prelaunch/monologues";
import { SCHEDULER_FIXTURE_LINES as PRELAUNCH_MONOLOGUES } from "./fixture-lines";
import {
  chooseMonologue,
  INITIAL_MONOLOGUE_SCHEDULE,
  MONOLOGUE_CUE_CHARACTERS,
  PREVIEW_INTERVAL_SECONDS,
  TALK_LOOP_SECONDS,
  advanceMonologues,
  cueReadingSeconds,
  monologueCaptionAt,
  monologueCues,
  monologueTimeline,
  nextMonologueBoundary,
  withModelReady,
  type MonologueSchedule,
} from "./monologue";

const words = (text: string) => text.trim().split(/\s+/);

type Run = {
  until: number;
  lines?: readonly PrelaunchMonologueLine[];
  readyAt?: number;
  deferred?: (at: number) => boolean;
  sponsorOpen?: boolean | null;
  cityName?: string;
};

/** Steps the schedule every quarter second, as a controller waking late or early would. */
function run({ until, lines = PRELAUNCH_MONOLOGUES, readyAt = 0, deferred, sponsorOpen = null, cityName = "Paris" }: Run) {
  let state: MonologueSchedule = withModelReady(INITIAL_MONOLOGUE_SCHEDULE, readyAt);
  const starts: Array<{ at: number; end: number; id: string; text: string }> = [];
  for (let at = readyAt; at <= until; at += 0.25) {
    const before = state.started;
    state = advanceMonologues(state, { at, deferred: deferred?.(at) ?? false, lines, cityName, sponsorOpen });
    if (state.started > before && state.speaking) {
      const { startedAt, timeline, id, text } = state.speaking;
      starts.push({ at: startedAt, end: startedAt + timeline.durationSeconds, id, text });
    }
  }
  return { state, starts };
}

describe("monologue cues", () => {
  it("splits at sentences first and never drops or reorders a word", () => {
    expect(monologueCues(PRELAUNCH_MONOLOGUES[0]!.text)).toEqual([
      "Right now, I’m waiting in Paris.",
      "Once Season 1 starts, I’ll only walk while someone is watching.",
    ]);
    for (const line of PRELAUNCH_MONOLOGUES) {
      for (const text of [line.text, line.fallback].filter((value): value is string => Boolean(value))) {
        const cues = monologueCues(text);
        expect(cues.flatMap(words)).toEqual(words(text));
        for (const cue of cues) expect(cue.length).toBeLessThanOrEqual(MONOLOGUE_CUE_CHARACTERS);
      }
    }
  });

  it("breaks an overlong sentence at word boundaries instead of truncating it", () => {
    const sentence = `${"A long walk through the old streets of the city ".repeat(3).trim()}.`;
    const cues = monologueCues(sentence);
    expect(cues.length).toBeGreaterThan(1);
    expect(cues.flatMap(words)).toEqual(words(sentence));
  });
});

describe("monologue timeline", () => {
  it("lasts whole talk takes within 10–16 seconds and gives every cue its reading time", () => {
    for (const line of PRELAUNCH_MONOLOGUES) {
      for (const text of [line.text, line.fallback].filter((value): value is string => Boolean(value))) {
        const timeline = monologueTimeline(text);
        expect(timeline.durationSeconds).toBeGreaterThanOrEqual(10);
        expect(timeline.durationSeconds).toBeLessThanOrEqual(16);
        expect(timeline.durationSeconds).toBeCloseTo(timeline.talkLoops * TALK_LOOP_SECONDS);
        expect(timeline.cues[0]!.startSeconds).toBe(0);
        expect(timeline.cues.at(-1)!.endSeconds).toBe(timeline.durationSeconds);
        timeline.cues.forEach((cue, index) => {
          if (index > 0) expect(cue.startSeconds).toBe(timeline.cues[index - 1]!.endSeconds);
          expect(cue.endSeconds - cue.startSeconds).toBeGreaterThanOrEqual(cueReadingSeconds(cue.text) - 1e-9);
        });
      }
    }
  });

  it("uses a fourth talk take only when the words need it", () => {
    expect(monologueTimeline("Paris first.").talkLoops).toBe(3);
    const long = "I walked past the river this morning. The bakery was already busy. Someone waved from a window above the square. I waved back, a little too late.";
    expect(monologueTimeline(long).talkLoops).toBe(4);
  });
});

describe("monologue schedule", () => {
  it("waits for the model, starts five seconds later, then every 180 seconds start to start", () => {
    expect(run({ until: 60, readyAt: 12 }).starts[0]!.at).toBe(17);
    const { starts } = run({ until: 7_200 });
    expect(starts.map((start) => start.at)).toEqual(Array.from({ length: 40 }, (_, index) => 5 + index * PREVIEW_INTERVAL_SECONDS));
    starts.slice(1).forEach((start, index) => expect(start.at).toBeGreaterThanOrEqual(starts[index]!.end));
    const idle = advanceMonologues(INITIAL_MONOLOGUE_SCHEDULE, {
      at: 3_600, deferred: false, lines: PRELAUNCH_MONOLOGUES, cityName: "Paris", sponsorOpen: null,
    });
    expect(idle.started).toBe(0);
  });

  it("says the lines in the authored order and loops, never repeating one back to back", () => {
    const { starts } = run({ until: 5 + 8 * PREVIEW_INTERVAL_SECONDS });
    expect(starts.map((start) => start.id)).toEqual([
      "waiting-in-paris", "packed-for-seven", "paris-first", "during-the-season", "first-hello", "one-bag",
      "looking-for-a-sponsor.fallback", "thanks-for-stopping-by", "waiting-in-paris",
    ]);
    const long = run({ until: 7_200 }).starts;
    long.slice(1).forEach((start, index) => expect(start.text).not.toBe(long[index]!.text));
    const doubled: PrelaunchMonologueLine[] = [{ id: "a", text: "Same." }, { id: "b", text: "Same." }, { id: "c", text: "Other." }];
    const texts = run({ until: 5 + 5 * PREVIEW_INTERVAL_SECONDS, lines: doubled }).starts.map((start) => start.text);
    texts.slice(1).forEach((text, index) => expect(text).not.toBe(texts[index]));
  });

  it("offers sponsorship only while genuinely open, never first, and once per visit", () => {
    const open = run({ until: 5 + 14 * PREVIEW_INTERVAL_SECONDS, sponsorOpen: true }).starts;
    expect(open[6]!.id).toBe("looking-for-a-sponsor");
    expect(open[14]!.id).toBe("looking-for-a-sponsor.fallback");
    for (const sponsorOpen of [false, null]) {
      expect(run({ until: 5 + 6 * PREVIEW_INTERVAL_SECONDS, sponsorOpen }).starts[6]!.id).toBe("looking-for-a-sponsor.fallback");
    }
    const sponsorFirst = [PRELAUNCH_MONOLOGUES[6]!, PRELAUNCH_MONOLOGUES[1]!];
    expect(run({ until: 10, lines: sponsorFirst, sponsorOpen: true }).starts[0]!.id).toBe("looking-for-a-sponsor.fallback");
  });

  it("says a city-specific line only in that city", () => {
    const { starts } = run({ until: 5 + 2 * PREVIEW_INTERVAL_SECONDS, cityName: "Lyon" });
    expect(starts.map((start) => start.id)).toEqual(["waiting-in-paris.fallback", "packed-for-seven", "paris-first.fallback"]);
    expect(starts[0]!.text).not.toContain("Paris");
  });

  it("holds a new start while deferred, plays it once afterwards and never catches up", () => {
    expect(run({ until: 400, deferred: (at) => at < 30 }).starts.map((start) => start.at)).toEqual([30, 210, 390]);
    // A modal open for over ten minutes: exactly one held-back line, then the cadence restarts.
    const modal = run({ until: 1_000, deferred: (at) => at >= 170 && at < 800 }).starts;
    expect(modal.map((start) => start.at)).toEqual([5, 800, 980]);
  });

  it("lets a speech already under way finish beneath a modal", () => {
    const during = run({ until: 10, deferred: (at) => at >= 6 });
    expect(during.state.speaking?.id).toBe("waiting-in-paris");
    expect(monologueCaptionAt(during.state, 10)).not.toBeNull();
    const after = run({ until: 20, deferred: (at) => at >= 6 });
    expect(after.state.speaking).toBeNull();
    expect(after.state.started).toBe(1);
  });
});

describe("monologue caption and wake-ups", () => {
  it("shows each cue for its window, the whole line for assistive technology, and nothing after", () => {
    const { state } = run({ until: 5 });
    const speech = state.speaking!;
    const firstCueEnd = 5 + speech.timeline.cues[0]!.endSeconds;
    expect(monologueCaptionAt(state, 5)).toMatchObject({ cueIndex: 0, cueText: "Right now, I’m waiting in Paris.", text: speech.text });
    expect(monologueCaptionAt(state, firstCueEnd)).toMatchObject({ cueIndex: 1 });
    const end = 5 + speech.timeline.durationSeconds;
    expect(monologueCaptionAt(state, end)).toBeNull();
    expect(advanceMonologues(state, { at: end, deferred: false, lines: PRELAUNCH_MONOLOGUES, cityName: "Paris", sponsorOpen: null }).speaking).toBeNull();
  });

  it("names the single next moment anything changes, and none while a due start is held", () => {
    const ready = withModelReady(INITIAL_MONOLOGUE_SCHEDULE, 0);
    expect(nextMonologueBoundary(ready, 0)).toBe(5);
    const { state } = run({ until: 5 });
    const speech = state.speaking!;
    expect(nextMonologueBoundary(state, 5)).toBeCloseTo(5 + speech.timeline.cues[0]!.endSeconds);
    expect(nextMonologueBoundary(state, 5 + speech.timeline.cues[0]!.endSeconds)).toBeCloseTo(5 + speech.timeline.durationSeconds);
    const finished = run({ until: 20 }).state;
    expect(nextMonologueBoundary(finished, 20)).toBe(185);
    expect(nextMonologueBoundary(finished, 190)).toBeNull();
  });
});

describe("dated Anniversary Journey lines", () => {
  const context = { cityName: "Paris", sponsorOpen: null, sponsorSpoken: false, previousText: null };
  const beforeLaunch = Date.parse("2026-09-17T15:59:59Z");
  const afterLaunch = Date.parse("2026-09-17T16:00:00Z");
  const afterPollOpens = Date.parse("2026-09-24T16:00:00Z");

  it("says the start date only before launch, and skips it afterwards", () => {
    expect(chooseMonologue(ANNIVERSARY_LINES, 0, { ...context, nowMs: beforeLaunch })?.text).toBe("My fourteen-day journey starts September 17.");
    expect(chooseMonologue(ANNIVERSARY_LINES, 0, { ...context, nowMs: afterLaunch })?.text).toBe("My maker’s first wedding anniversary is October 1.");
    expect(chooseMonologue(ANNIVERSARY_LINES, 3, { ...context, nowMs: afterLaunch })?.text).toBe("You’ll help choose the anniversary setting. Voting opens September 24.");
  });

  it("drops the voting line once voting has opened, and keeps the undated ones", () => {
    const said = new Set([0, 1, 2, 3, 4, 5].map((slot) => chooseMonologue(ANNIVERSARY_LINES, slot, { ...context, nowMs: afterPollOpens })?.text));
    expect([...said].sort()).toEqual([
      "I’m taking the virtual journey. He’s planning the surprise in Tashkent.",
      "My maker’s first wedding anniversary is October 1.",
      "Watching is free. Thanks for keeping me company.",
    ]);
  });
});
