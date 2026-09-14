import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CountryDayView } from "@/lib/contracts";
import { JourneyHud } from "./JourneyHud";

const day: CountryDayView = {
  id: "10000000-0000-4000-8000-000000000001",
  dayNumber: 1,
  totalDays: 7,
  countryCode: "FR",
  countryName: "France",
  cityName: "Paris",
  timeZone: "Europe/Paris",
  startsAt: "2026-09-14T16:00:00Z",
  endsAt: "2026-09-15T16:00:00Z",
  storySummary: null,
  scenePackId: "paris-v3",
};
const noop = () => undefined;
const sound = <button type="button">Ambient sound off</button>;

describe("JourneyHud", () => {
  it("names the prelaunch preview and shows no audience count", () => {
    render(<JourneyHud day={day} localTime="12:00" activeViewers={null} status="scheduled" preview
      audienceOpen={false} onAudienceOpen={noop} onJourneyOpen={noop} soundControl={sound} />);
    expect(screen.getByRole("button", { name: "Open Journey from Paris" })).toHaveTextContent("Paris · Preview");
    // The premise line stays; no audience count or "unavailable" live count is shown.
    expect(screen.queryByText(/people watching|person watching|live count/i)).toBeNull();
    expect(screen.queryByTestId("season-clock")).toBeNull();
    expect(screen.getByRole("button", { name: "Ambient sound off" })).toBeInTheDocument();
  });

  it("keeps a really configured start beside the preview headline", () => {
    render(<JourneyHud day={day} localTime="12:00" activeViewers={null} status="scheduled" preview
      seasonClock={{ where: "Season 1", when: "Starts in 2d 4h" }} launchCountdown="in 2d 4h"
      audienceOpen={false} onAudienceOpen={noop} onJourneyOpen={noop} soundControl={sound} />);
    expect(screen.getByRole("button", { name: "Open Journey from Paris" })).toHaveTextContent("Paris · Preview");
    expect(screen.getByTestId("season-clock")).toHaveTextContent("Season 1 · Starts in 2d 4h");
  });

  it("still says a live count is unavailable outside the prelaunch preview", () => {
    render(<JourneyHud day={day} localTime="12:00" activeViewers={null} status="offline"
      audienceOpen={false} onAudienceOpen={noop} onJourneyOpen={noop} soundControl={sound} />);
    expect(screen.getByRole("button", { name: "Open Journey from Paris" })).toHaveTextContent("Paris · Day 1");
    expect(screen.getByRole("button", { name: "Live count unavailable" })).toBeInTheDocument();
  });
});
