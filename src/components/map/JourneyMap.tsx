"use client";

import { useEffect, useRef } from "react";
import { flagEmoji } from "@/lib/countries/flags";
import type { JourneyMapData } from "@/lib/map/data";

/** A compact, ordered route. Visited and current states come from matching server-confirmed days. */
export function JourneyMap({ data, compact = false }: { data: JourneyMapData; compact?: boolean }) {
  const frameRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = frameRef.current;
    const current = frame?.querySelector<HTMLElement>('.map-city[data-status="current"]');
    if (frame && current) frame.scrollLeft = Math.max(0, current.offsetLeft - frame.clientWidth / 2 + current.clientWidth / 2);
  }, [data.currentDayNumber]);
  return (
    <section className="journey-map" data-compact={compact} data-testid={compact ? "journey-map-compact" : "journey-map-full"}>
      <header>
        <span className="eyebrow">SEASON 1 · VIRTUAL ROUTE</span>
        {compact ? <h2>{data.cities.length} cities · {new Set(data.cities.map((city) => city.countryCode)).size} countries</h2> : <h1>One day, one city, one virtual journey.</h1>}
      </header>
      <div ref={frameRef} className="journey-map-frame" role="region" aria-label="Virtual route, scroll for all days" tabIndex={0}>
        <ol className="journey-route-list">
          {data.cities.map((city) => (
            <li key={city.countryDayId} className="map-city" data-status={city.status} data-current={city.status === "current"}>
              {city.status === "upcoming" ? (
                <div className="map-city-content" aria-label={`Day ${city.dayNumber}: ${city.cityName}, ${city.countryName}, upcoming`}>
                  <span className="map-city-day">{city.dayNumber}</span>
                  <span className="map-city-flag" aria-hidden="true">{flagEmoji(city.countryCode)}</span>
                  <span className="map-city-name">{city.cityName}<small>{city.countryName}</small></span>
                </div>
              ) : (
                <a className="map-city-content" href={city.status === "current" ? "/" : `/day/${city.dayNumber}`} aria-label={`Day ${city.dayNumber}: ${city.cityName}, ${city.countryName}, ${city.status}`}>
                  <span className="map-city-day">{city.dayNumber}</span>
                  <span className="map-city-flag" aria-hidden="true">{flagEmoji(city.countryCode)}</span>
                  <span className="map-city-name">{city.cityName}<small>{city.countryName}</small></span>
                </a>
              )}
            </li>
          ))}
        </ol>
      </div>
      {data.candidates.length > 0 ? <div className="map-vote-candidates" aria-label="Destination vote candidates">
        {data.candidates.map((candidate) => <span key={candidate.optionId} className="map-candidate" data-transfer={candidate.transfer}>
          {flagEmoji(candidate.countryCode)} {candidate.label} · {candidate.percent}% · {candidate.transfer}
        </span>)}
      </div> : null}
      {data.ticketFlights.length > 0 ? <div className="map-vote-candidates" aria-label="Approved ticket destinations">
        {data.ticketFlights.map((ticket) => <span key={ticket.ticketId} className="map-ticket-flight" data-testid="ticket-flight">
          {flagEmoji(ticket.countryCode)} Day {ticket.dayNumber} · {ticket.cityName} · flight
        </span>)}
      </div> : null}
      <div className="map-legend" aria-label="Route status"><span>● Visited</span><span>● Current city</span><span>○ Upcoming</span></div>
      {!compact ? <div className="map-stats" aria-label="Season map statistics">
        <div><strong>{data.stats.days}</strong><small>days reached</small></div>
        <div><strong>{(data.stats.confirmedDistanceMetres / 1_000).toFixed(1)} km</strong><small>confirmed distance</small></div>
      </div> : null}
    </section>
  );
}
