"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trackVisitorEvent } from "@/lib/analytics/client";
import type {
  BootstrapSnapshot,
  HeartbeatResponse,
  ScheduledEventView,
} from "@/lib/contracts";
import type { TravelerState } from "@/lib/content/schema";
import {
  activeDialogueLineIndex,
  deterministicAmbientAction,
  estimatedServerNow,
  eventProgress,
  synchronizeClock,
} from "@/lib/story-clock";
import type { TravelerCommand } from "@/lib/traveler/types";
import { useJourneyAudio } from "@/hooks/useJourneyAudio";
import { useJourneyPresence } from "@/hooks/useJourneyPresence";
import { useMotionPreference } from "@/hooks/useMotionPreference";
import { SceneStage } from "@/components/scene/SceneStage";
import { Traveler } from "@/components/traveler/Traveler";
import { EncounterDialogue } from "@/components/dialogue/EncounterDialogue";
import { JourneyHud } from "@/components/hud/JourneyHud";
import { ContributionMeter } from "@/components/hud/ContributionMeter";
import { SoundMotionControls } from "@/components/hud/SoundMotionControls";
import { DailyVote } from "@/components/vote/DailyVote";

type Props = {
  initialSnapshot: BootstrapSnapshot;
};

function currentlyActiveEvent(
  snapshot: BootstrapSnapshot,
  nowMs: number,
): ScheduledEventView | null {
  for (const event of [snapshot.activeEvent, snapshot.nextEvent]) {
    if (!event) continue;
    const start = new Date(event.startsAt).getTime();
    if (nowMs >= start && nowMs < start + event.durationSeconds * 1_000) return event;
  }
  return null;
}

function encounterTravelerState(
  event: ScheduledEventView,
  nowMs: number,
): TravelerState {
  const progress = eventProgress(event, nowMs);
  if (progress < 0.08) return "notice";
  if (progress < 0.16) return "approach";
  if (progress > 0.9) return "goodbye";
  const lineIndex = activeDialogueLineIndex(event, nowMs);
  return event.lines?.[lineIndex]?.speaker === "traveler" ? "talk" : "listen";
}

export function JourneyExperience({ initialSnapshot }: Props) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [heartbeat, setHeartbeat] = useState<HeartbeatResponse | null>(null);
  const [clock, setClock] = useState(() => synchronizeClock(initialSnapshot.serverNow));
  const [serverNowMs, setServerNowMs] = useState(() => new Date(initialSnapshot.serverNow).getTime());
  const [sceneRenderer, setSceneRenderer] = useState<"pixi" | "static" | null>(null);
  const [travelerReady, setTravelerReady] = useState(false);
  const [voteOpen, setVoteOpen] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [loadingLive, setLoadingLive] = useState(true);
  const [welcomeOriginMs] = useState(() => new Date(initialSnapshot.serverNow).getTime());
  const readyReported = useRef(false);
  const watchReported = useRef(false);
  const seenMilestones = useRef(new Set<number>());
  const viewedEvents = useRef(new Set<string>());
  const completedDialogues = useRef(new Set<string>());
  const loadStarted = useRef(0);
  const { reducedMotion, toggle: toggleMotion } = useMotionPreference();

  useEffect(() => {
    loadStarted.current = performance.now();
    trackVisitorEvent("journey_viewed", {
      day: initialSnapshot.countryDay.dayNumber,
      country: initialSnapshot.countryDay.countryCode,
    });
  }, [initialSnapshot.countryDay.countryCode, initialSnapshot.countryDay.dayNumber]);

  const refreshBootstrap = useCallback(async () => {
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      if (!response.ok) throw new Error("Bootstrap unavailable");
      const next = (await response.json()) as BootstrapSnapshot;
      setSnapshot(next);
      setClock(synchronizeClock(next.serverNow));
    } catch {
      setSnapshot((current) => ({
        ...current,
        mode: "offline_preview",
        presence: { ...current.presence, activeViewers: null, status: "offline" },
        steps: { ...current.steps, stale: true },
        vote: null,
      }));
    } finally {
      setLoadingLive(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshBootstrap(), 0);
    const resync = window.setInterval(() => void refreshBootstrap(), 5 * 60 * 1_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(resync);
    };
  }, [refreshBootstrap]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setServerNowMs(estimatedServerNow(clock));
    }, 500);
    return () => window.clearInterval(tick);
  }, [clock]);

  const handleHeartbeat = useCallback((next: HeartbeatResponse) => {
    setHeartbeat(next);
    setClock(synchronizeClock(next.serverNow));
  }, []);

  const experienceReady = sceneRenderer !== null && travelerReady;
  const connectionStatus = useJourneyPresence({
    snapshot,
    sceneReady: experienceReady,
    onHeartbeat: handleHeartbeat,
  });
  const activeViewers = heartbeat?.activeViewers ?? snapshot.presence.activeViewers;
  const walking = snapshot.mode === "live" && connectionStatus === "live" && (activeViewers ?? 0) > 0;
  const { enabled: soundEnabled, available: soundAvailable, toggle: toggleSound } =
    useJourneyAudio(walking);

  useEffect(() => {
    if (walking && !watchReported.current) {
      watchReported.current = true;
      trackVisitorEvent("watch_session_started", {
        day: snapshot.countryDay.dayNumber,
        country: snapshot.countryDay.countryCode,
      });
    }
  }, [snapshot.countryDay.countryCode, snapshot.countryDay.dayNumber, walking]);

  const activeEvent = currentlyActiveEvent(snapshot, serverNowMs);
  const lineIndex = activeEvent ? activeDialogueLineIndex(activeEvent, serverNowMs) : -1;
  const activeLine = activeEvent?.lines?.[lineIndex] ?? null;
  const lastScheduledEvent = snapshot.activeEvent ?? snapshot.nextEvent;
  const replayAvailable = Boolean(
    lastScheduledEvent &&
      serverNowMs >=
        new Date(lastScheduledEvent.startsAt).getTime() +
          lastScheduledEvent.durationSeconds * 1_000,
  );

  useEffect(() => {
    if (
      !lastScheduledEvent ||
      lastScheduledEvent.type !== "encounter" ||
      !replayAvailable ||
      completedDialogues.current.has(lastScheduledEvent.id)
    ) return;
    completedDialogues.current.add(lastScheduledEvent.id);
    trackVisitorEvent("dialogue_completed", {
      encounter_id: lastScheduledEvent.id,
      duration: lastScheduledEvent.durationSeconds,
    });
  }, [lastScheduledEvent, replayAvailable]);

  useEffect(() => {
    if (!activeEvent || viewedEvents.current.has(activeEvent.id)) return;
    viewedEvents.current.add(activeEvent.id);
    trackVisitorEvent("story_event_viewed", {
      event_id: activeEvent.id,
      event_type: activeEvent.type,
      completion: 0,
    });
  }, [activeEvent]);

  const ambient = useMemo(
    () => deterministicAmbientAction(snapshot.assets, serverNowMs),
    [serverNowMs, snapshot.assets],
  );
  const visitorSeconds = heartbeat?.visitorActiveSeconds ?? 0;
  const visitorSteps = Math.floor(visitorSeconds * 1.8);

  useEffect(() => {
    for (const milestone of [30, 60, 120, 300]) {
      if (visitorSeconds >= milestone && !seenMilestones.current.has(milestone)) {
        seenMilestones.current.add(milestone);
        trackVisitorEvent("contribution_milestone", {
          seconds: milestone,
          steps: Math.floor(milestone * 1.8),
          day: snapshot.countryDay.dayNumber,
        });
      }
    }
  }, [snapshot.countryDay.dayNumber, visitorSeconds]);

  let travelerState: TravelerState = walking ? "walk" : "idle";
  if (activeEvent?.type === "encounter") {
    travelerState = encounterTravelerState(activeEvent, serverNowMs);
  } else if (serverNowMs - welcomeOriginMs >= 75_000 && serverNowMs - welcomeOriginMs < 83_000) {
    travelerState = "wave";
  } else if (walking && ambient) {
    travelerState = ambient.state;
  }
  const command: TravelerCommand = {
    state: travelerState,
    mood: activeLine?.mood ?? "neutral",
    facing: "right",
    walkingSpeed: walking ? 1 : 0,
    reducedMotion,
  };

  const sceneDidReady = useCallback((renderer: "pixi" | "static") => {
    setSceneRenderer(renderer);
  }, []);

  useEffect(() => {
    if (!experienceReady || !sceneRenderer || readyReported.current) return;
    readyReported.current = true;
    trackVisitorEvent("scene_ready", {
      load_ms: Math.max(0, Math.round(performance.now() - loadStarted.current)),
      asset_version: snapshot.assets.assetVersion,
      renderer: sceneRenderer,
    });
  }, [experienceReady, sceneRenderer, snapshot.assets.assetVersion]);

  const localTime = useMemo(
    () =>
      new Intl.DateTimeFormat("en", {
        timeZone: snapshot.countryDay.timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(serverNowMs),
    [serverNowMs, snapshot.countryDay.timeZone],
  );

  const share = async () => {
    const data = {
      title: "Keep Him Walking",
      text: "He only walks while someone is watching. I’m helping him cross Tashkent.",
      url: window.location.href,
    };
    try {
      if (navigator.share) await navigator.share(data);
      else await navigator.clipboard.writeText(data.url);
    } catch {
      // Dismissed share sheets and blocked clipboard access are non-fatal.
    }
  };

  const acceptVote = (optionId: string, totalBallots: number) => {
    setSnapshot((current) => ({
      ...current,
      vote: current.vote
        ? { ...current.vote, selectedOptionId: optionId, totalBallots }
        : null,
    }));
  };

  return (
    <main className="journey-shell" data-motion={reducedMotion ? "reduced" : "full"}>
      <SceneStage
        pack={snapshot.assets}
        walking={walking}
        reducedMotion={reducedMotion}
        onReady={sceneDidReady}
      />
      <div className="premise-lockup">
        <span className="eyebrow">ONE JOURNEY · LIVE ON THE INTERNET</span>
        <h1>He only walks while someone is watching.</h1>
      </div>
      <JourneyHud
        day={snapshot.countryDay}
        localTime={localTime}
        activeViewers={activeViewers}
        walking={walking}
        status={connectionStatus}
      />
      {loadingLive ? <div className="connection-banner">Connecting to the shared journey…</div> : null}
      {snapshot.mode === "offline_preview" && !loadingLive ? (
        <div className="connection-banner offline" role="status">
          Offline preview · live counts, steps and voting are unavailable
        </div>
      ) : null}

      <Traveler pack={snapshot.assets} command={command} onReady={() => setTravelerReady(true)} />
      <div className="traveler-state" role="status">
        <span aria-hidden="true">{walking ? "→" : "•"}</span>
        {activeEvent ? "A shared story moment" : ambient?.label ?? (walking ? "Walking through Tashkent" : "Waiting for the internet")}
      </div>
      <EncounterDialogue
        line={activeLine}
        locationLabel={activeEvent?.locationLabel}
        npcSrc={snapshot.assets.npcAssets[activeLine?.speaker === "npc" ? "talk" : "neutral"] ?? snapshot.assets.npcAssets.neutral}
        replayAvailable={replayAvailable}
        replayOpen={replayOpen}
        onReplay={() => setReplayOpen(true)}
        onCloseReplay={() => setReplayOpen(false)}
      />

      <section className="bottom-dock" aria-label="Journey controls">
        <ContributionMeter
          seconds={visitorSeconds}
          steps={visitorSteps}
          globalSteps={heartbeat?.globalSteps ?? snapshot.steps.global}
          stale={connectionStatus !== "live" || snapshot.steps.stale}
        />
        <div className="primary-controls">
          <button type="button" onClick={() => setVoteOpen(true)}>
            <span className="control-icon" aria-hidden="true">✓</span>
            Daily vote
          </button>
          <button type="button" onClick={() => void share()}>
            <span className="control-icon" aria-hidden="true">↗</span>
            Share
          </button>
        </div>
        <SoundMotionControls
          soundEnabled={soundEnabled}
          soundAvailable={soundAvailable}
          reducedMotion={reducedMotion}
          onToggleSound={() => void toggleSound()}
          onToggleMotion={toggleMotion}
        />
        <div className="sponsor-note">
          <span className="eyebrow">TODAY</span>
          <span>Unsponsored</span>
        </div>
      </section>

      <DailyVote
        vote={snapshot.vote}
        open={voteOpen}
        onClose={() => setVoteOpen(false)}
        onAccepted={acceptVote}
      />
      <p className="sr-only" aria-live="polite">
        {activeLine ? `${activeLine.speaker}: ${activeLine.text}` : ""}
      </p>
    </main>
  );
}
