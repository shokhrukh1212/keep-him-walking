import Link from "next/link";
import { countryDisplayName, flagEmoji, formatWatchDuration } from "@/lib/countries/flags";
import type { ConnectionStatus, CountryWatchView } from "@/lib/contracts";
import { formatPaceRate } from "@/lib/presence";

type Props = {
  open: boolean;
  todayTop: CountryWatchView[];
  onClose: () => void;
  activeViewers: number | null;
  paceRate: number;
  walking: boolean;
  status: ConnectionStatus;
  waitingSinceLocalTime?: string | null;
  waitingDuration?: string | null;
  wakeCountdown?: number | null;
  launchCountdown?: string | null;
  onShare: () => void;
};

/** The day's leaderboard: rank, flag, name, carried time. All server-confirmed. */
export function CountryLeaderboardSheet({
  open, todayTop, onClose, activeViewers, paceRate, walking, status,
  waitingSinceLocalTime, waitingDuration, wakeCountdown, launchCountdown, onShare,
}: Props) {
  if (!open) return null;
  return (
    <aside className="country-sheet" data-panel-root tabIndex={-1} role="dialog" aria-modal="true" aria-label="Audience details">
      <div className="country-sheet-head">
        <span className="eyebrow">TODAY · CARRIED TIME</span>
        <button type="button" data-panel-close onClick={onClose} aria-label="Close audience details">Close</button>
      </div>
      <p className="audience-summary">
        {launchCountdown
          ? `The journey starts ${launchCountdown}.`
          : status === "reconnecting"
            ? `Reconnecting · last confirmed ${activeViewers ?? 0} watching.`
            : activeViewers === null
              ? "The live count is unavailable."
              : walking
                ? `${activeViewers} watching · collective pace ×${formatPaceRate(paceRate)}.`
                : wakeCountdown
                  ? `He starts walking in ${wakeCountdown}…`
                  : waitingSinceLocalTime
                    ? `He has been waiting ${waitingDuration ?? `since ${waitingSinceLocalTime}`}.`
                    : "He is waiting for a viewer."}
      </p>
      <button className="audience-share" type="button" onClick={onShare}>Bring a friend → faster</button>
      {todayTop.length === 0 ? (
        <p className="country-sheet-empty">No country has carried him yet today.</p>
      ) : (
        <ol className="country-sheet-list">
          {todayTop.map((row, index) => (
            <li key={row.code}>
              <span className="country-rank">{index + 1}</span>
              <span className="country-flag" aria-hidden="true">{flagEmoji(row.code)}</span>
              <Link href={`/country/${row.code.toLowerCase()}`}>{countryDisplayName(row.code)}</Link>
              <span className="country-time">{formatWatchDuration(row.watchSeconds)}</span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
