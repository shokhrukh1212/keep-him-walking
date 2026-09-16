import { useEffect, useState } from "react";
import type { VoteView } from "@/lib/contracts";

type Props = {
  vote: VoteView | null;
  onOpen: () => void;
};

/** Milliseconds until the ballot's own stored closing instant, never negative. */
export function millisecondsUntilClose(closesAt: string | undefined, nowMs: number): number {
  const closes = closesAt ? Date.parse(closesAt) : Number.NaN;
  return Number.isFinite(closes) ? Math.max(0, closes - nowMs) : 0;
}

function formatCountdown(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1_000));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

/** Whole percentages that still sum to 100, so the ballot never shows 99 %. */
export function ballotPercentages(vote: VoteView): Map<string, number> {
  const counts = vote.options.map((option) => Math.max(0, option.votes ?? 0));
  const total = counts.reduce((sum, count) => sum + count, 0);
  const result = new Map<string, number>();
  if (total === 0) {
    for (const option of vote.options) result.set(option.id, 0);
    return result;
  }
  const exact = counts.map((count) => (count * 100) / total);
  const floors = exact.map((value) => Math.floor(value));
  let remainder = 100 - floors.reduce((sum, value) => sum + value, 0);
  // Hand the leftover points to the largest fractions, largest first.
  const order = exact
    .map((value, index) => ({ index, fraction: value - floors[index]! }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const entry of order) {
    if (remainder <= 0) break;
    floors[entry.index] += 1;
    remainder -= 1;
  }
  vote.options.forEach((option, index) => result.set(option.id, floors[index]!));
  return result;
}

/**
 * One short ballot chip: what it is and how long is left until the ballot's stored close
 * (a name vote closes at launch, the anniversary poll at 20:00 in Tashkent). It shows only
 * while the ballot is open. The choices and their server-confirmed tallies live in the vote
 * modal, never crammed into the dock.
 */
export function VoteChip({ vote, onOpen }: Props) {
  const closesAt = vote?.closesAt;
  const [remainingMs, setRemainingMs] = useState(() => millisecondsUntilClose(closesAt, Date.now()));

  useEffect(() => {
    const tick = () => setRemainingMs(millisecondsUntilClose(closesAt, Date.now()));
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [closesAt]);

  if (!vote || vote.status !== "open" || remainingMs <= 0) return null;
  const label = vote.kind === "name" ? "Name vote" : vote.kind === "anniversary" ? "Anniversary setting vote" : "Destination vote";

  return (
    <button
      className="vote-chip"
      data-hud-region="vote"
      type="button"
      onClick={onOpen}
      aria-label={`${label}. Closes in ${formatCountdown(remainingMs)}.`}
    >
      <span className="vote-chip-label">{vote.kind === "name" ? "Name him" : "Vote"}</span>
      <time className="vote-chip-countdown" dateTime={`PT${Math.floor(remainingMs / 1_000)}S`}>
        {formatCountdown(remainingMs)}
      </time>
    </button>
  );
}
