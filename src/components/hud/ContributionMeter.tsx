type Props = {
  seconds: number;
  steps: number;
  globalSteps: number;
  stale: boolean;
};

export function ContributionMeter({ seconds, steps, globalSteps, stale }: Props) {
  return (
    <div className="contribution-meter">
      <span className="eyebrow">YOUR CONTRIBUTION</span>
      <strong>{steps.toLocaleString()} steps</strong>
      <small>{Math.floor(seconds)} active seconds · {globalSteps.toLocaleString()} global steps{stale ? " (last confirmed)" : ""}</small>
    </div>
  );
}
