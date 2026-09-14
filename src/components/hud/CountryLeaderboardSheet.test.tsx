import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CountryLeaderboardSheet } from "./CountryLeaderboardSheet";

const noop = () => undefined;

describe("CountryLeaderboardSheet", () => {
  it("names the state without a second watcher count beside the header's", () => {
    render(<CountryLeaderboardSheet todayTop={[]} activeViewers={3} walking status="live" onShare={noop} />);
    expect(screen.getByText("Watchers are keeping him walking.")).toBeInTheDocument();
    expect(screen.queryByText(/\d+ watching/)).toBeNull();
  });

  it("does not count a reconnecting journey", () => {
    render(<CountryLeaderboardSheet todayTop={[]} activeViewers={3} walking={false} status="reconnecting" onShare={noop} />);
    expect(screen.getByText("Reconnecting to the live journey.")).toBeInTheDocument();
  });

  it("says the prelaunch journey has not started, and keeps a configured start", () => {
    const { rerender } = render(<CountryLeaderboardSheet todayTop={[]} activeViewers={null} walking={false} status="scheduled" preview onShare={noop} />);
    expect(screen.getByText("The journey has not started yet.")).toBeInTheDocument();
    rerender(<CountryLeaderboardSheet todayTop={[]} activeViewers={null} walking={false} status="scheduled" preview launchCountdown="in 2d 4h" onShare={noop} />);
    expect(screen.getByText("The journey starts in 2d 4h.")).toBeInTheDocument();
  });
});
