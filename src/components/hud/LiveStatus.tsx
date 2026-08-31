import type { ConnectionStatus } from "@/lib/contracts";

type Props = {
  activeViewers: number | null;
  walking: boolean;
  status: ConnectionStatus;
};

export function LiveStatus({ activeViewers, walking, status }: Props) {
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
        <small>{walking ? "The internet is keeping him moving" : "He’s waiting for a watcher"}</small>
      </div>
    </div>
  );
}
