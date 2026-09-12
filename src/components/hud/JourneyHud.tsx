import type { ConnectionStatus, CountryDayView } from "@/lib/contracts";

type Props = {
  day: CountryDayView;
  localTime: string;
  activeViewers: number | null;
  status: ConnectionStatus;
  /** Real weather for the city, or null when nothing is confirmed. */
  weatherLabel?: string | null;
  launchCountdown?: string | null;
  audienceOpen: boolean;
  onAudienceOpen: () => void;
  onJourneyOpen: () => void;
};

export function JourneyHud({
  day,
  localTime,
  activeViewers,
  status,
  weatherLabel = null,
  launchCountdown = null,
  audienceOpen,
  onAudienceOpen,
  onJourneyOpen,
}: Props) {
  const audienceLabel = activeViewers === null
    ? "Live count unavailable"
    : `${activeViewers} ${activeViewers === 1 ? "person" : "people"} watching`;
  return (
    <header className="journey-hud" data-hud-region="header">
      <button className="day-mark" data-hud-region="where-when" type="button" onClick={onJourneyOpen} aria-haspopup="dialog" aria-label={`Open Journey from ${day.cityName}`}>
        <span className="product-mark">KEEP HIM WALKING</span>
        <strong>{day.cityName} · Day {day.dayNumber}</strong>
        <span>
          {day.countryName} · {localTime}
          {weatherLabel ? <> · <span className="hud-weather">{weatherLabel}</span></> : null}
        </span>
      </button>
      <p className="journey-rule">He only walks while someone is watching.</p>
      <div className="journey-hud-audience" data-hud-region="who">
        <button className="audience-control" type="button" onClick={onAudienceOpen} aria-haspopup="dialog" aria-expanded={audienceOpen}>
          <span className={`live-dot ${status}`} aria-hidden="true" />
          <strong>{launchCountdown ? `Starts ${launchCountdown}` : audienceLabel}</strong>
        </button>
      </div>
    </header>
  );
}
