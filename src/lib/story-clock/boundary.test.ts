import { describe, expect, it } from "vitest";
import { logicalDayBoundaryAtOrBefore, minuteReconciliationPlan } from "./boundary";

describe("logical day reconciliation", () => {
  it("never shifts the 16:00 UTC boundary when a job is late", () => {
    expect(logicalDayBoundaryAtOrBefore(new Date("2026-09-12T16:37:11Z")).toISOString())
      .toBe("2026-09-12T16:00:00.000Z");
    expect(logicalDayBoundaryAtOrBefore(new Date("2026-09-12T15:59:59Z")).toISOString())
      .toBe("2026-09-11T16:00:00.000Z");
  });

  it("prewarms only in the five-minute window and always identifies catch-up", () => {
    expect(minuteReconciliationPlan(new Date("2026-09-12T15:54:00Z")).prewarmDue).toBe(false);
    expect(minuteReconciliationPlan(new Date("2026-09-12T15:55:00Z")).prewarmDue).toBe(true);
    expect(minuteReconciliationPlan(new Date("2026-09-12T16:00:00Z"))).toEqual({
      boundary: new Date("2026-09-12T16:00:00Z"),
      prewarmDue: false,
    });
  });
});
