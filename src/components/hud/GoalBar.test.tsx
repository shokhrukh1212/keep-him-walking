import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { GoalBar } from "./GoalBar";

const places = [
  { id: "gare", label: "Gare du Nord" },
  { id: "canal", label: "Canal Saint-Martin", description: "Footbridges over green water." },
  { id: "marais", label: "Marais market street" },
];

function renderBar(overrides: Partial<ComponentProps<typeof GoalBar>> = {}) {
  return render(
    <GoalBar
      distanceMetres={4_000}
      dailyGoalMetres={8_000}
      marathonMetres={42_195}
      freshness="extrapolated"
      places={places}
      currentPlaceIndex={1}
      secondsToNextVisit={250}
      visitSeconds={420}
      {...overrides}
    />,
  );
}

describe("GoalBar", () => {
  it("states the shared distance, the goal and how fresh the number is", () => {
    const { container } = renderBar();
    expect(screen.getByLabelText("4.0 / 8 km together · 50%")).toBeInTheDocument();
    expect(screen.getByText("extrapolated")).toBeInTheDocument();
    expect(container.querySelector(".goal-track span")).toHaveStyle({ width: "50%" });
  });

  it("does not invent a distance before the live server confirms one", () => {
    const { container } = renderBar({ distanceMetres: null, freshness: "unavailable" });
    expect(screen.getByLabelText("Daily distance unavailable")).toBeInTheDocument();
    expect(screen.getByText("unavailable")).toBeInTheDocument();
    expect(container.querySelector(".goal-track span")).not.toBeInTheDocument();
    expect(container.querySelector(".goal-bar")).toHaveAttribute("data-marathon", "false");
    expect(screen.queryByText(/0\.0 \/ 8 km/)).not.toBeInTheDocument();
  });

  it("generates one dot per place and marks the current stop", () => {
    renderBar();
    expect(screen.getByRole("list")).toHaveAccessibleName("Stop 2 of 3. Next place in about 5 minutes of walking.");
    expect(screen.getAllByRole("button", { name: /^Stop \d of 3/ })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Stop 2 of 3, Canal Saint-Martin, you are here" }))
      .toHaveAttribute("aria-current", "step");
  });

  it("describes a tapped place without moving the traveler there", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByRole("button", { name: "Stop 3 of 3, Marais market street" }));
    expect(screen.getByRole("status")).toHaveTextContent("Marais market street");
    expect(screen.getByRole("status")).toHaveTextContent("In ~5 walking min");
    expect(screen.getByRole("button", { name: "Stop 2 of 3, Canal Saint-Martin, you are here" }))
      .toHaveAttribute("aria-current", "step");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("explains that a marathon follows today's goal", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByRole("button", { name: "About the distance goals" }));
    expect(screen.getByRole("note")).toHaveTextContent("8 km is today's shared goal");
    expect(screen.getByRole("note")).toHaveTextContent("42.2 km marathon");
  });

  it("measures against the marathon once the daily goal is behind him", () => {
    const { container } = renderBar({ distanceMetres: 9_100, freshness: "last confirmed" });
    expect(screen.getByLabelText("9.1 / 42.2 km together · 21%")).toBeInTheDocument();
    expect(container.querySelector(".goal-bar")).toHaveAttribute("data-marathon", "true");
  });
});
