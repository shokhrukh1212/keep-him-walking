import { describe, expect, it } from "vitest";
import { CLIP_DURATIONS } from "@/lib/characters/manifest";
import {
  WAITING_REST_AFTER_SECONDS,
  formatWaitDuration,
  formatWaitingLocalTime,
  waitedSecondsSince,
  waitingBehaviorAt,
  waitingLineAt,
} from "./waiting";

describe("waiting presentation", () => {
  it("plays each waiting take whole at its own speed, then sits at ten minutes", () => {
    const pockets = CLIP_DURATIONS.wait_pockets;
    expect(waitingBehaviorAt(0)).toMatchObject({ phase: "wait", state: "wait", clip: "wait_pockets", clipSeconds: 0 });
    expect(waitingBehaviorAt(pockets - .1).clip).toBe("wait_pockets");
    expect(waitingBehaviorAt(pockets - .1).clipSeconds).toBeCloseTo(pockets - .1);
    expect(waitingBehaviorAt(pockets + 1)).toMatchObject({ phase: "look_up", state: "look_up", clip: "look_up" });
    expect(waitingBehaviorAt(pockets + 1).clipSeconds).toBeCloseTo(1);
    expect(waitingBehaviorAt(pockets + CLIP_DURATIONS.look_up + 1)).toMatchObject({ phase: "wait", clip: "wait_pockets" });
    expect(waitingBehaviorAt(600)).toMatchObject({ phase: "sit", state: "sit", clip: "sit_down" });
    const seated = 600 + CLIP_DURATIONS.sit_down;
    expect(waitingBehaviorAt(seated + 1)).toMatchObject({ phase: "sit", state: "sit", clip: "sitting" });
    expect(waitingBehaviorAt(seated + 1, true)).toMatchObject({ phase: "sleep", state: "sleep", clip: "sleep" });
  });

  it("loops the seated take on its own length and walks the long wait in order", () => {
    const seated = 600 + CLIP_DURATIONS.sit_down;
    expect(waitingBehaviorAt(seated + CLIP_DURATIONS.sitting + .5).clipSeconds).toBeCloseTo(.5);
    const order = ["wait_pockets", "wait_watch", "wait_pockets", "wait_stretch", "wait_yawn", "look_up"] as const;
    let start = 60;
    for (const clip of order) {
      expect(waitingBehaviorAt(start + .25)).toMatchObject({ clip });
      expect(waitingBehaviorAt(start + .25).clipSeconds).toBeCloseTo(.25);
      start += CLIP_DURATIONS[clip];
    }
    expect(waitingBehaviorAt(start + .25).clip).toBe("wait_pockets");
  });

  it("formats fixed wait facts without inventing negative time", () => {
    const waitingSince = "2026-09-09T00:00:00.000Z";
    expect(waitedSecondsSince(waitingSince, Date.parse("2026-09-09T02:41:12.000Z")))
      .toBe(9_672);
    expect(waitedSecondsSince(waitingSince, Date.parse("2026-09-08T23:00:00.000Z")))
      .toBe(0);
    expect(formatWaitDuration(9_672)).toBe("2h 41m");
    expect(formatWaitDuration(65)).toBe("1m 05s");
    expect(formatWaitDuration(9)).toBe("9s");
  });

  it("says one fixed line at a time while he waits, with a pause between them", () => {
    // Nothing in the first two seconds: a brief gap in presence must not flash a line.
    expect(waitingLineAt(0)).toBeNull();
    expect(waitingLineAt(1.9)).toBeNull();
    expect(waitingLineAt(2)).toEqual({ text: "I only walk while someone is watching.", sequence: 0 });
    expect(waitingLineAt(7.9)?.sequence).toBe(0);
    // Six seconds spoken, four silent, then the next line.
    expect(waitingLineAt(8)).toBeNull();
    expect(waitingLineAt(11.9)).toBeNull();
    expect(waitingLineAt(12)).toEqual({ text: "I’ll wait right here for you.", sequence: 1 });
    expect(waitingLineAt(22)?.sequence).toBe(2);
    // Three lines, then he starts again.
    expect(waitingLineAt(32)).toEqual({ text: "I only walk while someone is watching.", sequence: 3 });
  });

  it("falls silent once he has sat down to rest, and never speaks on nonsense input", () => {
    expect(waitingLineAt(WAITING_REST_AFTER_SECONDS - 6)).not.toBeNull();
    expect(waitingLineAt(WAITING_REST_AFTER_SECONDS)).toBeNull();
    expect(waitingLineAt(WAITING_REST_AFTER_SECONDS + 3_600)).toBeNull();
    expect(waitingLineAt(Number.NaN)).toBeNull();
    expect(waitingLineAt(-30)).toBeNull();
  });

  it("formats the wait origin in the country-day timezone", () => {
    expect(formatWaitingLocalTime("2026-09-09T00:12:00.000Z", "Asia/Tashkent"))
      .toBe("05:12");
    expect(formatWaitingLocalTime("not-a-date", "Asia/Tashkent")).toBe("unknown time");
  });
});
