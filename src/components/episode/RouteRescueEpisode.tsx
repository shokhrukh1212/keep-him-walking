"use client";

import { useEffect, useState } from "react";
import { countdownText, utcClock } from "@/lib/episode/paris-readiness";
import {
  CAMILLE_DEFAULT_OPTION,
  newlyCrossed,
  rescueViewAt,
  witnessShareText,
  type RescueChoices,
  type RescuePollId,
  type RouteRescueConfig,
  type WitnessCrossing,
} from "@/lib/episode/route-rescue";
import { xComposeUrl } from "@/lib/share/x-intent";
import styles from "./paris-readiness.module.css";

export type WitnessRecord = { peak: number | null; stamp: number | null; crossings: WitnessCrossing[] };

type Props = {
  config: RouteRescueConfig;
  enabled: boolean;
  nowMs: number;
  launchStartsAt: string | null;
  travelerName: string;
  hidden: boolean;
  /** The header's people-watching count, or null while unknown. */
  watching: number | null;
};

function read<T>(key: string, fallback: T): T {
  try {
    return { ...fallback, ...(JSON.parse(window.localStorage.getItem(key) ?? "{}") as T) };
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch { /* private storage can be unavailable */ }
}

export const rescueChoicesKey = (id: string) => `khw_episode_${id}`;
const witnessKey = (id: string) => `khw_episode_${id}_witnesses`;

export function readRescueChoices(id: string): RescueChoices {
  return read<RescueChoices>(rescueChoicesKey(id), {});
}
export function readWitnesses(id: string): WitnessRecord {
  return read<WitnessRecord>(witnessKey(id), { peak: null, stamp: null, crossings: [] });
}

export function RouteRescueEpisode({ config, enabled, nowMs, launchStartsAt, travelerName, hidden, watching }: Props) {
  const [choices, setChoices] = useState<RescueChoices>({});
  const [witnesses, setWitnesses] = useState<WitnessRecord>({ peak: null, stamp: null, crossings: [] });
  const [mountedAtMs, setMountedAtMs] = useState<number | null>(null);
  const [firstSeenMs] = useState(nowMs);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoices(readRescueChoices(config.id));
    setWitnesses(readWitnesses(config.id));
    setMountedAtMs(Date.now());
  }, [config.id]);

  const startMs = Date.parse(config.episode2StartAt);
  const launchMs = Date.parse(config.actualLaunchAt);
  // The peak only counts readings taken during this episode, and a first reading fires nothing.
  useEffect(() => {
    if (mountedAtMs === null || watching === null || nowMs < startMs || nowMs >= launchMs) return;
    const stored = readWitnesses(config.id);
    let next = stored;
    if (stored.peak === null || watching > stored.peak) {
      const crossed = newlyCrossed(config.milestones, stored.peak, watching)
        .filter((threshold) => !stored.crossings.some((crossing) => crossing.threshold === threshold));
      next = { ...stored, peak: watching, crossings: [...stored.crossings, ...crossed.map((threshold) => ({ threshold, atMs: nowMs }))] };
    }
    if (next.stamp === null && nowMs >= Date.parse(config.stampCeremonyAt)) next = { ...next, stamp: next.peak };
    if (next !== stored) {
      write(witnessKey(config.id), next);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWitnesses(next);
    }
  }, [config, launchMs, mountedAtMs, nowMs, startMs, watching]);

  const view = rescueViewAt(config, nowMs, launchStartsAt, choices, {
    stamp: witnesses.stamp ?? witnesses.peak,
    crossings: witnesses.crossings,
  }, enabled);
  if (!view.active) return null;
  const choose = (poll: RescuePollId, option: number) => {
    if (choices[poll] !== undefined) return;
    const next = { ...choices, [poll]: option };
    setChoices(next);
    write(rescueChoicesKey(config.id), next);
  };
  const departure = utcClock(config.actualLaunchAt);
  // One short recap for a late arrival, then the current scene.
  const lateJoin = firstSeenMs > startMs + 30_000 && nowMs - firstSeenMs < 30_000;
  const peak = witnesses.peak;
  const fill = peak === null ? 0 : Math.min(100, Math.round((peak / config.witnessGoal) * 100));

  return (
    <section className={styles.episode} data-testid="route-rescue-episode" aria-label="Route rescue">
      <div className={styles.card}>
        <strong>Route rescue</strong>
        <span>Departs in <span data-testid="departs-in">{countdownText(view.departsInMs)}</span> · {departure}</span>
        {view.chapter ? <small>Now: {view.chapter}</small> : null}
        {lateJoin ? <small>Previously: Camille found Milo&apos;s itinerary was fourteen postcards of Paris. Now she&apos;s fixing the route.</small> : null}
        {view.witnessesVisible ? <div className={styles.witness} data-testid="witness-bar">
          <span>Witnesses: {peak ?? "—"} / {config.witnessGoal}</span>
          <span className={styles.bar} aria-hidden="true"><span style={{ width: `${fill}%` }} /></span>
          <small>Most people watching at once since 17:00 UTC, as this page saw it. Not a verified count.</small>
        </div> : null}
        {view.stampVisible ? <span className={styles.stamp}>PARIS · 24 SEPT 2026 · Page one</span> : null}
      </div>

      {!hidden && view.line ? (
        <p className={styles.line} data-speaker={view.line.speaker} data-line-id={view.line.id} aria-live="polite">
          <span className={styles.speaker}>{view.line.speaker === "camille" ? "Camille" : travelerName}</span>
          <span key={view.line.id}>{view.line.text}</span>
        </p>
      ) : null}

      {!hidden && view.poll ? (
        <div className={styles.poll} data-testid={`episode-poll-${view.poll.id}`}>
          <strong>Choose Milo&apos;s reply · {view.poll.question}</strong>
          <small>
            {view.poll.open
              ? `Your own choice, kept in this browser. Not a community vote. Closes ${utcClock(new Date(view.poll.closesAtMs).toISOString())}.`
              : `Closed. ${view.poll.choice === null ? "Camille's pick" : "Your choice"}: ${view.poll.options[view.poll.choice ?? CAMILLE_DEFAULT_OPTION]}${view.poll.id === "lastWords" ? " · he says it at 17:59" : ""}`}
          </small>
          {view.poll.open ? (
            <div className={styles.options}>
              {view.poll.options.map((option, index) => (
                <button key={option} type="button" aria-pressed={view.poll?.choice === index}
                  disabled={view.poll?.choice !== null} onClick={() => choose(view.poll!.id, index)}>
                  {option}{view.poll?.choice === index ? " · Your choice" : ""}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {!hidden && view.witnessesVisible ? (
        <a className={styles.share} href={xComposeUrl(witnessShareText(config))} target="_blank" rel="noopener noreferrer">
          Bring a witness
        </a>
      ) : null}
    </section>
  );
}
