import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { GoalBar } from "./GoalBar";

function renderBar(overrides: Partial<ComponentProps<typeof GoalBar>> = {}) {
  return render(
    <GoalBar
      distanceMetres={4_000}
      walking
      activityLabel="Walking to Canal Saint-Martin"
      activityTone="walking"
      dailyGoalMetres={129_600}
      marathonMetres={42_195}
      freshness="extrapolated"
      placeCount={10}
      currentPlaceIndex={1}
      secondsToNextVisit={250}
      {...overrides}
    />,
  );
}

describe("GoalBar", () => {
  it("states the shared distance, the goal and how fresh the number is", () => {
    const { container } = renderBar();
    expect(screen.getByText("Walking to Canal Saint-Martin.")).toBeInTheDocument();
    expect(screen.getByText("Stop 2 of 10 · Next scene in ~5 walking min")).toBeInTheDocument();
    expect(screen.getByText("Today · ~4.0 / 129.6 km")).toBeInTheDocument();
    expect(screen.getByText("estimated")).toBeInTheDocument();
    // 4,000 of 129,600.
    expect(container.querySelector(".goal-track span")).toHaveStyle({ width: "3.0864197530864197%" });
  });

  it("does not invent a distance before the live server confirms one", () => {
    const { container } = renderBar({ distanceMetres: null, freshness: "unavailable" });
    expect(screen.getByText("Today · distance unavailable")).toBeInTheDocument();
    expect(screen.getByText("unavailable")).toBeInTheDocument();
    expect(container.querySelector(".goal-track span")).not.toBeInTheDocument();
    expect(screen.queryByText(/0\.0 \/ 129\.6 km/)).not.toBeInTheDocument();
  });

  it("explains the whole-day goal and the marathon on the way", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByRole("button", { name: "About the distance goals" }));
    expect(screen.getByRole("note")).toHaveTextContent("129.6 km is the whole day");
    expect(screen.getByRole("note")).toHaveTextContent("The 42.2 km marathon is a milestone on the way.");
  });

  it("keeps counting against the same day goal past 8 km", () => {
    const { container } = renderBar({ distanceMetres: 9_100, freshness: "last confirmed" });
    expect(screen.getByText("Today · 9.1 / 129.6 km")).toBeInTheDocument();
    expect(screen.getByText("confirmed")).toBeInTheDocument();
    expect(container.querySelector(".goal-bar")).toHaveAttribute("data-goal", "daily");
  });

  it("names the marathon once he passes it, without restarting the bar", async () => {
    const user = userEvent.setup();
    const { container } = renderBar({ distanceMetres: 43_000, freshness: "last confirmed" });
    expect(screen.getByText("Today · 43.0 / 129.6 km · marathon reached")).toBeInTheDocument();
    expect(container.querySelector(".goal-track span")).toHaveStyle({ width: "33.17901234567901%" });
    await user.click(screen.getByRole("button", { name: "About the distance goals" }));
    expect(screen.getByRole("note")).toHaveTextContent("The 42.2 km marathon is already behind him today.");
    expect(screen.getByRole("note")).not.toHaveTextContent("milestone on the way");
  });

  it("says the whole day was walked once the goal is reached", () => {
    const { container } = renderBar({ distanceMetres: 129_600, freshness: "last confirmed" });
    expect(screen.getByText("Today · 129.6 km · whole day walked")).toBeInTheDocument();
    expect(container.querySelector(".goal-track span")).toHaveStyle({ width: "100%" });
    expect(container.querySelector(".goal-bar")).toHaveAttribute("data-goal", "complete");
  });

  it("uses truthful summary copy for non-walking states", () => {
    const { rerender } = renderBar({ walking: false, activityLabel: "Talking with Camille", activityTone: "stopped" });
    expect(screen.getByText("Talking with Camille.")).toBeInTheDocument();
    expect(screen.getByText(/Next scene in ~5 walking min/)).toBeInTheDocument();
    rerender(<GoalBar walking={false} activityLabel="Season complete" activityTone="complete" distanceMetres={null} dailyGoalMetres={129_600} marathonMetres={42_195} freshness="unavailable" placeCount={10} currentPlaceIndex={9} secondsToNextVisit={0} />);
    expect(screen.getByText("Journey complete.")).toBeInTheDocument();
  });

  it("shows no distance at all before launch, only that the journey has not started", () => {
    const { container } = renderBar({
      walking: false,
      activityLabel: "Season 1 is preparing to begin.",
      activityTone: "prelaunch",
      distanceMetres: null,
      freshness: "unavailable",
    });
    expect(screen.getByText("Season 1 is preparing to begin.")).toBeInTheDocument();
    expect(screen.getByText("Milo is getting ready for his first walk.")).toBeInTheDocument();
    expect(container.querySelector(".goal-distance")).not.toBeInTheDocument();
    expect(screen.queryByText(/unavailable/)).not.toBeInTheDocument();
  });

});
