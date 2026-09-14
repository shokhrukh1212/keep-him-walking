import type { ReactNode } from "react";
import type { ConnectionStatus, CountryDayView } from "@/lib/contracts";

type Props = {
  day: CountryDayView;
  localTime: string;
  activeViewers: number | null;
  status: ConnectionStatus;
  /** Real weather for the city, or null when nothing is confirmed. */
  weatherLabel?: string | null;
  launchCountdown?: string | null;
  /** The shared season clock, e.g. "Season 1 · Day 3 of 7" and "Ends in 4d 6h". */
  seasonClock?: { where: string; when: string } | null;
  /** A finished season with nothing live: there is no audience count to show. */
  seasonComplete?: boolean;
  audienceOpen: boolean;
  onAudienceOpen: () => void;
  onJourneyOpen: () => void;
  soundControl?: ReactNode;
};

export function JourneyHud({
  day,
  localTime,
  activeViewers,
  status,
  weatherLabel = null,
  launchCountdown = null,
  seasonClock = null,
  seasonComplete = false,
  audienceOpen,
  onAudienceOpen,
  onJourneyOpen,
  soundControl,
}: Props) {
  const audienceLabel = activeViewers === null
    ? "Live count unavailable"
    : `${activeViewers} ${activeViewers === 1 ? "person" : "people"} watching`;
  return (
    <header className="journey-hud" data-hud-region="header">
      <button className="day-mark" data-hud-region="where-when" type="button" onClick={onJourneyOpen} aria-haspopup="dialog" aria-label={`Open Journey from ${day.cityName}`}>
        <span className="product-mark">KEEP HIM WALKING</span>
        {/* The season clock carries the day number, so the headline names only the city. */}
        <strong>{seasonClock ? day.cityName : `${day.cityName} · Day ${day.dayNumber}`}</strong>
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
        <button className="audience-control" type="button" onClick={onAudienceOpen} aria-haspopup="dialog" aria-expanded={audienceOpen}>
          <span className={`live-dot ${status}`} aria-hidden="true" />
          <strong>{launchCountdown ? `Starts ${launchCountdown}` : seasonComplete ? "Season complete" : audienceLabel}</strong>
        </button>
        {soundControl}
      </div>
    </header>
  );
}
