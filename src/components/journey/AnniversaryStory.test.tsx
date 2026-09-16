import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { VoteView } from "@/lib/contracts";
import { AnniversaryStory } from "./AnniversaryStory";

function poll(overrides: Partial<VoteView> = {}): VoteView {
  return {
    id: "poll", question: "Choose the anniversary setting", kind: "anniversary",
    opensAt: "2026-09-23T19:00:00.000Z", closesAt: "2026-09-28T15:00:00.000Z",
    status: "open", totalBallots: 3, selectedOptionId: null, resultOptionId: null,
    options: [
      { id: "park", label: "A park in Tashkent", displayOrder: 0, packId: null, countryCode: null, blurb: null, votes: 2 },
      { id: "cafe", label: "A café in Tashkent", displayOrder: 1, packId: null, countryCode: null, blurb: null, votes: 1 },
      { id: "view", label: "A scenic spot in Tashkent", displayOrder: 2, packId: null, countryCode: null, blurb: null, votes: 0 },
    ],
    ...overrides,
  };
}

const base = { coffeeUrl: "https://buymeacoffee.com/keephimwalking", onVote: vi.fn(), onSponsor: vi.fn() };

describe("AnniversaryStory", () => {
  it("tells the story with dates, keeps the virtual journey apart from the real plan, and ties nothing to money", () => {
    render(<AnniversaryStory {...base} progress="Starts in 9h 12m" completed={false} vote={null} nowMs={Date.parse("2026-09-16T09:48:00Z")} />);
    expect(screen.getByText(/My first wedding anniversary is October 1\./)).toBeInTheDocument();
    expect(screen.getByText("Starts in 9h 12m")).toBeInTheDocument();
    expect(screen.getByText(/Travel: September 17–30 · Anniversary: October 1/)).toBeInTheDocument();
    expect(screen.getByText(/virtual.*does not depend on any payment or target/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Buy him a coffee/ })).toHaveAttribute("target", "_blank");
    expect(screen.getByTestId("anniversary-vote")).toHaveAttribute("data-poll-phase", "upcoming");
    expect(screen.getByText(/Voting opens September 24 and closes September 28 at 20:00 Tashkent time/)).toBeInTheDocument();
    expect(screen.queryByTestId("anniversary-update")).toBeNull();
  });

  it("offers the vote while it is open", () => {
    render(<AnniversaryStory {...base} progress="Day 8 of 14" completed={false} vote={poll()} nowMs={Date.parse("2026-09-24T10:00:00Z")} />);
    expect(screen.getByTestId("anniversary-vote")).toHaveAttribute("data-poll-phase", "open");
    expect(screen.getByRole("button", { name: "Vote" })).toBeInTheDocument();
  });

  it("keeps the results after the vote closes and shows the October 1 update", () => {
    render(<AnniversaryStory {...base} progress="Journey complete" completed vote={poll({ status: "closed", resultOptionId: "park" })} nowMs={Date.parse("2026-09-30T19:00:00Z")} />);
    expect(screen.getByTestId("anniversary-vote")).toHaveAttribute("data-poll-phase", "closed");
    expect(screen.getByText("A park in Tashkent", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("2 votes · 67%")).toBeInTheDocument();
    expect(screen.getByTestId("anniversary-update")).toHaveTextContent("My anniversary update will be posted here.");
  });

  it("closes the vote on the clock even before the stored status catches up", () => {
    render(<AnniversaryStory {...base} progress="Day 12 of 14" completed={false} vote={poll()} nowMs={Date.parse("2026-09-28T15:00:00Z")} />);
    expect(screen.getByTestId("anniversary-vote")).toHaveAttribute("data-poll-phase", "closed");
    expect(screen.queryByRole("button", { name: "Vote" })).toBeNull();
  });
});
