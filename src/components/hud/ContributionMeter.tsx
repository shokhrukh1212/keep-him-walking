type Props = {
  seconds: number;
  steps: number;
  globalSteps: number;
  stale: boolean;
  onShare?: () => void;
};

export function ContributionMeter({ seconds, steps, globalSteps, stale, onShare }: Props) {
  return (
    <div className="contribution-meter">
      <span className="eyebrow">YOUR CONTRIBUTION</span>
      <strong>{steps.toLocaleString()} steps</strong>
      <small>{Math.floor(seconds)} active seconds · {globalSteps.toLocaleString()} global steps{stale ? " (last confirmed)" : ""}</small>
      {onShare ? <button type="button" onClick={onShare}>Share my steps</button> : null}
    </div>
  );
}
