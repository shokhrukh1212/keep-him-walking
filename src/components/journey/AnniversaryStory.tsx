import { ballotPercentages } from "@/components/hud/VoteChip";
import { ANNIVERSARY_UPDATE } from "@/content/anniversary/update";
import type { VoteView } from "@/lib/contracts";
import {
  ANNIVERSARY_JOURNEY, ANNIVERSARY_LABELS, ANNIVERSARY_STORY, ANNIVERSARY_VOTE_COPY, pollPhaseAt,
} from "@/lib/season/anniversary";

type Props = {
  /** "Starts in 9h 12m", "Day 3 of 14" or "Journey complete", from the stored season. */
  progress: string | null;
  completed: boolean;
  /** The season's current vote; only an anniversary poll is shown here. */
  vote: VoteView | null;
  /** Server-synchronized wall clock. */
  nowMs: number;
  coffeeUrl: string | null;
  onVote: () => void;
  onSponsor: () => void;
};

/**
 * The top of Journey for Season 1: the maker's story, the dates, where the journey is, the
 * anniversary-setting vote and the ways to support it. The traveler and his cities are
 * virtual; the celebration in Tashkent is the maker's real plan, and nothing here ties it
 * to money.
 */
export function AnniversaryStory({ progress, completed, vote, nowMs, coffeeUrl, onVote, onSponsor }: Props) {
  const poll = vote?.kind === "anniversary" ? vote : null;
  const phase = poll ? (poll.status === "open" && pollPhaseAt(nowMs) !== "closed" ? "open" : "closed") : pollPhaseAt(nowMs);
  const percentages = poll ? ballotPercentages(poll) : new Map<string, number>();
  const winner = poll?.resultOptionId ? poll.options.find((option) => option.id === poll.resultOptionId) ?? null : null;

  return (
    <>
      <section className="journey-section anniversary-story" aria-labelledby="anniversary-story-title" data-testid="anniversary-story">
        <h3 className="journey-section-title" id="anniversary-story-title">{ANNIVERSARY_JOURNEY.title}</h3>
        {progress ? <p className="anniversary-progress" data-testid="anniversary-progress"><strong>{progress}</strong></p> : null}
        <p>{ANNIVERSARY_STORY}</p>
        <p className="journey-muted">
          Travel: {ANNIVERSARY_LABELS.travelStarts}–{ANNIVERSARY_LABELS.lastTravelDay.replace("September ", "")} · Anniversary: {ANNIVERSARY_LABELS.anniversary} · Tashkent time
        </p>
        <p className="journey-muted">
          The traveler and his cities are virtual. The celebration in Tashkent is my real plan, and it does not depend on any payment or target.
        </p>
        <div className="anniversary-support">
          {coffeeUrl ? (
            <a href={coffeeUrl} target="_blank" rel="noopener noreferrer">Buy him a coffee ↗</a>
          ) : null}
          <button type="button" onClick={onSponsor}>Sponsor this journey</button>
        </div>
        {coffeeUrl ? <p className="journey-muted anniversary-support-note">
          Coffee is voluntary support toward my expenses and the gift. It does not buy a sponsor slot or a vote, or fund real travel.
        </p> : null}
      </section>

      {completed ? (
        <section className="journey-section anniversary-update" aria-labelledby="anniversary-update-title" data-testid="anniversary-update">
          <h3 className="journey-section-title" id="anniversary-update-title">{ANNIVERSARY_UPDATE.title}</h3>
          <p>{ANNIVERSARY_UPDATE.body}</p>
        </section>
      ) : null}

      <section className="journey-section anniversary-vote" aria-labelledby="anniversary-vote-title" data-testid="anniversary-vote" data-poll-phase={phase}>
        <h3 className="journey-section-title" id="anniversary-vote-title">Anniversary setting</h3>
        {phase === "upcoming" ? (
          <p>
            Help choose the celebration setting in Tashkent. Voting opens {ANNIVERSARY_LABELS.pollOpens} and closes {ANNIVERSARY_LABELS.pollCloses} at {ANNIVERSARY_LABELS.pollClosesTime}.
          </p>
        ) : phase === "open" ? (
          <>
            <p>Voting is open until {ANNIVERSARY_LABELS.pollCloses} at {ANNIVERSARY_LABELS.pollClosesTime}.</p>
            <div className="journey-actions"><button type="button" onClick={onVote}>{poll?.selectedOptionId ? "See the vote" : "Vote"}</button></div>
          </>
        ) : poll ? (
          <>
            <p>{winner ? <>Chosen setting: <strong>{winner.label}</strong></> : "Voting has closed."}</p>
            <ol className="anniversary-results">
              {poll.options.map((option) => (
                <li key={option.id}>
                  <span>{option.label}</span>
                  <small>{option.votes ?? 0} votes · {percentages.get(option.id) ?? 0}%</small>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p>Voting has closed.</p>
        )}
        <p className="journey-muted">{ANNIVERSARY_VOTE_COPY.explanation} {ANNIVERSARY_VOTE_COPY.fairness}</p>
      </section>
    </>
  );
}
