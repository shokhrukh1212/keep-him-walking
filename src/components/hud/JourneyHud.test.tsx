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
  it("counts people with the site open during the prelaunch preview", () => {
    render(<JourneyHud day={day} localTime="12:00" activeViewers={null} onlineVisitors={5} status="scheduled" preview
      audienceOpen={false} onAudienceOpen={noop} onJourneyOpen={noop} soundControl={sound} />);
    expect(screen.getByRole("button", { name: "Open Journey from Paris" })).toHaveTextContent("Getting ready in Paris");
    expect(screen.getByRole("button", { name: "5 people watching" })).toBeInTheDocument();
    expect(screen.queryByTestId("season-clock")).toBeNull();
    expect(screen.getByRole("button", { name: "Ambient sound off" })).toBeInTheDocument();
  });

  it("shows the confirmed watchers before DataFast has answered", () => {
    render(<JourneyHud day={day} localTime="12:00" activeViewers={2} onlineVisitors={undefined} status="live"
      audienceOpen={false} onAudienceOpen={noop} onJourneyOpen={noop} soundControl={sound} />);
    expect(screen.getByRole("button", { name: "2 people watching" })).toBeInTheDocument();
  });

  it("shows no count while neither source has answered", () => {
    render(<JourneyHud day={day} localTime="12:00" activeViewers={null} onlineVisitors={undefined} status="live"
      audienceOpen={false} onAudienceOpen={noop} onJourneyOpen={noop} soundControl={sound} />);
    expect(screen.queryByText(/watching$|live count/i)).toBeNull();
  });

  it("never says nobody is watching while the server has confirmed watchers", () => {
    // Reproduced on production, 18 September: DataFast answered 0 for three
    // confirmed leases, so the header denied the rule printed beneath it.
    render(<JourneyHud day={day} localTime="12:00" activeViewers={3} onlineVisitors={0} status="live"
      audienceOpen={false} onAudienceOpen={noop} onJourneyOpen={noop} soundControl={sound} />);
    expect(screen.getByRole("button", { name: "3 people watching" })).toBeInTheDocument();
  });

  it("falls back to the confirmed watchers when DataFast could not be read", () => {
    render(<JourneyHud day={day} localTime="12:00" activeViewers={4} onlineVisitors={null} status="live"
      audienceOpen={false} onAudienceOpen={noop} onJourneyOpen={noop} soundControl={sound} />);
    expect(screen.getByRole("button", { name: "4 people watching" })).toBeInTheDocument();
  });

  it("keeps a really configured start beside the preview headline", () => {
    render(<JourneyHud day={day} localTime="12:00" activeViewers={null} onlineVisitors={1} status="scheduled" preview
      seasonClock={{ where: "Season 1", when: "Starts in 2d 4h" }}
      audienceOpen={false} onAudienceOpen={noop} onJourneyOpen={noop} soundControl={sound} />);
    expect(screen.getByRole("button", { name: "Open Journey from Paris" })).toHaveTextContent("Getting ready in Paris");
    expect(screen.getByTestId("season-clock")).toHaveTextContent("Season 1 · Starts in 2d 4h");
    expect(screen.getByRole("button", { name: "1 person watching" })).toBeInTheDocument();
  });

  it("says the count is unavailable when neither source could be read", () => {
    render(<JourneyHud day={day} localTime="12:00" activeViewers={null} onlineVisitors={null} status="offline"
      audienceOpen={false} onAudienceOpen={noop} onJourneyOpen={noop} soundControl={sound} />);
    expect(screen.getByRole("button", { name: "Open Journey from Paris" })).toHaveTextContent("Paris · Day 1");
    expect(screen.getByRole("button", { name: "Live count unavailable" })).toBeInTheDocument();
  });

  it("keeps the server's confirmed watchers apart from the visitor count", () => {
    const { container } = render(<JourneyHud day={day} localTime="12:00" activeViewers={2} onlineVisitors={9} status="live"
      audienceOpen={false} onAudienceOpen={noop} onJourneyOpen={noop} soundControl={sound} />);
    expect(screen.getByRole("button", { name: "9 people watching" })).toBeInTheDocument();
    expect(container.querySelector("header")).toHaveAttribute("data-confirmed-watchers", "2");
  });
});
