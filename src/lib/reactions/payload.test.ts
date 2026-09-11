import { describe, expect, it } from "vitest";
import { reactionsFromRow, scheduledActionFromRow } from "./payload";

describe("reaction payload", () => {
  it("keeps authoritative action window and frozen distance", () => {
    expect(scheduledActionFromRow({
      kind: "photo",
      atActiveSecond: 12,
      endsAtActiveSecond: 16,
      frozenDistanceMetres: 31.25,
    })).toEqual({
      kind: "photo",
      atActiveSecond: 12,
      endsAtActiveSecond: 16,
      frozenDistanceMetres: 31.25,
    });
  });

  it("drops malformed optional authority instead of inventing it", () => {
    expect(reactionsFromRow({
      counts: { wave: 1, water: "bad", photo: 0 },
      scheduled: [{ kind: "wave", atActiveSecond: 2, endsAtActiveSecond: 1 }],
    })).toEqual({
      counts: { wave: 1, water: 0, photo: 0 },
      scheduled: [{ kind: "wave", atActiveSecond: 2, frozenDistanceMetres: null }],
      nextScheduledAction: null,
    });
  });
});
