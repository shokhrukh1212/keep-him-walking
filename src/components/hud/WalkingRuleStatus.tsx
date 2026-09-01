type Props = {
  walking: boolean;
  label: string;
};

export function WalkingRuleStatus({ walking, label }: Props) {
  return (
    <div className="traveler-state" role="status" aria-label={`Walking rule: ${label}`}>
      <span aria-hidden="true">{walking ? "→" : "•"}</span>
      {label}
    </div>
  );
}
