import { LiveStatus } from "./LiveStatus";
import type { ConnectionStatus, CountryDayView } from "@/lib/contracts";

type Props = {
  day: CountryDayView;
  localTime: string;
  activeViewers: number | null;
  walking: boolean;
  status: ConnectionStatus;
};

export function JourneyHud({ day, localTime, activeViewers, walking, status }: Props) {
  return (
    <header className="journey-hud">
      <div className="day-mark">
        <span className="eyebrow">DAY {day.dayNumber} / {day.totalDays}</span>
        <strong>{day.cityName}</strong>
        <span>{day.countryName} · {localTime}</span>
      </div>
      <LiveStatus activeViewers={activeViewers} walking={walking} status={status} />
    </header>
  );
}
