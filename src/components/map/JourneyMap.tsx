import { flagEmoji } from "@/lib/countries/flags";
import { mapPointString, projectEquirectangular } from "@/lib/map/projection";
import type { JourneyMapData } from "@/lib/map/data";

export function JourneyMap({ data, compact = false }: { data: JourneyMapData; compact?: boolean }) {
  const routePoints = data.cities.map((city) => mapPointString(city)).join(" ");
  const current = data.cities.find((city) => city.status === "current") ?? data.cities.at(-1) ?? null;
  return (
    <section className="journey-map" data-compact={compact} data-testid={compact ? "journey-map-compact" : "journey-map-full"}>
      {!compact ? <header>
        <span className="eyebrow">SEASON 1 · THE ROUTE SO FAR</span>
        <h1>One day, one city, one continuous journey.</h1>
      </header> : <h2>Journey map</h2>}
      <div className="journey-map-frame">
        <svg viewBox="0 0 1000 500" role="img" aria-label={`Journey map with ${data.cities.length} visited cities and ${data.candidates.length} candidates`}>
          <image href="/map/world.svg" x="0" y="0" width="1000" height="500" />
          {data.cities.length > 1 ? <polyline className="season-route" points={routePoints} /> : null}
          {data.cities.slice(1).map((city, index) => {
            const from = data.cities[index]!;
            return <line key={`segment-${city.countryDayId}`} className={`route-segment ${city.transferFromPrevious === "flight" ? "flight" : "walk"}`} x1={projectEquirectangular(from).x} y1={projectEquirectangular(from).y} x2={projectEquirectangular(city).x} y2={projectEquirectangular(city).y} data-transfer={city.transferFromPrevious} />;
          })}
          {current ? data.candidates.map((candidate) => {
            const start = projectEquirectangular(current);
            const point = projectEquirectangular(candidate);
            const textAnchor = point.x > 850 ? "end" : "start";
            const labelX = point.x + (textAnchor === "end" ? -11 : 11);
            return <g key={candidate.optionId} className="map-candidate" data-transfer={candidate.transfer}>
              <line x1={start.x} y1={start.y} x2={point.x} y2={point.y} />
              <circle cx={point.x} cy={point.y} r="6" />
              <text x={labelX} y={point.y - 9} textAnchor={textAnchor}>{flagEmoji(candidate.countryCode)} {candidate.percent}%</text>
              {!compact ? <text className="candidate-name" x={labelX} y={point.y + 10} textAnchor={textAnchor}>{candidate.label}{candidate.transfer === "flight" ? " · flight" : ""}</text> : null}
            </g>;
          }) : null}
          {data.cities.map((city) => {
            const point = projectEquirectangular(city);
            return <a key={city.countryDayId} href={city.status === "current" ? "/" : `/day/${city.dayNumber}`} aria-label={`Day ${city.dayNumber}: ${city.cityName}, ${city.outcome}`}>
              <g className="map-city" data-outcome={city.outcome} data-current={city.status === "current"} transform={`translate(${point.x} ${point.y})`}>
                <circle className="map-city-pulse" r="14" />
                <circle className="map-city-stamp" r={compact ? 7 : 9} />
                {!compact ? <text x="13" y="-12">{flagEmoji(city.countryCode)} {city.cityName}</text> : null}
              </g>
            </a>;
          })}
        </svg>
      </div>
      {!compact ? <>
        <div className="map-stats" aria-label="Season map statistics">
          <div><strong>{data.stats.days}</strong><small>days visited</small></div>
          <div><strong>{(data.stats.confirmedDistanceMetres / 1_000).toFixed(1)} km</strong><small>confirmed distance</small></div>
          <div><strong>{data.stats.landmarks}</strong><small>landmarks</small></div>
          <div><strong>{data.stats.marathons}</strong><small>marathons</small></div>
        </div>
        <div className="map-legend" aria-label="Map legend"><span className="landmark">● landmark</span><span className="marathon">● marathon</span><span className="unfinished">● unfinished</span><span>┄ tomorrow&apos;s vote</span></div>
        <small className="map-attribution">Map geometry: Natural Earth 1:110m · public domain</small>
      </> : null}
    </section>
  );
}
