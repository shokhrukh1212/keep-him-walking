import { describe, expect, it } from "vitest";
import { applyBallot } from "./ballot";
import type { VoteView } from "@/lib/contracts";

const vote: VoteView = {
  id: "v1", question: "What should we call him?", kind: "name",
  opensAt: "2026-09-19T10:00:00Z", closesAt: null, status: "open",
  totalBallots: 4, selectedOptionId: null, resultOptionId: null,
  options: [
    { id: "a", label: "Milo", displayOrder: 1, packId: null, countryCode: null, blurb: null, votes: 3 },
    { id: "b", label: "Nur", displayOrder: 2, packId: null, countryCode: null, blurb: null, votes: 1 },
  ],
};

describe("applyBallot", () => {
  it("counts a first ballot in the option and the total while it is in flight", () => {
    const next = applyBallot(vote, { optionId: "b" });
    expect(next.options.map((option) => option.votes)).toEqual([3, 2]);
    expect(next.totalBallots).toBe(5);
    expect(next.selectedOptionId).toBe("b");
  });

  it("prefers the server tallies over the local guess", () => {
    const next = applyBallot(vote, {
      optionId: "b", totalBallots: 9, tallies: [{ optionId: "a", votes: 5 }, { optionId: "b", votes: 4 }],
    });
    expect(next.options.map((option) => option.votes)).toEqual([5, 4]);
    expect(next.totalBallots).toBe(9);
  });

  it("moves a changed ballot instead of adding one", () => {
    const next = applyBallot({ ...vote, selectedOptionId: "a" }, { optionId: "b" });
    expect(next.options.map((option) => option.votes)).toEqual([2, 2]);
    expect(next.totalBallots).toBe(4);
  });

  it("repeats the same choice without moving any number", () => {
    const next = applyBallot({ ...vote, selectedOptionId: "b" }, { optionId: "b" });
    expect(next.options.map((option) => option.votes)).toEqual([3, 1]);
    expect(next.totalBallots).toBe(4);
  });

  it("leaves a hidden tally hidden", () => {
    const hidden: VoteView = { ...vote, options: vote.options.map((option) => ({ ...option, votes: undefined })) };
    const next = applyBallot(hidden, { optionId: "a" });
    expect(next.options.every((option) => option.votes === undefined)).toBe(true);
    expect(next.totalBallots).toBe(5);
  });
});
