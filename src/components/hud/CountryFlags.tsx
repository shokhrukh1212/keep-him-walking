import { flagEmoji } from "@/lib/countries/flags";
import type { LiveCountryView } from "@/lib/contracts";

const VISIBLE_FLAGS = 4;

type Props = {
  live: LiveCountryView[];
  onOpen: () => void;
};

/**
 * Up to four flags then "+N". Every code here is a server-confirmed live lease,
 * so the strip is empty rather than optimistic when nobody is confirmed.
 */
export function CountryFlags({ live, onOpen }: Props) {
  if (live.length === 0) return null;
  const shown = live.slice(0, VISIBLE_FLAGS);
  const overflow = live.length - shown.length;
  const label = `Watching from ${live.length} ${live.length === 1 ? "country" : "countries"}`;
  return (
    <button className="country-flags" type="button" onClick={onOpen} aria-label={`${label}. Open today’s leaderboard.`}>
      <span className="country-flags-emoji" aria-hidden="true">
        {shown.map((row) => (
          <span key={row.code} className="country-flag">{flagEmoji(row.code)}</span>
        ))}
      </span>
      {overflow > 0 ? <span className="country-flags-overflow">+{overflow}</span> : null}
    </button>
  );
}
