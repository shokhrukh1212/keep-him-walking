import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GoalBar } from "./GoalBar";

describe("GoalBar", () => {
  it("labels extrapolated distance and the two goals", () => {
    const { container } = render(
      <GoalBar distanceMetres={4_600} landmarkMetres={8_000} marathonMetres={42_195} freshness="extrapolated" />,
    );
    expect(screen.getByText(/4.6 km/)).toHaveTextContent("extrapolated");
    expect(screen.getByText("landmark at 8 km")).toBeInTheDocument();
    expect(screen.getByText("marathon 10%")).toBeInTheDocument();
    expect(container.querySelector(".goal-track span")).toHaveStyle({ width: "57.49999999999999%" });
  });

  it("turns gold only after the confirmed marathon distance", () => {
    const { container } = render(
      <GoalBar distanceMetres={42_195} landmarkMetres={8_000} marathonMetres={42_195} freshness="last confirmed" />,
    );
    expect(container.querySelector(".goal-bar")).toHaveAttribute("data-marathon", "true");
    expect(screen.getByText("marathon 100%")).toBeInTheDocument();
  });
});
