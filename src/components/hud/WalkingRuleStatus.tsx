import type { WalkingStatus } from "@/lib/presence/status-label";

type Props = {
  walking: boolean;
  label: string;
  tone?: WalkingStatus["tone"];
};

export function WalkingRuleStatus({ walking, label, tone }: Props) {
  return (
    <div className="traveler-state" data-hud-region="status" data-tone={tone} role="status" aria-label={`Walking rule: ${label}`}>
      <span aria-hidden="true">{walking ? "→" : tone === "reconnecting" ? "↻" : "•"}</span>
      {/* Its own box, so a narrow row can shorten it with an ellipsis instead of clipping. */}
      <span className="traveler-state-label">{label}</span>
    </div>
  );
}
