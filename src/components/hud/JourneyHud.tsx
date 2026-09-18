import type { ReactNode } from "react";
import type { ConnectionStatus, CountryDayView } from "@/lib/contracts";
import { peopleWatching } from "@/lib/presence/watching-count";

type Props = {
  day: CountryDayView;
  localTime: string;
  /** The server's confirmed watchers: the count that decides whether he walks. */
  activeViewers: number | null;
  /** DataFast's people with the site open: undefined until known, null when unavailable. */
  onlineVisitors: number | null | undefined;
  status: ConnectionStatus;
  /** Real weather for the city, or null when nothing is confirmed. */
  weatherLabel?: string | null;
  /** The shared season clock, e.g. "Season 1 · Day 3 of 7" and "Ends in 4d 6h". */
  seasonClock?: { where: string; when: string } | null;
  /** The intentional prelaunch: a preview scene. */
  preview?: boolean;
  audienceOpen: boolean;
  onAudienceOpen: () => void;
  onJourneyOpen: () => void;
  soundControl?: ReactNode;
};

export function JourneyHud({
  day,
  localTime,
  activeViewers,
  onlineVisitors,
  status,
  weatherLabel = null,
  seasonClock = null,
  preview = false,
  audienceOpen,
  onAudienceOpen,
  onJourneyOpen,
  soundControl,
}: Props) {
  // The owner's choice (15 September 2026): the header counts people with the site open,
  // from DataFast, before and after launch — but never fewer than the watchers the
  // server has confirmed, because that is the count deciding whether he walks.
  // Nothing is shown while neither source has answered.
  const watching = peopleWatching(activeViewers, onlineVisitors);
  const audienceLabel = watching === null
    ? onlineVisitors === null ? "Live count unavailable" : null
    : `${watching} ${watching === 1 ? "person" : "people"} watching`;
  // The season clock carries the day number, so the headline names only the city.
  const headline = preview
    ? `${day.cityName} · Preview`
    : seasonClock ? day.cityName : `${day.cityName} · Day ${day.dayNumber}`;
  return (
    <header className="journey-hud" data-hud-region="header" data-confirmed-watchers={activeViewers ?? undefined}>
      <button className="day-mark" data-hud-region="where-when" type="button" onClick={onJourneyOpen} aria-haspopup="dialog" aria-label={`Open Journey from ${day.cityName}`}>
        <span className="product-mark">KEEP HIM WALKING</span>
        <strong>{headline}</strong>
        {seasonClock ? (
          <span className="season-clock" data-testid="season-clock">
            <span>{seasonClock.where}</span>
            {/* A phone stacks the countdown under the season instead of cutting it off. */}
            <span className="season-clock-when"><span className="season-clock-separator"> · </span>{seasonClock.when}</span>
          </span>
        ) : null}
        <span>
          {day.countryName} · {localTime}
          {weatherLabel ? <> · <span className="hud-weather">{weatherLabel}</span></> : null}
        </span>
      </button>
      <p className="journey-rule">He only walks while someone is watching.</p>
      <div className="journey-hud-audience" data-hud-region="who">
        {audienceLabel === null ? null : (
          <button className="audience-control" type="button" onClick={onAudienceOpen} aria-haspopup="dialog" aria-expanded={audienceOpen}>
            <span className={`live-dot ${status}`} aria-hidden="true" />
            <strong>{audienceLabel}</strong>
          </button>
        )}
        {soundControl}
      </div>
    </header>
  );
}
