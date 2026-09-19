import type { VoteView } from "@/lib/contracts";

export type BallotTally = { optionId: string; votes: number };

export type AcceptedBallot = {
  optionId: string;
  /** Absent while the ballot is still in flight, when only the shown total moves. */
  totalBallots?: number;
  /** Server counts, authoritative when present; they replace the local guess. */
  tallies?: readonly BallotTally[];
};

/**
 * One visitor's ballot applied to the shown vote. With `tallies` this is the
 * server's own count; without them it is the optimistic view shown while the
 * request is in flight — the same arithmetic Postgres will confirm, so the
 * numbers do not jump when the answer lands.
 */
export function applyBallot(vote: VoteView, ballot: AcceptedBallot): VoteView {
  const counted = new Map((ballot.tallies ?? []).map((tally) => [tally.optionId, Math.max(0, tally.votes)]));
  // A visitor may change their mind: their previous choice loses the ballot it had.
  const previous = vote.selectedOptionId;
  const isNewBallot = previous === null;
  const options = vote.options.map((option) => {
    const authoritative = counted.get(option.id);
    if (authoritative !== undefined) return { ...option, votes: authoritative };
    if (option.votes === undefined) return option;
    let votes = option.votes;
    if (option.id === previous && previous !== ballot.optionId) votes -= 1;
    if (option.id === ballot.optionId && previous !== ballot.optionId) votes += 1;
    return { ...option, votes: Math.max(0, votes) };
  });
  return {
    ...vote,
    options,
    selectedOptionId: ballot.optionId,
    totalBallots: ballot.totalBallots ?? vote.totalBallots + (isNewBallot ? 1 : 0),
  };
}
