import { describe, expect, it } from "vitest";
import {
  ANNIVERSARY_JOURNEY, ANNIVERSARY_LABELS, anniversaryDayAt, anniversaryPhaseAt, pollPhaseAt, tashkentMidnightUtc,
} from "./anniversary";

const at = (iso: string) => Date.parse(iso);

describe("the Anniversary Journey calendar", () => {
  it("turns Tashkent midnights into 19:00 UTC on the previous date", () => {
    expect(tashkentMidnightUtc("2026-09-17")).toBe("2026-09-16T19:00:00.000Z");
    expect(tashkentMidnightUtc("2026-10-01")).toBe("2026-09-30T19:00:00.000Z");
    expect(() => tashkentMidnightUtc("17 September")).toThrow();
    expect(() => tashkentMidnightUtc("2026-02-30")).toThrow();
  });

  it("names the owner's instants", () => {
    expect(ANNIVERSARY_JOURNEY).toMatchObject({
      totalDays: 14,
      daysPerCity: 1,
      previewStartsAt: "2026-09-16T18:00:00.000Z",
      travelStartsAt: "2026-09-17T18:00:00.000Z",
      travelEndsAt: "2026-10-01T18:00:00.000Z",
      boundaryUtcHour: 18,
    });
    expect(ANNIVERSARY_JOURNEY.poll.opensAt).toBe("2026-09-24T18:00:00.000Z");
    expect(ANNIVERSARY_JOURNEY.poll.closesAt).toBe("2026-09-28T15:00:00.000Z");
    expect(ANNIVERSARY_LABELS).toMatchObject({
      travelStarts: "September 17", lastTravelDay: "September 30", anniversary: "October 1",
      pollOpens: "September 24", pollCloses: "September 28",
    });
  });

  it("is a preview until 23:00 Tashkent, then Day 1", () => {
    expect(anniversaryPhaseAt(at("2026-09-17T17:59:59.999Z"))).toBe("preview");
    expect(anniversaryDayAt(at("2026-09-17T17:59:59.999Z"))).toBeNull();
    expect(anniversaryPhaseAt(at("2026-09-17T18:00:00.000Z"))).toBe("travel");
    expect(anniversaryDayAt(at("2026-09-17T18:00:00.000Z"))).toBe(1);
  });

  it("reaches Day 14 on 30 September and the anniversary at 23:00 Tashkent on 1 October", () => {
    expect(anniversaryDayAt(at("2026-09-30T18:00:00.000Z"))).toBe(14);
    expect(anniversaryDayAt(at("2026-10-01T17:59:59.999Z"))).toBe(14);
    expect(anniversaryPhaseAt(at("2026-10-01T18:00:00.000Z"))).toBe("anniversary");
    expect(anniversaryDayAt(at("2026-10-01T18:00:00.000Z"))).toBeNull();
    expect(anniversaryPhaseAt(at("2026-11-01T00:00:00.000Z"))).toBe("anniversary");
  });

  it("opens the poll on 24 September and closes it at 20:00 Tashkent on 28 September", () => {
    expect(pollPhaseAt(at("2026-09-24T17:59:59.999Z"))).toBe("upcoming");
    expect(pollPhaseAt(at("2026-09-24T18:00:00.000Z"))).toBe("open");
    expect(pollPhaseAt(at("2026-09-28T14:59:59.999Z"))).toBe("open");
    expect(pollPhaseAt(at("2026-09-28T15:00:00.000Z"))).toBe("closed");
  });
});
