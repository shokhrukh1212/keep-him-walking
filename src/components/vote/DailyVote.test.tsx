import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VoteView } from "@/lib/contracts";
import { DailyVote } from "./DailyVote";

const vote: VoteView = {
  id: "30000000-0000-4000-8000-000000000001",
  question: "Where should he pause next?",
  opensAt: "2026-09-01T00:00:00Z",
  closesAt: "2026-09-02T00:00:00Z",
  status: "open",
  totalBallots: 4,
  selectedOptionId: null,
  options: [
    {
      id: "40000000-0000-4000-8000-000000000001",
      label: "Find the best plov",
      displayOrder: 0,
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("DailyVote", () => {
  it("submits the selected option and reports the accepted aggregate", async () => {
    const accepted = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          accepted: true,
          selectedOptionId: vote.options[0]?.id,
          totalBallots: 5,
        }),
      }),
    );
    render(<DailyVote vote={vote} open onClose={() => undefined} onAccepted={accepted} />);
    await userEvent.click(screen.getByRole("button", { name: "Find the best plov" }));
    await waitFor(() => expect(accepted).toHaveBeenCalledWith(vote.options[0]?.id, 5));
  });

  it("states why no vote appears offline", () => {
    render(<DailyVote vote={null} open onClose={() => undefined} onAccepted={() => undefined} />);
    expect(screen.getByText(/no vote or result is being invented/i)).toBeInTheDocument();
  });
});
