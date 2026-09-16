"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { BootstrapSnapshot, DayPhotoView } from "@/lib/contracts";
import { flagEmoji } from "@/lib/countries/flags";
import type { PlayedEncounter } from "@/lib/journey/encounter-log";
import { distanceProgress, formatGoalKm, nextPlaceEta, stopLabel } from "@/lib/world/progress-copy";
import { ContributionMeter } from "@/components/hud/ContributionMeter";
import type { PlaceDot } from "@/components/hud/PlaceDots";
import { TomorrowPreview } from "@/components/hud/TomorrowPreview";
import { DayPhotoStrip } from "@/components/journey/DayPhotoStrip";
import { JourneyMapEmbed } from "@/components/map/JourneyMapEmbed";
import { ShareOnXLink } from "@/components/share/ShareOnXLink";

type Props = {
  /** Opened from an old Passport link: start at the visitor's own part. */
  section: "passport" | null;
  places: readonly PlaceDot[];
  currentPlaceIndex: number;
  secondsToNextVisit: number;
  visitSeconds: number;
  distanceMetres: number | null;
  dailyGoalMetres: number;
  marathonMetres: number;
  freshness: "extrapolated" | "last confirmed" | "reconnecting" | "unavailable";
  /** DataFast's people with the site open; undefined until known, null when unavailable. */
  onlineVisitors: number | null | undefined;
  prelaunch: boolean;
  contribution: { seconds: number | null; status: "pending" | "confirmed" | "last_confirmed" | "unavailable" };
  streak: number;
  collectedToday: boolean;
  secondsToCollect: number;
  encounters: readonly PlayedEncounter[];
  photos: DayPhotoView[];
  tomorrow: BootstrapSnapshot["tomorrow"] | null;
  ticket: BootstrapSnapshot["ticket"] | null;
  wakeCard?: ReactNode;
  postcard?: ReactNode;
  /** A finished season's small recap, shown first. */
  seasonRecap?: ReactNode;
  /** Season 1's story, progress, vote and support links, shown before today's walk. */
  story?: ReactNode;
  /** The season sponsor's one row. */
  seasonSponsor?: ReactNode;
  sponsorLabel?: string;
  /** The season a prelaunch Journey is waiting for. */
  seasonNumber?: number;
  /** The X draft for this moment of the shared journey. */
  shareText: string;
  onSponsor: () => void;
};

/** The Journey modal's contents, grouped from "where is he" to "what's next". */
export function JourneyPanel({
  section, places, currentPlaceIndex, secondsToNextVisit, visitSeconds,
  distanceMetres, dailyGoalMetres, marathonMetres, freshness, onlineVisitors,
  prelaunch, seasonNumber = 1, contribution, streak, collectedToday, secondsToCollect,
  encounters, photos, tomorrow, ticket, wakeCard, postcard, seasonRecap, story, seasonSponsor,
  sponsorLabel = "Sponsor a day", shareText, onSponsor,
}: Props) {
  const ids = useId();
  const yourPart = useRef<HTMLElement>(null);
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    if (section !== "passport") return;
    const frame = window.requestAnimationFrame(() => yourPart.current?.scrollIntoView({ block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [section]);

  const count = places.length;
  const here = places[currentPlaceIndex] ?? null;
  const stop = stopLabel(currentPlaceIndex, count);
  const eta = nextPlaceEta(secondsToNextVisit);
  const progress = distanceMetres === null ? null : distanceProgress(distanceMetres, dailyGoalMetres, marathonMetres);
  const visitMinutes = Math.max(1, Math.round(visitSeconds / 60));

  return (
    <div className="journey-panel">
      {seasonRecap}
      {story}
      {ticket ? (
        <p className="ticket-notice" data-testid="ticket-notice">
          Ticket: someone is sending him to {flagEmoji(ticket.countryCode)} {ticket.countryName} on Day {ticket.dayNumber}
        </p>
      ) : null}
      {wakeCard}

      <section className="journey-section" aria-labelledby={`${ids}-walk`}>
        <h3 className="journey-section-title" id={`${ids}-walk`}>Today&apos;s walk</h3>
        {here ? (
          <div className="journey-now">
            <strong>{here.label}</strong>
            <span>{stop.text}{count > 1 ? ` · ${eta.text}` : ""}</span>
            {here.description ? <p className="journey-muted">{here.description}</p> : null}
          </div>
        ) : null}
        {count > 1 ? (
          <details className="journey-route-details">
            <summary>See all {count} stops</summary>
            <ol className="journey-places" aria-label="Places on today's loop">
              {places.map((place, index) => (
                <li key={place.id} aria-current={index === currentPlaceIndex ? "step" : undefined}>
                  <span>{place.label}</span>
                  {index === currentPlaceIndex ? <small>You are here</small> : null}
                </li>
              ))}
            </ol>
          </details>
        ) : null}
        <p className="journey-muted">
          Each place lasts about {visitMinutes} walking minutes, then the loop begins again. Stops and waiting pause that clock.
        </p>
      </section>

      <section className="journey-section" aria-labelledby={`${ids}-together`}>
        <h3 className="journey-section-title" id={`${ids}-together`}>Together</h3>
        {prelaunch ? (
          // Nothing has been walked yet: say when counting starts rather than "unavailable".
          <p className="journey-distance"><strong>Shared distance starts counting when Season {seasonNumber} begins.</strong></p>
        ) : (
          <>
            <p className="journey-distance">
              <strong>{progress?.text ?? "Daily distance unavailable"}</strong>{" "}
              <small className="goal-freshness" data-freshness={freshness}>{freshness}</small>
            </p>
            <div className="goal-track" aria-hidden="true">
              {progress ? <span style={{ width: `${progress.fill * 100}%` }} /> : null}
            </div>
          </>
        )}
        <p className="journey-muted">
          {formatGoalKm(dailyGoalMetres)} km is today&apos;s shared goal, and a {formatGoalKm(marathonMetres)} km marathon
          comes after it. Distance grows only while he walks.
        </p>
        {typeof onlineVisitors === "number" ? (
          <p className="journey-muted">
            {onlineVisitors} watching now
          </p>
        ) : null}
      </section>

      <section className="journey-section" id="journey-your-part" ref={yourPart} aria-labelledby={`${ids}-you`}>
        <h3 className="journey-section-title" id={`${ids}-you`}>Your part</h3>
        {prelaunch ? (
          <p className="journey-muted">Your watching time starts counting when Season {seasonNumber} begins.</p>
        ) : (
          <ContributionMeter
            seconds={contribution.seconds}
            status={contribution.status}
          />
        )}
        {!prelaunch ? (
          <p className="dock-streak" data-testid="dock-streak">
            {/* Both halves are server-confirmed: the streak came with the bootstrap,
                and the seconds are the ones the heartbeat has already counted. */}
            {streak > 0 ? <><strong>{streak}</strong> {streak === 1 ? "day" : "days"} in a row · </> : null}
            <span className="dock-streak-today">
              {collectedToday ? "today collected" : `${Math.max(0, Math.ceil(secondsToCollect))}s to collect today`}
            </span>
          </p>
        ) : null}
        <div className="journey-actions">
          <ShareOnXLink text={shareText} />
          {postcard}
        </div>
      </section>

      <section className="journey-section" aria-labelledby={`${ids}-encounters`}>
        <h3 className="journey-section-title" id={`${ids}-encounters`}>Encounters</h3>
        <p className="journey-muted">Scripted fictional residents inspired by the place.</p>
        {encounters.length === 0 ? (
          <p className="journey-muted">No conversations yet since you arrived.</p>
        ) : (
          <div className="journey-encounters">
            {encounters.map((encounter) => (
              <details className="journey-encounter" key={encounter.key}>
                <summary>
                  <span>
                    {encounter.speakerName}
                    {encounter.placeLabel ? <small> · {encounter.placeLabel}</small> : null}
                  </span>
                </summary>
                <ol>
                  {encounter.lines.map((line, index) => (
                    <li key={`${line.speaker}-${index}`}>
                      <b>{line.speaker === "npc" ? encounter.speakerName : "Traveler"}</b>
                      {line.text}
                    </li>
                  ))}
                </ol>
              </details>
            ))}
          </div>
        )}
      </section>

      {photos.length > 0 ? (
        <section className="journey-section">
          <DayPhotoStrip photos={photos} />
        </section>
      ) : null}

      <section className="journey-section">
        <details className="journey-map-details" onToggle={(event) => setMapOpen(event.currentTarget.open)}>
          <summary>Route map</summary>
          {mapOpen ? <JourneyMapEmbed /> : null}
        </details>
      </section>

      {tomorrow ? (
        <section className="journey-section" aria-labelledby={`${ids}-tomorrow`}>
          <h3 className="journey-section-title" id={`${ids}-tomorrow`}>Tomorrow</h3>
          <TomorrowPreview
            cityName={tomorrow.cityName}
            countryName={tomorrow.countryName}
            packId={tomorrow.scenePackId}
            startsAt={tomorrow.startsAt}
            arrivalMode={tomorrow.arrivalMode}
          />
        </section>
      ) : null}

      {seasonSponsor ? (
        <section className="journey-section" aria-labelledby={`${ids}-sponsor`}>
          <h3 className="journey-section-title" id={`${ids}-sponsor`}>Season sponsor</h3>
          {seasonSponsor}
        </section>
      ) : null}

      <footer className="journey-footer">
        <Image className="journey-brand" src="/logo-dark.png" alt="Keep Him Walking" width={256} height={54} />
        <button type="button" onClick={onSponsor}>{sponsorLabel}</button>
        <Link href="/privacy">Privacy</Link>
      </footer>
    </div>
  );
}
