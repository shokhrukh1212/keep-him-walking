import { describe, expect, it } from "vitest";
import type { ScheduledActionView } from "@/lib/contracts";
import { newCrowdBooking, reactionRestSeconds, reactionRestUntil } from "./rest";

const crowd = (kind: ScheduledActionView["kind"], atActiveSecond: number): ScheduledActionView => ({ kind, atActiveSecond });

describe("reaction rest", () => {
  it("rests a reaction for 120 watched seconds after the crowd's action", () => {
    const rows = [crowd("wave", 100)];
    expect(reactionRestUntil("wave", rows)).toBe(220);
    expect(reactionRestSeconds("wave", rows, 100)).toBe(120);
    expect(reactionRestSeconds("wave", rows, 219.5)).toBe(1);
    expect(reactionRestSeconds("wave", rows, 220)).toBe(0);
    expect(reactionRestSeconds("water", rows, 150)).toBe(0);
  });

  it("maps water to his drink and uses the latest one", () => {
    expect(reactionRestUntil("water", [crowd("drink", 10), crowd("drink", 60)])).toBe(180);
  });

  it("ignores his own planned stops and cancelled rows", () => {
    const rows: ScheduledActionView[] = [
      { kind: "wave", atActiveSecond: 100, source: "beat" },
      { kind: "photo", atActiveSecond: 100, cancelled: true },
    ];
    expect(reactionRestUntil("wave", rows)).toBeNull();
    expect(reactionRestUntil("photo", rows)).toBeNull();
  });

  it("shows no countdown without a clock", () => {
    expect(reactionRestSeconds("wave", [crowd("wave", 100)], Number.NaN)).toBe(0);
  });

  it("finds a booking that appeared after a request left", () => {
    const before = [crowd("wave", 20)];
    expect(newCrowdBooking("wave", before, [crowd("wave", 20), crowd("wave", 150)])).toBe(150);
    expect(newCrowdBooking("wave", before, before)).toBeNull();
    expect(newCrowdBooking("water", before, [crowd("wave", 150)])).toBeNull();
    expect(newCrowdBooking("photo", [], [{ kind: "photo", atActiveSecond: 9, source: "system" }])).toBeNull();
  });
});
