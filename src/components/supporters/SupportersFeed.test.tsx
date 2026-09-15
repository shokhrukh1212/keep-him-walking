import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SupportersFeed } from "./SupportersFeed";

describe("SupportersFeed", () => {
  it("shows an honest empty state until the owner adds an acknowledgment", () => {
    render(<SupportersFeed acknowledgments={[]} />);
    expect(screen.getByText(/No public supporters yet/)).toBeInTheDocument();
  });

  it("uses exact manually confirmed counts and otherwise avoids calculating cups", () => {
    render(<SupportersFeed acknowledgments={[
      { id: "alex", occurredAt: "2034-01-01T00:00:00Z", displayName: "Alex", coffeeCount: 3 },
      { id: "sam", occurredAt: "2034-01-02T00:00:00Z", displayName: "Sam", coffeeCount: null },
    ]} />);
    expect(screen.getByText("Alex bought 3 coffees")).toBeInTheDocument();
    expect(screen.getByText("Sam supported the journey")).toBeInTheDocument();
  });
});
