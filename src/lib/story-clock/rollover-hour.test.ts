import { describe, expect, it } from "vitest";
import { nextRolloverAt } from "./rollover-hour";

describe("nextRolloverAt", () => {
  it("moves to today's rollover hour when it is still ahead", () => {
    const next = nextRolloverAt(new Date("2026-09-24T09:13:44Z"), 16);
    expect(next.toISOString()).toBe("2026-09-24T16:00:00.000Z");
  });

  it("moves to tomorrow once the hour has passed", () => {
    const next = nextRolloverAt(new Date("2026-09-24T16:00:01Z"), 16);
    expect(next.toISOString()).toBe("2026-09-25T16:00:00.000Z");
  });

  it("treats the exact hour as already begun", () => {
    const next = nextRolloverAt(new Date("2026-09-24T16:00:00Z"), 16);
    expect(next.toISOString()).toBe("2026-09-25T16:00:00.000Z");
  });

  it("honours a different configured hour", () => {
    expect(nextRolloverAt(new Date("2026-09-24T09:00:00Z"), 0).toISOString())
      .toBe("2026-09-25T00:00:00.000Z");
  });
});
