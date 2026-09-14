import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SeasonView } from "@/lib/contracts";
import { JourneyHud } from "@/components/hud/JourneyHud";
import { SeasonCompleteCard } from "./SeasonCompleteCard";

const season: SeasonView = {
  id: "season-1",
  number: 1,
  title: "Season 1",
  startsAt: "2026-09-23T16:00:00.000Z",
  endsAt: "2026-09-30T16:00:00.000Z",
  totalDays: 7,
  state: "completed",
  recap: {
    distanceMetres: 42_345,
    finalizedDays: 7,
    totalDays: 7,
    citiesWalked: [
      { dayNumber: 1, cityName: "Paris", countryCode: "FR" },
      { dayNumber: 2, cityName: "Prague", countryCode: "CZ" },
    ],
  },
  next: null,
};

describe("SeasonCompleteCard", () => {
  it("shows confirmed totals and nothing about a next season that is not configured", () => {
    render(<SeasonCompleteCard season={season} sponsor={null} />);
    expect(screen.getByText("Season 1 complete")).toBeInTheDocument();
    expect(screen.getByText("42.3 km")).toBeInTheDocument();
    expect(screen.getByText(/2 of 7 cities walked/)).toBeInTheDocument();
    expect(screen.getByText("Paris · Prague")).toBeInTheDocument();
    expect(screen.queryByText(/starts/i)).toBeNull();
    expect(screen.queryByText(/confirmed so far/)).toBeNull();
  });

  it("acknowledges the season's sponsor and gives the return date only when configured", () => {
    render(<SeasonCompleteCard
      season={{ ...season, recap: { ...season.recap!, finalizedDays: 6 }, next: { number: 2, title: "Season 2", startsAt: "2026-10-07T16:00:00.000Z" } }}
      sponsor={{ publicId: "p", seasonNumber: 1, name: "Acme", description: "Maps.", logoUrl: "https://x.y/l.webp", href: "/r/season-sponsor/p", state: "completed" }}
    />);
    expect(screen.getByRole("link", { name: "Acme ↗" })).toHaveAttribute("target", "_blank");
    expect(screen.getByText("Season 2 starts Wed 7 Oct 2026, 16:00 UTC.")).toBeInTheDocument();
    expect(screen.getByText(/confirmed so far/)).toBeInTheDocument();
  });
});

describe("JourneyHud season line", () => {
  const day = {
    id: "d", dayNumber: 3, totalDays: 7, countryCode: "SI", countryName: "Slovenia", cityName: "Ljubljana",
    timeZone: "Europe/Ljubljana", startsAt: "", endsAt: "", storySummary: null, scenePackId: "ljubljana-v1",
  };
  const base = { day, localTime: "04:27", activeViewers: 1, onlineVisitors: 1, status: "live" as const, audienceOpen: false, onAudienceOpen: () => undefined, onJourneyOpen: () => undefined };

  it("keeps the daily headline without a season", () => {
    render(<JourneyHud {...base} />);
    expect(screen.getByText("Ljubljana · Day 3")).toBeInTheDocument();
    expect(screen.queryByTestId("season-clock")).toBeNull();
  });

  it("names the city and lets the season clock carry the day and the end", () => {
    render(<JourneyHud {...base} seasonClock={{ where: "Season 1 · Day 3 of 7", when: "Ends in 4d 6h" }} />);
    expect(screen.getByText("Ljubljana")).toBeInTheDocument();
    expect(screen.getByTestId("season-clock")).toHaveTextContent("Season 1 · Day 3 of 7 · Ends in 4d 6h");
    expect(screen.getByText("1 person watching")).toBeInTheDocument();
  });

  it("keeps counting people with the site open once a season is complete", () => {
    render(<JourneyHud {...base} activeViewers={null} onlineVisitors={4} seasonClock={{ where: "Season 1", when: "Season complete" }} />);
    expect(screen.getByTestId("season-clock")).toHaveTextContent("Season 1 · Season complete");
    expect(screen.getByRole("button", { name: "4 people watching" })).toBeInTheDocument();
  });
});
