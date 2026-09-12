"use client";

import { useState } from "react";
import { ballotPercentages } from "@/components/hud/VoteChip";
import { flagEmoji } from "@/lib/countries/flags";
import type { VoteView } from "@/lib/contracts";

type Props = {
  vote: VoteView | null;
  onAccepted: (optionId: string, totalBallots: number) => void;
};

/** The ballot's contents. The surrounding modal owns its title, close button and focus. */
export function DailyVote({ vote, onAccepted }: Props) {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const percentages = vote ? ballotPercentages(vote) : new Map<string, number>();
  // Named only once the ballot has closed; before that nothing is decided.
  const winner = vote && vote.status === "closed" && vote.resultOptionId
    ? vote.options.find((option) => option.id === vote.resultOptionId) ?? null
    : null;

  const submit = async (optionId: string) => {
    if (!vote || vote.status !== "open") return;
    setSubmitting(optionId);
    setError(null);
    try {
      const response = await fetch("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voteId: vote.id, optionId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Vote failed");
      onAccepted(result.selectedOptionId, result.totalBallots);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Vote failed");
    } finally {
      setSubmitting(null);
    }
  };

  if (!vote) {
    return <p className="vote-empty">The live server is not connected, so no vote or result is being invented.</p>;
  }
  return (
    <div className="vote-ballot">
      <p className="vote-question">{vote.question}</p>
      <div className="vote-options">
        {vote.options.map((option) => (
          <button
            type="button"
            key={option.id}
            disabled={vote.status !== "open" || Boolean(submitting) || Boolean(vote.selectedOptionId)}
            aria-pressed={vote.selectedOptionId === option.id}
            onClick={() => void submit(option.id)}
          >
            <span className="vote-option-label">
              {option.countryCode ? (
                <span aria-hidden="true">{flagEmoji(option.countryCode)} </span>
              ) : null}
              {option.label}
            </span>
            {option.blurb ? <small className="vote-blurb">{option.blurb}</small> : null}
            {option.votes === undefined ? null : (
              <small className="vote-tally">{option.votes} votes · {percentages.get(option.id) ?? 0}%</small>
            )}
          </button>
        ))}
      </div>
      {winner ? (
        <p className="vote-result">
          {vote.kind === "name" ? "His name: " : "Tomorrow: "}
          {winner.countryCode ? <span aria-hidden="true">{flagEmoji(winner.countryCode)} </span> : null}
          <strong>{winner.label}</strong> ({percentages.get(winner.id) ?? 0}%)
        </p>
      ) : null}
      <small className="vote-total">{vote.totalBallots} people have voted</small>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </div>
  );
}
