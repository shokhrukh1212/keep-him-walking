import type { ConnectionStatus } from "@/lib/contracts";
import { formatPaceRate } from "@/lib/presence";

type Props = {
  activeViewers: number | null;
  paceRate: number;
  walking: boolean;
  status: ConnectionStatus;
  onShare: () => void;
  wakeCountdown?: number | null;
  waitingSinceLocalTime?: string | null;
  waitingDuration?: string | null;
};

export function LiveStatus({
  activeViewers,
  paceRate,
  walking,
  status,
  onShare,
  wakeCountdown,
  waitingSinceLocalTime,
  waitingDuration,
}: Props) {
  const confirmed = activeViewers ?? 0;
  const label = status === "offline" && activeViewers === null
    ? "Live count unavailable"
    : `${confirmed} ${confirmed === 1 ? "person" : "people"} watching`;
  const detail = status === "reconnecting"
    ? `Live count reconnecting · last confirmed ${confirmed}`
    : status === "offline"
      ? "He only moves while someone is watching."
      : walking
        ? `The internet is keeping him moving · ×${formatPaceRate(paceRate)} pace`
        : wakeCountdown
          ? `You’re here · he starts walking in ${wakeCountdown}…`
          : waitingSinceLocalTime
            ? `Nobody's watching. He's been waiting ${waitingDuration ?? `since ${waitingSinceLocalTime}`}.`
            : "Nobody's watching. He's waiting for the internet.";
  return (
    <div className="live-status" role="status" aria-live="polite">
      <span className={`live-dot ${status}`} aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <small>{detail}</small>
        {walking && status === "live" ? (
          <button className="live-status-share" type="button" onClick={onShare}>
            bring a friend → faster
          </button>
        ) : null}
      </div>
    </div>
  );
}
