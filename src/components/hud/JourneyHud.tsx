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
  liveCountries = [],
  todayTopCountries = [],
}: Props) {
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  return (
    <header className="journey-hud">
      <div className="day-mark">
        <span className="eyebrow">DAY {day.dayNumber} / {day.totalDays}</span>
        <strong>{day.cityName}</strong>
        <span>{day.countryName} · {localTime}</span>
      </div>
      <div className="journey-hud-audience">
        <CountryFlags live={liveCountries} onOpen={() => setLeaderboardOpen(true)} />
        <LiveStatus
          activeViewers={activeViewers}
          paceRate={paceRate}
          walking={walking}
          status={status}
          onShare={onShare}
          wakeCountdown={wakeCountdown}
          waitingSinceLocalTime={waitingSinceLocalTime}
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
