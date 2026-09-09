import { describe, expect, it } from "vitest";
import {
  formatWaitDuration,
  formatWaitingLocalTime,
  waitedSecondsSince,
  waitingBehaviorAt,
} from "./waiting";

describe("waiting presentation", () => {
  it("cycles idle, look-around, idle from waited seconds", () => {
    expect(waitingBehaviorAt(0)).toMatchObject({ phase: "idle", state: "idle" });
    expect(waitingBehaviorAt(4)).toMatchObject({ phase: "look_around", state: "notice" });
    expect(waitingBehaviorAt(8)).toMatchObject({ phase: "idle", state: "idle" });
    expect(waitingBehaviorAt(12)).toMatchObject({ phase: "idle", state: "idle" });
    expect(waitingBehaviorAt(604)).toMatchObject({ phase: "rest", state: "rest", clipSeconds: 4 });
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
