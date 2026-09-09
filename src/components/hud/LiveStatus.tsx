import type { ConnectionStatus } from "@/lib/contracts";
import { formatPaceRate } from "@/lib/presence";

type Props = {
  activeViewers: number | null;
  paceRate: number;
  walking: boolean;
  status: ConnectionStatus;
  onShare: () => void;
};

export function LiveStatus({ activeViewers, paceRate, walking, status, onShare }: Props) {
  const label = status === "live"
    ? `${activeViewers ?? 0} ${activeViewers === 1 ? "person" : "people"} watching`
    : status === "offline"
      ? "Live count unavailable"
      : "Live count reconnecting";
  return (
    <div className="live-status" role="status" aria-live="polite">
      <span className={`live-dot ${status}`} aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <small>{walking
          ? `The internet is keeping him moving · ×${formatPaceRate(paceRate)}`
          : "He’s waiting for a watcher"}</small>
        {walking && status === "live" ? (
          <button className="live-status-share" type="button" onClick={onShare}>
            bring a friend → faster
          </button>
        ) : null}
      </div>
    </div>
  );
}
