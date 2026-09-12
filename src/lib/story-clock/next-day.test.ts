import { expect, it } from "vitest";
import { nextDayPackId, nextDayPackIdForWinner, planNextDay } from "./next-day";

it("starts the next day at the previous day's end, including a late cron invocation", () => {
  const endedAt = new Date("2026-09-09T16:00:00Z");
  const plan = planNextDay({ winnerPackId: "dushanbe-v1", dayNumber: 2, visitedCountryCodes: ["UZ"], startsAt: endedAt });
  expect(plan?.day.startsAt).toBe("2026-09-09T16:00:00.000Z");
  expect(plan?.day.endsAt).toBe("2026-09-10T16:00:00.000Z");
  expect(endedAt.toISOString()).toBe("2026-09-09T16:00:00.000Z");
});

it("starts a ticket day from its fixed country and continues candidates from there", () => {
  const packId = nextDayPackId(
    { state: "closed", kind: "destination", winnerPackId: "bishkek-v1" },
    "tbilisi-v1",
  );
  expect(packId).toBe("tbilisi-v1");
  const plan = planNextDay({ winnerPackId: packId!, dayNumber: 14, visitedCountryCodes: ["UZ", "TJ"], startsAt: new Date("2026-09-22T16:00:00Z") });
  expect(plan?.day.scenePackId).toBe("tbilisi-v1");
  expect(plan?.vote?.options.map((option) => option.packId)).toContain("istanbul-v1");
});

it("takes the fixed Paris train leg after the Day 1 name vote", () => {
  expect(nextDayPackIdForWinner({ state: "closed", kind: "name", winnerPackId: null }))
    .toBe("paris-v2");
  expect(nextDayPackIdForWinner({ state: "closed", kind: "destination", winnerPackId: "bishkek-v1" }))
    .toBe("bishkek-v1");
  expect(nextDayPackIdForWinner({ state: "no_closing_vote" })).toBeNull();
});
