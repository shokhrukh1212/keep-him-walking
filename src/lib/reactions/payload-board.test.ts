import { describe, expect, it } from "vitest";
import type { ReactionsView } from "@/lib/contracts";
import { withReactionBoard } from "./payload";

describe("withReactionBoard", () => {
  it("takes the newer counts and keeps every stop either read has seen", () => {
    const current: ReactionsView = {
      counts: { wave: 3, water: 0, photo: 0 },
      scheduled: [{ kind: "wave", atActiveSecond: 10 }],
      nextScheduledAction: null,
      walkingClock: { anchorActiveSeconds: 100, heldActiveSeconds: 5 },
    };
    const next: ReactionsView = {
      counts: { wave: 0, water: 1, photo: 0 },
      scheduled: [{ kind: "drink", atActiveSecond: 40 }],
      nextScheduledAction: { kind: "drink", atActiveSecond: 40 },
      walkingClock: { anchorActiveSeconds: 90, heldActiveSeconds: 5 },
    };
    const merged = withReactionBoard(current, next);
    expect(merged.counts).toEqual(next.counts);
    expect(merged.scheduled.map((row) => row.atActiveSecond)).toEqual([10, 40]);
    expect(merged.nextScheduledAction).toEqual(next.nextScheduledAction);
    expect(merged.walkingClock).toEqual(current.walkingClock);
  });

  it("leaves the walking clock out when neither read had one", () => {
    const view: ReactionsView = { counts: { wave: 0, water: 0, photo: 0 }, scheduled: [], nextScheduledAction: null };
    expect("walkingClock" in withReactionBoard(view, view)).toBe(false);
  });
});
