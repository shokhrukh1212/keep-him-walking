import { describe, expect, it } from "vitest";
import {
  formatWaitDuration,
  formatWaitingLocalTime,
  waitedSecondsSince,
  waitingBehaviorAt,
} from "./waiting";

describe("waiting presentation", () => {
  it("cycles explicit waiting and look-up takes, then sits at ten minutes", () => {
    expect(waitingBehaviorAt(0)).toMatchObject({ phase: "wait", state: "wait", clip: "wait_pockets" });
    expect(waitingBehaviorAt(4)).toMatchObject({ phase: "look_up", state: "look_up", clip: "look_up" });
    expect(waitingBehaviorAt(8)).toMatchObject({ phase: "wait", state: "wait", clip: "wait_pockets" });
    expect(waitingBehaviorAt(12)).toMatchObject({ phase: "wait", state: "wait" });
    expect(waitingBehaviorAt(600)).toMatchObject({ phase: "sit", state: "sit", clip: "sit_down" });
    expect(waitingBehaviorAt(604)).toMatchObject({ phase: "sit", state: "sit", clip: "sitting" });
    expect(waitingBehaviorAt(604, true)).toMatchObject({ phase: "sleep", state: "sleep", clip: "sleep" });
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

  it("formats the wait origin in the country-day timezone", () => {
    expect(formatWaitingLocalTime("2026-09-09T00:12:00.000Z", "Asia/Tashkent"))
      .toBe("05:12");
    expect(formatWaitingLocalTime("not-a-date", "Asia/Tashkent")).toBe("unknown time");
  });
});
