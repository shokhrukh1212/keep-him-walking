import { describe, expect, it } from "vitest";
import { journeyCalendarEvent } from "./calendar";

describe("journey calendar", () => {
  it("uses UTC timestamps and escapes text", () => {
    const event = journeyCalendarEvent({ cityName: "Tbilisi", countryName: "Georgia", startsAt: new Date("2026-09-08T00:00:00Z"), endsAt: new Date("2026-09-09T00:00:00Z"), url: "https://example.com" });
    expect(event).toContain("DTSTART:20260908T000000Z");
    expect(event).toContain("SUMMARY:Keep Him Walking — Tbilisi");
    expect(event).toContain("END:VCALENDAR\r\n");
  });
});
