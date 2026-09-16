import Link from "next/link";
import { countryDisplayName, flagEmoji, formatWatchDuration } from "@/lib/countries/flags";
import { ShareOnXLink } from "@/components/share/ShareOnXLink";
import type { ConnectionStatus, CountryWatchView } from "@/lib/contracts";

type Props = {
  todayTop: CountryWatchView[];
  activeViewers: number | null;
  walking: boolean;
  status: ConnectionStatus;
  /** The intentional prelaunch: nothing is carried yet. */
  preview?: boolean;
  waitingSinceLocalTime?: string | null;
  waitingDuration?: string | null;
  wakeCountdown?: number | null;
  launchCountdown?: string | null;
  shareText: string;
};

/**
 * The day's audience: who is carrying him and from where. Every number is server-confirmed.
 * The header already shows how many people are watching, so the summary names the state only.
 */
export function CountryLeaderboardSheet({
  todayTop, activeViewers, walking, status, preview = false,
  waitingSinceLocalTime, waitingDuration, wakeCountdown, launchCountdown, shareText,
}: Props) {
  return (
    <div className="country-sheet">
      <p className="audience-summary">
        {launchCountdown
          ? `The journey starts ${launchCountdown}.`
          : preview
            ? "The journey has not started yet."
            : status === "reconnecting"
              ? "Reconnecting to the live journey."
              : activeViewers === null
                ? "The live journey is unavailable."
                : walking
                  ? "Watchers are keeping him walking."
                  : wakeCountdown
                    ? `He starts walking in ${wakeCountdown}…`
                    : waitingSinceLocalTime
                      ? `He has been waiting ${waitingDuration ?? `since ${waitingSinceLocalTime}`}.`
                      : "He is waiting for a viewer."}
      </p>
      <ShareOnXLink text={shareText} className="audience-share" />
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
    </div>
  );
}
