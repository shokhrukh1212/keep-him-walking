import { LiveStatus } from "./LiveStatus";
import type { ConnectionStatus, CountryDayView } from "@/lib/contracts";

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
}: Props) {
  return (
    <header className="journey-hud">
      <div className="day-mark">
        <span className="eyebrow">DAY {day.dayNumber} / {day.totalDays}</span>
        <strong>{day.cityName}</strong>
        <span>{day.countryName} · {localTime}</span>
      </div>
      <LiveStatus
        activeViewers={activeViewers}
        paceRate={paceRate}
        walking={walking}
        status={status}
        onShare={onShare}
        wakeCountdown={wakeCountdown}
        waitingSinceLocalTime={waitingSinceLocalTime}
      />
    </header>
  );
}
