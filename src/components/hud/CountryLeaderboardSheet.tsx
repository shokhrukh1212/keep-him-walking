import Link from "next/link";
import { countryDisplayName, flagEmoji, formatWatchDuration } from "@/lib/countries/flags";
import type { CountryWatchView } from "@/lib/contracts";

type Props = {
  open: boolean;
  todayTop: CountryWatchView[];
  onClose: () => void;
};

/** The day's leaderboard: rank, flag, name, carried time. All server-confirmed. */
export function CountryLeaderboardSheet({ open, todayTop, onClose }: Props) {
  if (!open) return null;
  return (
    <aside className="country-sheet" aria-label="Countries watching today">
      <div className="country-sheet-head">
        <span className="eyebrow">TODAY · CARRIED TIME</span>
        <button type="button" onClick={onClose} aria-label="Close the country leaderboard">Close</button>
      </div>
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
