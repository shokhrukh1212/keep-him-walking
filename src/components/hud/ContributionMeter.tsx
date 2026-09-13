type Props = {
  seconds: number | null;
  status: "pending" | "confirmed" | "last_confirmed" | "unavailable";
};

export function formatWatchingTime(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  if (minutes === 0) return `${remainder}s`;
  return `${minutes}m ${remainder.toString().padStart(2, "0")}s`;
}

export function ContributionMeter({ seconds, status }: Props) {
  const confirmed = seconds !== null && status !== "pending" && status !== "unavailable";
  return (
    <div className="contribution-meter">
      <strong>{confirmed ? formatWatchingTime(seconds) : status === "pending" ? "Confirming…" : "Unavailable"}</strong>
      <small>
        {confirmed ? `watching today${status === "last_confirmed" ? " · last confirmed" : " · server confirmed"}` :
          status === "pending" ? "Waiting for the first server confirmation" : "Watching time is not available in preview mode"}
      </small>
    </div>
  );
}
