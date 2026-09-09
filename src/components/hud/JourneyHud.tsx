import { useState } from "react";
import { CountryFlags } from "./CountryFlags";
import { CountryLeaderboardSheet } from "./CountryLeaderboardSheet";
import { LiveStatus } from "./LiveStatus";
import type {
  ConnectionStatus,
  CountryDayView,
  CountryWatchView,
  LiveCountryView,
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
  liveCountries?: LiveCountryView[];
  todayTopCountries?: CountryWatchView[];
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
  liveCountries = [],
  todayTopCountries = [],
}: Props) {
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  return (
    <header className="journey-hud" data-hud-region="header">
      <div className="day-mark" data-hud-region="where-when">
        <span className="eyebrow">DAY {day.dayNumber} · SEASON 1</span>
        <strong>{day.cityName}</strong>
        <span>
          {day.countryName} · {localTime}
          {weatherLabel ? <> · <span className="hud-weather">{weatherLabel}</span></> : null}
        </span>
      </div>
      <div className="journey-hud-audience" data-hud-region="who">
        <CountryFlags live={liveCountries} onOpen={() => setLeaderboardOpen(true)} />
        <LiveStatus
          activeViewers={activeViewers}
          paceRate={paceRate}
          walking={walking}
          status={status}
          onShare={onShare}
          wakeCountdown={wakeCountdown}
          waitingSinceLocalTime={waitingSinceLocalTime}
          waitingDuration={waitingDuration}
        />
      </div>
      <CountryLeaderboardSheet
        open={leaderboardOpen}
        todayTop={todayTopCountries}
        onClose={() => setLeaderboardOpen(false)}
      />
    </header>
  );
}
