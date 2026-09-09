import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VoteChip, ballotPercentages } from "./VoteChip";
import type { VoteView } from "@/lib/contracts";

function vote(overrides: Partial<VoteView> = {}): VoteView {
  return {
    id: "vote-1",
    question: "Where should he walk tomorrow?",
    kind: "destination",
    opensAt: "2026-09-24T16:00:00Z",
    closesAt: "2026-09-25T16:00:00Z",
    status: "open",
    totalBallots: 25,
    selectedOptionId: null,
    resultOptionId: null,
    options: [
      { id: "a", label: "Georgia", displayOrder: 0, packId: "tbilisi-v1", countryCode: "GE", blurb: null, votes: 13 },
      { id: "b", label: "Türkiye", displayOrder: 1, packId: "istanbul-v1", countryCode: "TR", blurb: null, votes: 12 },
    ],
    ...overrides,
  };
}

describe("ballotPercentages", () => {
  it("splits the ballot into whole percentages that sum to 100", () => {
    const percentages = ballotPercentages(vote());
    expect(percentages.get("a")).toBe(52);
    expect(percentages.get("b")).toBe(48);
  });

  it("still sums to 100 with a three-way split", () => {
    const three = vote({
      options: [
        { id: "a", label: "A", displayOrder: 0, packId: null, countryCode: null, blurb: null, votes: 1 },
        { id: "b", label: "B", displayOrder: 1, packId: null, countryCode: null, blurb: null, votes: 1 },
        { id: "c", label: "C", displayOrder: 2, packId: null, countryCode: null, blurb: null, votes: 1 },
      ],
    });
    const percentages = ballotPercentages(three);
    const total = [...percentages.values()].reduce((sum, value) => sum + value, 0);
    expect(total).toBe(100);
  });

  it("shows zero rather than inventing a split before anyone votes", () => {
    const empty = vote({
      options: vote().options.map((option) => ({ ...option, votes: 0 })),
    });
    expect([...ballotPercentages(empty).values()]).toEqual([0, 0]);
  });
});

describe("VoteChip", () => {
  it("shows the candidate flags, the live split and a countdown", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
    render(<VoteChip vote={vote()} rolloverUtcHour={16} onOpen={vi.fn()} />);
    const chip = screen.getByRole("button");
    expect(chip).toHaveTextContent("🇬🇪");
    expect(chip).toHaveTextContent("🇹🇷");
    expect(chip).toHaveTextContent("52%");
    // Four hours to the 16:00 UTC rollover.
    expect(chip).toHaveTextContent("4h 0m");
    vi.useRealTimers();
  });

  it("renders nothing once the ballot has closed", () => {
    const { container } = render(
      <VoteChip vote={vote({ status: "closed" })} rolloverUtcHour={16} onOpen={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there is no ballot", () => {
    const { container } = render(<VoteChip vote={null} rolloverUtcHour={16} onOpen={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
