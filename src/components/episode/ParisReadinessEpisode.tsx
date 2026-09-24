"use client";

import { useEffect, useState } from "react";
import {
  CAMILLE_DEFAULT_OPTION,
  countdownText,
  episodeShareText,
  episodeViewAt,
  utcClock,
  type EpisodeChoices,
  type EpisodeConfig,
  type PollId,
} from "@/lib/episode/paris-readiness";
import { xComposeUrl } from "@/lib/share/x-intent";
import styles from "./paris-readiness.module.css";

type Props = {
  config: EpisodeConfig;
  enabled: boolean;
  /** Server-synchronized wall clock. */
  nowMs: number;
  /** The server's authoritative launch; the episode exists only while it equals the config. */
  launchStartsAt: string | null;
  travelerName: string;
  /** A modal or checkout is open: story bubbles hide, the schedule carries on. */
  hidden: boolean;
};

const storageKey = (id: string) => `khw_episode_${id}`;

export function readChoices(id: string): EpisodeChoices {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey(id)) ?? "{}") as EpisodeChoices;
  } catch {
    return {};
  }
}

/** Is the episode showing anything at this instant? The page uses it to quiet his own monologue. */
export function episodeActive(config: EpisodeConfig, enabled: boolean, nowMs: number, launchStartsAt: string | null) {
  return episodeViewAt(config, nowMs, launchStartsAt, {}, enabled).phase !== "off";
}

export function ParisReadinessEpisode({ config, enabled, nowMs, launchStartsAt, travelerName, hidden }: Props) {
  const [choices, setChoices] = useState<EpisodeChoices>({});
  useEffect(() => {
    // Local storage is read after mount so the server render and the first client render agree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoices(readChoices(config.id));
  }, [config.id]);
  const save = (next: EpisodeChoices) => {
    setChoices(next);
    try {
      window.localStorage.setItem(storageKey(config.id), JSON.stringify(next));
    } catch { /* private storage can be unavailable; the choice still holds for this page */ }
  };
  const view = episodeViewAt(config, nowMs, launchStartsAt, choices, enabled);
  if (view.phase === "off") return null;
  // Always the server's start: 17:00 until the owner reschedules, then 18:00.
  const departure = utcClock(launchStartsAt!);
  const moved = Date.parse(launchStartsAt!) === Date.parse(config.actualLaunchAt);
  const window_ = `${utcClock(config.episodeStartAt).replace(" UTC", "")}–${utcClock(config.episodeEndAt)}`;
  const speakerName = (speaker: "milo" | "camille") => speaker === "camille" ? "Camille" : travelerName;
  const choose = (poll: PollId, option: number) => {
    if (choices[poll] !== undefined) return;
    save({ ...choices, [poll]: option });
  };

  return (
    <section className={styles.episode} data-testid="paris-episode" data-phase={view.phase} aria-label="Paris readiness check">
      <div className={styles.card}>
        {view.phase === "before" ? <>
          <strong>Paris readiness check · {window_}</strong>
          <span>Journey departs {departure}</span>
        </> : view.phase === "ended" ? <>
          <strong>Preparation continues · Departure {departure}</strong>
          <small>The Paris readiness episode has ended.</small>
        </> : <>
          <strong>{view.phase === "reveal" ? `Route rescue next · Departure ${departure}` : "Paris readiness check"}</strong>
          <span>
            Episode ends in <span data-testid="episode-ends-in">{countdownText(view.episodeEndsInMs ?? 0)}</span>
            {" · "}Journey departs {departure}
          </span>
          {view.chapter ? <small>Now: {view.chapter}</small> : null}
          {moved ? <small>Departure updated to {departure}. Paris readiness episode: {window_}.</small> : null}
        </>}
      </div>

      {!hidden && view.line ? (
        <p className={styles.line} data-speaker={view.line.speaker} data-line-id={view.line.id} aria-live="polite">
          <span className={styles.speaker}>{speakerName(view.line.speaker)}</span>
          <span key={view.line.id}>{view.line.text}</span>
        </p>
      ) : null}

      {!hidden && view.poll ? (
        <div className={styles.poll} data-testid={`episode-poll-${view.poll.id}`}>
          <strong>Choose Milo&apos;s reply · {view.poll.question}</strong>
          <small>
            {view.poll.open
              ? `Your own choice, kept in this browser. Not a community vote. Closes ${utcClock(new Date(view.poll.closesAtMs).toISOString())}.`
              : view.poll.choice === null
                ? `Closed. Camille's pick: ${view.poll.options[CAMILLE_DEFAULT_OPTION]}`
                : `Closed. Your choice: ${view.poll.options[view.poll.choice]}`}
          </small>
          {view.poll.open ? (
            <div className={styles.options}>
              {view.poll.options.map((option, index) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={view.poll?.choice === index}
                  disabled={view.poll?.choice !== null}
                  onClick={() => choose(view.poll!.id, index)}
                >
                  {option}{view.poll?.choice === index ? " · Your choice" : ""}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {!hidden && view.helpVisible ? (
        <div className={styles.poll}>
          <button
            type="button"
            className={styles.help}
            disabled={choices.helpedAtMs !== undefined}
            onClick={() => save({ ...choices, helpedAtMs: nowMs })}
          >
            {choices.helpedAtMs !== undefined ? "Thanks for helping Milo" : "Help Milo get ready"}
          </button>
          <small>Encourage him while Camille fixes his fictional itinerary. Departure: {departure}.</small>
        </div>
      ) : null}

      {!hidden && view.shareVisible ? (
        <a className={styles.share} href={xComposeUrl(episodeShareText(config))} target="_blank" rel="noopener noreferrer">
          Invite a friend
        </a>
      ) : null}
    </section>
  );
}
