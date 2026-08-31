"use client";

import { useState } from "react";
import type { VoteView } from "@/lib/contracts";

type Props = {
  vote: VoteView | null;
  open: boolean;
  onClose: () => void;
  onAccepted: (optionId: string, totalBallots: number) => void;
};

export function DailyVote({ vote, open, onClose, onAccepted }: Props) {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

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

  return (
    <section className="vote-panel" aria-label="Daily vote">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">TODAY’S CHOICE</span>
          <h2>{vote?.question ?? "Voting is unavailable while offline"}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close vote">×</button>
      </div>
      {vote ? (
        <div className="vote-options">
          {vote.options.map((option) => (
            <button
              type="button"
              key={option.id}
              disabled={vote.status !== "open" || Boolean(submitting) || Boolean(vote.selectedOptionId)}
              aria-pressed={vote.selectedOptionId === option.id}
              onClick={() => void submit(option.id)}
            >
              <span>{option.label}</span>
              {option.votes === undefined ? null : <small>{option.votes} votes</small>}
            </button>
          ))}
        </div>
      ) : (
        <p>The live server is not connected, so no vote or result is being invented.</p>
      )}
      {vote ? <small>{vote.totalBallots} people have voted</small> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}
