import { expect, it } from "vitest";
import { nextDayPackIdForWinner, planNextDay } from "./next-day";

it("starts the next day at the previous day's end, including a late cron invocation", () => {
  const endedAt = new Date("2026-09-09T16:00:00Z");
  const plan = planNextDay({ winnerPackId: "dushanbe-v1", dayNumber: 2, visitedCountryCodes: ["UZ"], startsAt: endedAt });
  expect(plan?.day.startsAt).toBe("2026-09-09T16:00:00.000Z");
  expect(plan?.day.endsAt).toBe("2026-09-10T16:00:00.000Z");
  expect(endedAt.toISOString()).toBe("2026-09-09T16:00:00.000Z");
});

it("takes the fixed Dushanbe leg after the Day 1 name vote", () => {
  expect(nextDayPackIdForWinner({ state: "closed", kind: "name", winnerPackId: null }))
    .toBe("dushanbe-v1");
  expect(nextDayPackIdForWinner({ state: "closed", kind: "destination", winnerPackId: "bishkek-v1" }))
    .toBe("bishkek-v1");
  expect(nextDayPackIdForWinner({ state: "no_closing_vote" })).toBeNull();
});
