import { expect, it } from "vitest";
import { planNextDay } from "./next-day";

it("starts the next day at the previous day's end, including a late cron invocation", () => {
  const endedAt = new Date("2026-09-09T16:00:00Z");
  const plan = planNextDay({ winnerPackId: "dushanbe-v1", dayNumber: 2, visitedCountryCodes: ["UZ"], startsAt: endedAt });
  expect(plan?.day.startsAt).toBe("2026-09-09T16:00:00.000Z");
  expect(plan?.day.endsAt).toBe("2026-09-10T16:00:00.000Z");
  expect(endedAt.toISOString()).toBe("2026-09-09T16:00:00.000Z");
});
