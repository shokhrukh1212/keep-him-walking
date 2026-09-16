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

  it("follows a season that turns over at Tashkent midnight (19:00 UTC)", () => {
    expect(minuteReconciliationPlan(new Date("2026-09-16T18:54:59Z"), 19).prewarmDue).toBe(false);
    expect(minuteReconciliationPlan(new Date("2026-09-16T18:55:00Z"), 19).prewarmDue).toBe(true);
    expect(minuteReconciliationPlan(new Date("2026-09-16T18:59:59Z"), 19)).toEqual({
      boundary: new Date("2026-09-15T19:00:00Z"),
      prewarmDue: true,
    });
    expect(minuteReconciliationPlan(new Date("2026-09-16T19:00:00Z"), 19)).toEqual({
      boundary: new Date("2026-09-16T19:00:00Z"),
      prewarmDue: false,
    });
    // Retries a minute or an hour late reconcile the same boundary, so the ledger dedupes them.
    expect(minuteReconciliationPlan(new Date("2026-09-16T19:01:00Z"), 19).boundary)
      .toEqual(minuteReconciliationPlan(new Date("2026-09-16T23:30:00Z"), 19).boundary);
  });
});
