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
      dailyGoalMetres={8_000}
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
    expect(screen.getByText("Today · ~4.0 / 8 km")).toBeInTheDocument();
    expect(screen.getByText("estimated")).toBeInTheDocument();
    expect(container.querySelector(".goal-track span")).toHaveStyle({ width: "50%" });
  });

  it("does not invent a distance before the live server confirms one", () => {
    const { container } = renderBar({ distanceMetres: null, freshness: "unavailable" });
    expect(screen.getByText("Today · distance unavailable")).toBeInTheDocument();
    expect(screen.getByText("unavailable")).toBeInTheDocument();
    expect(container.querySelector(".goal-track span")).not.toBeInTheDocument();
    expect(screen.queryByText(/0\.0 \/ 8 km/)).not.toBeInTheDocument();
  });

  it("explains that a marathon follows today's goal", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByRole("button", { name: "About the distance goals" }));
    expect(screen.getByRole("note")).toHaveTextContent("8 km is today's shared goal");
    expect(screen.getByRole("note")).toHaveTextContent("42.2 km marathon");
  });

  it("moves the landing bar on to the marathon once today's goal is reached", () => {
    const { container } = renderBar({ distanceMetres: 9_100, freshness: "last confirmed" });
    expect(screen.getByText("Today · 9.1 / 42.2 km marathon")).toBeInTheDocument();
    expect(screen.getByText("confirmed")).toBeInTheDocument();
    // 9,100 of 42,195: the bar restarts against the new goal instead of sitting full.
    expect(container.querySelector(".goal-track span")).toHaveStyle({ width: "21.566536319469133%" });
    expect(container.querySelector(".goal-bar")).toHaveAttribute("data-goal", "marathon");
  });

  it("says the marathon is the goal now, once it is the one being counted", async () => {
    const user = userEvent.setup();
    renderBar({ distanceMetres: 9_100 });
    await user.click(screen.getByRole("button", { name: "About the distance goals" }));
    expect(screen.getByRole("note")).toHaveTextContent("the goal is now a 42.2 km marathon");
    expect(screen.getByRole("note")).not.toHaveTextContent("After that, the next goal");
  });

  it("stops counting against a goal once the marathon itself is reached", () => {
    const { container } = renderBar({ distanceMetres: 43_000, freshness: "last confirmed" });
    expect(screen.getByText("Today · 43.0 km · marathon reached")).toBeInTheDocument();
    expect(container.querySelector(".goal-track span")).toHaveStyle({ width: "100%" });
    expect(container.querySelector(".goal-bar")).toHaveAttribute("data-goal", "complete");
  });

  it("uses truthful summary copy for non-walking states", () => {
    const { rerender } = renderBar({ walking: false, activityLabel: "Talking with Camille", activityTone: "stopped" });
    expect(screen.getByText("Talking with Camille.")).toBeInTheDocument();
    expect(screen.getByText(/Next scene in ~5 walking min/)).toBeInTheDocument();
    rerender(<GoalBar walking={false} activityLabel="Season complete" activityTone="complete" distanceMetres={null} dailyGoalMetres={8_000} marathonMetres={42_195} freshness="unavailable" placeCount={10} currentPlaceIndex={9} secondsToNextVisit={0} />);
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
    expect(screen.getByText("The journey starts when the host gives the signal.")).toBeInTheDocument();
    expect(container.querySelector(".goal-distance")).not.toBeInTheDocument();
    expect(screen.queryByText(/unavailable/)).not.toBeInTheDocument();
  });
});
