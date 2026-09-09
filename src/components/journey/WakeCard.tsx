type Props = {
  cityName: string;
  localTime: string;
  waitedDuration: string;
  onShare: () => void;
};

export function WakeCard({ cityName, localTime, waitedDuration, onShare }: Props) {
  return (
    <aside className="wake-card" aria-label="You woke him up">
      <span className="eyebrow">FIRST WATCHER</span>
      <h2>You woke him up</h2>
      <p>
        You found him waiting in <strong>{cityName}</strong> at {localTime}. He had
        waited {waitedDuration}.
      </p>
      <button type="button" onClick={onShare}>Share</button>
    </aside>
  );
}
