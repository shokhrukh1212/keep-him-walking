import { describe, expect, it } from "vitest";
import {
  mergeScheduledActions,
  newestWalkingClock,
  reactionsFromRow,
  scheduledActionFromRow,
  walkingClockFromRow,
} from "./payload";

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

  it("keeps a scheduled stop's source, script, occurrence and cancellation", () => {
    expect(scheduledActionFromRow({
      kind: "conversation",
      atActiveSecond: 300,
      endsAtActiveSecond: 320.66,
      frozenDistanceMetres: null,
      source: "system",
      variant: "paris-station-hello",
      occurrenceKey: "conversation:3",
      cancelled: true,
    })).toEqual({
      kind: "conversation",
      atActiveSecond: 300,
      endsAtActiveSecond: 320.66,
      frozenDistanceMetres: null,
      source: "system",
      variant: "paris-station-hello",
      occurrenceKey: "conversation:3",
      cancelled: true,
    });
  });

  it("refuses unknown kinds and never passes display text through a token field", () => {
    expect(scheduledActionFromRow({ kind: "dance", atActiveSecond: 1 })).toBeNull();
    expect(scheduledActionFromRow({ kind: "greeting", atActiveSecond: 1, variant: "<b>Hi</b>", source: "visitor" }))
      .toEqual({ kind: "greeting", atActiveSecond: 1, frozenDistanceMetres: null });
  });

  it("accepts only an internally consistent walking-clock anchor", () => {
    expect(walkingClockFromRow({ anchorActiveSeconds: 900, heldActiveSeconds: 120 }))
      .toEqual({ anchorActiveSeconds: 900, heldActiveSeconds: 120 });
    expect(walkingClockFromRow({ anchorActiveSeconds: 100, heldActiveSeconds: 120 })).toBeNull();
    expect(walkingClockFromRow({ anchorActiveSeconds: "x", heldActiveSeconds: 1 })).toBeNull();
    expect(reactionsFromRow({ walkingClock: { anchorActiveSeconds: 5, heldActiveSeconds: 2 } }).walkingClock)
      .toEqual({ anchorActiveSeconds: 5, heldActiveSeconds: 2 });
  });

  it("lets a later cancellation win and keeps every client in the same order", () => {
    const live = { kind: "phone" as const, atActiveSecond: 40, endsAtActiveSecond: 64.77, source: "system" as const };
    const wave = { kind: "wave" as const, atActiveSecond: 10, endsAtActiveSecond: 15.93 };
    expect(mergeScheduledActions([live, wave], [{ ...live, cancelled: true }]))
      .toEqual([wave, { ...live, cancelled: true }]);
    expect(mergeScheduledActions([{ ...live, cancelled: true }], [live]))
      .toEqual([{ ...live, cancelled: true }]);
    expect(newestWalkingClock(
      { anchorActiveSeconds: 10, heldActiveSeconds: 1 },
      null,
      { anchorActiveSeconds: 30, heldActiveSeconds: 4 },
    )).toEqual({ anchorActiveSeconds: 30, heldActiveSeconds: 4 });
  });
});
