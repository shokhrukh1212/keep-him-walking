import { CountryLeaderboardSheet } from "./CountryLeaderboardSheet";
import type {
  ConnectionStatus,
  CountryDayView,
  CountryWatchView,
} from "@/lib/contracts";

type Props = {
  day: CountryDayView;
  localTime: string;
  activeViewers: number | null;
  paceRate: number;
  walking: boolean;
  status: ConnectionStatus;
  onShare: () => void;
  wakeCountdown?: number | null;
  waitingSinceLocalTime?: string | null;
  waitingDuration?: string | null;
  /** Real weather for the city, or null when nothing is confirmed. */
  weatherLabel?: string | null;
  todayTopCountries?: CountryWatchView[];
  launchCountdown?: string | null;
  audienceOpen: boolean;
  onAudienceOpen: () => void;
  onAudienceClose: () => void;
  onJourneyOpen: () => void;
};

export function JourneyHud({
  day,
  localTime,
  activeViewers,
  paceRate,
  walking,
  status,
  onShare,
  wakeCountdown,
  waitingSinceLocalTime,
  waitingDuration,
  weatherLabel = null,
  todayTopCountries = [],
  launchCountdown = null,
  audienceOpen,
  onAudienceOpen,
  onAudienceClose,
  onJourneyOpen,
}: Props) {
  const audienceLabel = activeViewers === null
    ? "Live count unavailable"
    : `${activeViewers} ${activeViewers === 1 ? "person" : "people"} watching`;
  return (
    <header className="journey-hud" data-hud-region="header">
      <button className="day-mark" data-hud-region="where-when" type="button" onClick={onJourneyOpen} aria-label={`Open Journey from ${day.cityName}`}>
        <span className="product-mark">KEEP HIM WALKING</span>
        <strong>{day.cityName} · Day {day.dayNumber}</strong>
        <span>
          {day.countryName} · {localTime}
          {weatherLabel ? <> · <span className="hud-weather">{weatherLabel}</span></> : null}
        </span>
      </button>
      <p className="journey-rule">He only walks while someone is watching.</p>
      <div className="journey-hud-audience" data-hud-region="who">
        <button className="audience-control" type="button" onClick={onAudienceOpen} aria-expanded={audienceOpen}>
          <span className={`live-dot ${status}`} aria-hidden="true" />
          <strong>{launchCountdown ? `Starts ${launchCountdown}` : audienceLabel}</strong>
        </button>
      </div>
      <CountryLeaderboardSheet
        open={audienceOpen}
        todayTop={todayTopCountries}
        activeViewers={activeViewers}
        paceRate={paceRate}
        walking={walking}
        status={status}
        waitingSinceLocalTime={waitingSinceLocalTime}
        waitingDuration={waitingDuration}
        wakeCountdown={wakeCountdown}
        launchCountdown={launchCountdown}
        onShare={onShare}
        onClose={onAudienceClose}
      />
    </header>
  );
}
