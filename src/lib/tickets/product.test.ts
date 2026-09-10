import { describe, expect, it } from "vitest";
import { ticketDayIsEligible, ticketPriceCents } from "./product";

describe("Ticket product", () => {
  it("uses the $249 floor until three times the stored day price exceeds it", () => {
    expect(ticketPriceCents(4_900)).toBe(24_900);
    expect(ticketPriceCents(10_000)).toBe(30_000);
  });

  it("opens in week two and only from D+3 through the configured horizon", () => {
    expect(ticketDayIsEligible({ currentDay: 7, targetDay: 10, horizonDays: 7 })).toBe(false);
    expect(ticketDayIsEligible({ currentDay: 8, targetDay: 10, horizonDays: 7 })).toBe(false);
    expect(ticketDayIsEligible({ currentDay: 8, targetDay: 11, horizonDays: 7 })).toBe(true);
    expect(ticketDayIsEligible({ currentDay: 8, targetDay: 16, horizonDays: 7 })).toBe(false);
  });
});
