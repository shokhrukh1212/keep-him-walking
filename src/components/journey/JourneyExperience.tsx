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
import { useQualityTier } from "@/hooks/useQualityTier";
import { useRouteRuntime } from "@/hooks/useRouteRuntime";
import { useIntroHeadline } from "@/hooks/useIntroHeadline";
import { encounterPhaseAt, worldCommandForEncounter } from "@/lib/world/encounter-timeline";
import { motionPhaseAt, motionSpeedForPhase } from "@/lib/world/motion-machine";
import { routePositionAt } from "@/lib/world/route-clock";
import type { MotionTransition } from "@/lib/world/motion-machine";
import type { WorldDiagnosticsSnapshot } from "@/lib/world/types";
import { SceneStage } from "@/components/scene/SceneStage";
import { Traveler } from "@/components/traveler/Traveler";
import { EncounterDialogue } from "@/components/dialogue/EncounterDialogue";
import { JourneyHud } from "@/components/hud/JourneyHud";
import { ContributionMeter } from "@/components/hud/ContributionMeter";
import { SoundMotionControls } from "@/components/hud/SoundMotionControls";
import { DailyVote } from "@/components/vote/DailyVote";
import { WorldDiagnostics } from "@/components/debug/WorldDiagnostics";
import { IntroHeadline } from "@/components/hud/IntroHeadline";
import { WalkingRuleStatus } from "@/components/hud/WalkingRuleStatus";
import { PostcardButton } from "@/components/postcard/PostcardButton";
import { PASSPORT_KEY } from "@/components/archive/PassportArchive";
import Link from "next/link";
import { getNextCountryPack } from "@/content/countries/registry";

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
  if (progress < 0.15) return "slow_walk";
  if (progress < 0.28) return "approach";
  if (progress < 0.36) return "greet";
  if (progress >= 0.82) return "resume_walk";
  if (progress >= 0.62) return "goodbye";
  if (progress >= 0.55) return "react";
  const lineIndex = activeDialogueLineIndex(event, nowMs);
  return event.lines?.[lineIndex]?.speaker === "traveler" ? "talk" : "listen";
}

export function JourneyExperience({ initialSnapshot }: Props) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [heartbeatState, setHeartbeat] = useState<{
    countryDayId: string;
    response: HeartbeatResponse;
  } | null>(null);
  const heartbeat = heartbeatState?.countryDayId === snapshot.countryDay.id
    ? heartbeatState.response
    : null;
  const [clock, setClock] = useState(() => synchronizeClock(initialSnapshot.serverNow, Date.now(), initialSnapshot.storyScale ?? 1));
  const [realClock, setRealClock] = useState(() => synchronizeClock(initialSnapshot.realServerNow ?? initialSnapshot.serverNow));
  const [serverNowMs, setServerNowMs] = useState(() => new Date(initialSnapshot.serverNow).getTime());
  const [sceneRenderer, setSceneRenderer] = useState<"pixi" | "static" | null>(null);
  const [travelerReady, setTravelerReady] = useState(false);
  const [voteOpen, setVoteOpen] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [loadingLive, setLoadingLive] = useState(true);
  const [renderedZone, setRenderedZone] = useState(() => ({
    id: initialSnapshot.assets.route.zones[0]?.id ?? "arrival",
    label: initialSnapshot.assets.route.zones[0]?.label ?? initialSnapshot.countryDay.cityName,
  }));
  const [motionTransition, setMotionTransition] = useState<MotionTransition>({
    desiredWalking: false,
    changedAtMs: new Date(initialSnapshot.serverNow).getTime(),
  });
  const [worldDiagnostics, setWorldDiagnostics] = useState<WorldDiagnosticsSnapshot | null>(null);
  const [welcomeOriginMs] = useState(() => new Date(initialSnapshot.serverNow).getTime());
  const readyReported = useRef(false);
  const watchReported = useRef(false);
  const seenMilestones = useRef(new Set<number>());
  const viewedEvents = useRef(new Set<string>());
  const completedDialogues = useRef(new Set<string>());
  const lastLocomotion = useRef<string | null>(null);
  const lastZone = useRef<string | null>(null);
  const qualityReported = useRef(false);
  const lastBudgetReport = useRef(0);
  const sponsorMetrics = useRef(new Set<string>());
  const [hasWalked, setHasWalked] = useState(false);
  const loadStarted = useRef(0);
  const { reducedMotion, toggle: toggleMotion } = useMotionPreference();
  const qualityTier = useQualityTier(reducedMotion);

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
      setClock(synchronizeClock(next.serverNow, Date.now(), next.storyScale ?? 1));
      setRealClock(synchronizeClock(next.realServerNow ?? next.serverNow));
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
    const resync = window.setTimeout(
      () => void refreshBootstrap(),
      Math.max(1_000, Math.min(5 * 60_000, snapshot.refresh.afterMs)),
    );
    return () => {
      window.clearTimeout(initial);
      window.clearTimeout(resync);
    };
  }, [refreshBootstrap, snapshot.refresh.afterMs]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setServerNowMs(estimatedServerNow(clock));
    }, 500);
    return () => window.clearInterval(tick);
  }, [clock]);

  const handleHeartbeat = useCallback((next: HeartbeatResponse) => {
    setHeartbeat({ countryDayId: snapshot.countryDay.id, response: next });
    setClock(synchronizeClock(next.serverNow, Date.now(), next.storyScale ?? 1));
    setRealClock(synchronizeClock(next.realServerNow ?? next.serverNow));
    setServerNowMs(new Date(next.serverNow).getTime());
    setSnapshot((current) => current.countryDay.id === snapshot.countryDay.id
      ? {
          ...current,
          route: {
            globalActiveSeconds: next.globalActiveSeconds,
            authoritativeAt: next.routeAuthoritativeAt,
            walking: next.walking,
          },
        }
      : current);
    setMotionTransition((current) => current.desiredWalking === next.walking
      ? current
      : {
          desiredWalking: next.walking,
          changedAtMs: new Date(next.serverNow).getTime(),
        });
  }, [snapshot.countryDay.id]);

  const experienceReady = sceneRenderer !== null && travelerReady;
  const connectionStatus = useJourneyPresence({
    snapshot,
    sceneReady: experienceReady,
    onHeartbeat: handleHeartbeat,
  });
  const activeViewers = heartbeat?.activeViewers ?? snapshot.presence.activeViewers;
  const walking = snapshot.mode === "live" && connectionStatus === "live" && (activeViewers ?? 0) > 0;
  const initialRoutePosition = routePositionAt(
    snapshot.assets,
    heartbeat?.globalActiveSeconds ?? snapshot.route.globalActiveSeconds,
  );
  const zoneAudioId = snapshot.assets.route.zones[initialRoutePosition.zoneIndex]?.audioIds[0];
  const ambientAudioUrl = snapshot.assets.audio.find((asset) => asset.id === zoneAudioId)?.url;
  const { enabled: soundEnabled, available: soundAvailable, toggle: toggleSound } =
    useJourneyAudio(walking, ambientAudioUrl);

  useEffect(() => {
    if (walking || !motionTransition.desiredWalking) return;
    const update = window.setTimeout(() => {
      setMotionTransition({ desiredWalking: false, changedAtMs: estimatedServerNow(clock) });
    }, 0);
    return () => window.clearTimeout(update);
  }, [clock, motionTransition.desiredWalking, walking]);

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
  const encounterProgress = activeEvent?.type === "encounter"
    ? eventProgress(activeEvent, serverNowMs)
    : -1;
  const encounterPhase = encounterPhaseAt(encounterProgress);
  const locomotionPhase = motionPhaseAt(motionTransition, serverNowMs, hasWalked);
  const locomotionSpeed = motionSpeedForPhase(locomotionPhase);
  useEffect(() => {
    let walkedTimer: number | null = null;
    if (locomotionPhase === "walk" && !hasWalked) {
      walkedTimer = window.setTimeout(() => setHasWalked(true), 0);
    }
    if (lastLocomotion.current === locomotionPhase) return;
    lastLocomotion.current = locomotionPhase;
    trackVisitorEvent("locomotion_transition", { phase: locomotionPhase });
    return () => {
      if (walkedTimer) window.clearTimeout(walkedTimer);
    };
  }, [hasWalked, locomotionPhase]);
  const { runtime: routeRuntime, seconds: routeSeconds, position: routePosition } =
    useRouteRuntime(snapshot, heartbeat, estimatedServerNow(realClock));
  const introHeadline = useIntroHeadline(walking, welcomeOriginMs, serverNowMs);
  const baseWorldCommand = worldCommandForEncounter(encounterPhase, walking);
  const eventStage = snapshot.assets.route.zones[routePosition.zoneIndex]?.eventStage;
  const worldCommand = {
    ...baseWorldCommand,
    speedFactor: baseWorldCommand.speedFactor * locomotionSpeed,
    cameraZoom: baseWorldCommand.cameraZoom > 1 ? eventStage?.cameraZoom ?? baseWorldCommand.cameraZoom : 1,
    cameraPan: baseWorldCommand.cameraZoom > 1 ? eventStage?.cameraPan ?? baseWorldCommand.cameraPan : 0,
    backgroundLife: baseWorldCommand.cameraZoom > 1
      ? eventStage?.backgroundLife ?? baseWorldCommand.backgroundLife
      : 1,
  };

  useEffect(() => {
    if (lastZone.current === routePosition.zoneId) return;
    lastZone.current = routePosition.zoneId;
    trackVisitorEvent("route_zone_entered", {
      zone: routePosition.zoneId,
      route_seconds: Math.round(routeSeconds),
    });
  }, [routePosition.zoneId, routeSeconds]);

  useEffect(() => {
    if (snapshot.assets.schemaVersion !== 3) return;
    const isDeparture = routePosition.zoneIndex === snapshot.assets.route.zones.length - 1;
    if (!isDeparture || routePosition.zoneProgress < 0.7) return;
    const next = getNextCountryPack(snapshot.assets.assetVersion);
    if (!next) return;
    for (const url of next.schemaVersion === 3
      ? next.preloadGroups.find((group) => group.timing === "critical")?.assets ?? next.preload
      : next.preload) {
      const image = new Image();
      image.decoding = "async";
      image.src = url;
    }
  }, [routePosition.zoneIndex, routePosition.zoneProgress, snapshot.assets]);

  useEffect(() => {
    if (qualityReported.current) return;
    qualityReported.current = true;
    trackVisitorEvent("world_quality_selected", { tier: qualityTier });
  }, [qualityTier]);

  useEffect(() => {
    if (!worldDiagnostics || serverNowMs - lastBudgetReport.current < 30_000) return;
    lastBudgetReport.current = serverNowMs;
    trackVisitorEvent("world_frame_budget", {
      tier: qualityTier,
      fps: worldDiagnostics.fps,
      p95_ms: worldDiagnostics.p95FrameMs,
      objects: worldDiagnostics.liveObjects,
    });
  }, [qualityTier, serverNowMs, worldDiagnostics]);
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
    trackVisitorEvent("encounter_sequence_completed", {
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

  let travelerState: TravelerState = locomotionPhase;
  if (activeEvent?.type === "encounter") {
    travelerState = encounterTravelerState(activeEvent, serverNowMs);
  } else if (serverNowMs - welcomeOriginMs >= 75_000 && serverNowMs - welcomeOriginMs < 83_000) {
    travelerState = "wave";
  } else if (
    locomotionPhase === "walk" &&
    serverNowMs - motionTransition.changedAtMs > 5_000 &&
    ambient
  ) {
    travelerState = ambient.state;
  }
  const command: TravelerCommand = {
    state: travelerState,
    mood: activeLine?.mood ?? "neutral",
    facing: "right",
    walkingSpeed: worldCommand.speedFactor,
    reducedMotion,
    sponsorPatchUrl: snapshot.sponsor.status === "sponsored" ? snapshot.sponsor.patchUrl ?? undefined : undefined,
  };

  const sceneDidReady = useCallback((renderer: "pixi" | "static") => {
    setSceneRenderer(renderer);
  }, []);
  const worldDidFail = useCallback(() => {
    trackVisitorEvent("world_asset_failure", {
      asset_version: snapshot.assets.assetVersion,
    });
  }, [snapshot.assets.assetVersion]);
  const zoneDidChange = useCallback((id: string, label: string) => {
    setRenderedZone({ id, label });
  }, []);

  useEffect(() => {
    if (!experienceReady || !sceneRenderer || readyReported.current) return;
    readyReported.current = true;
    trackVisitorEvent("scene_ready", {
      load_ms: Math.max(0, Math.round(performance.now() - loadStarted.current)),
      asset_version: snapshot.assets.assetVersion,
      renderer: sceneRenderer,
    });
    if (snapshot.assets.schemaVersion === 3) {
      try {
        const stamps = new Set(JSON.parse(localStorage.getItem(PASSPORT_KEY) ?? "[]") as string[]);
        stamps.add(snapshot.assets.assetVersion);
        localStorage.setItem(PASSPORT_KEY, JSON.stringify([...stamps]));
      } catch {
        // Storage can be blocked; passport stamps are an optional local enhancement.
      }
    }
  }, [experienceReady, sceneRenderer, snapshot.assets.assetVersion, snapshot.assets.schemaVersion]);

  useEffect(() => {
    if (!experienceReady || snapshot.sponsor.status !== "sponsored") return;
    const eventType = visitorSeconds >= 10 ? "engaged_view" : "impression";
    if (sponsorMetrics.current.has(eventType)) return;
    sponsorMetrics.current.add(eventType);
    void fetch("/api/sponsor/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicId: snapshot.sponsor.publicId, eventType }),
    });
    trackVisitorEvent(eventType === "impression" ? "sponsor_impression" : "sponsor_engaged_view", {
      sponsor_id: snapshot.sponsor.publicId,
    });
  }, [experienceReady, snapshot.sponsor, visitorSeconds]);

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
      text: `He only walks while someone is watching. I’m helping him cross ${snapshot.countryDay.cityName}.`,
      url: window.location.href,
    };
    try {
      if (navigator.share) await navigator.share(data);
      else await navigator.clipboard.writeText(data.url);
    } catch {
      // Dismissed share sheets and blocked clipboard access are non-fatal.
    }
  };
  const displayedZoneLabel = reducedMotion ? routePosition.zoneLabel : renderedZone.label;
  const displayedZoneIndex = reducedMotion
    ? routePosition.zoneIndex
    : Math.max(0, snapshot.assets.route.zones.findIndex((zone) => zone.id === renderedZone.id));

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
        routeSeconds={routeSeconds}
        routeRuntime={routeRuntime}
        command={worldCommand}
        qualityTier={qualityTier}
        reducedMotion={reducedMotion}
        onZoneChange={zoneDidChange}
        onDiagnostics={setWorldDiagnostics}
        onWorldFailure={worldDidFail}
        onReady={sceneDidReady}
      />
      <IntroHeadline collapsed={introHeadline.collapsed} />
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
      <WalkingRuleStatus
        walking={walking}
        label={activeEvent
          ? "A shared story moment"
          : ambient?.label ?? (walking ? `Walking · ${displayedZoneLabel}` : "Waiting for the internet")}
      />
      <div className="route-status" aria-label={`Current route zone: ${displayedZoneLabel}`}>
        <span>Route {displayedZoneIndex + 1}/{snapshot.assets.route.zones.length}</span>
        <strong>{displayedZoneLabel}</strong>
      </div>
      <nav className="journey-links" aria-label="Journey links">
        <Link href="/archive">Passport</Link>
        <Link href="/sponsor">Sponsor a day</Link>
        <Link href="/privacy">Privacy</Link>
      </nav>
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
          {snapshot.assets.schemaVersion === 3 ? (
            <PostcardButton
              countryDayId={snapshot.countryDay.id}
              eligible={snapshot.postcard.eligible}
              unlockSeconds={snapshot.postcard.unlockSeconds}
              contributedSeconds={visitorSeconds}
              existingUrl={snapshot.postcard.url}
              sponsorPublicId={snapshot.sponsor.status === "sponsored" ? snapshot.sponsor.publicId : undefined}
            />
          ) : null}
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
          {snapshot.sponsor.status === "sponsored" ? (
            snapshot.sponsor.clickUrl
              ? <a href={snapshot.sponsor.clickUrl} onClick={() => trackVisitorEvent("sponsor_cta_clicked", { sponsor_id: snapshot.sponsor.status === "sponsored" ? snapshot.sponsor.publicId : "" })}>{snapshot.sponsor.disclosure} · {snapshot.sponsor.name}</a>
              : <span>{snapshot.sponsor.disclosure} · {snapshot.sponsor.name}</span>
          ) : <a href="/sponsor">Unsponsored · Sponsor a day</a>}
        </div>
      </section>

      <DailyVote
        vote={snapshot.vote}
        open={voteOpen}
        onClose={() => setVoteOpen(false)}
        onAccepted={acceptVote}
      />
      <WorldDiagnostics
        snapshot={worldDiagnostics}
        locomotionPhase={locomotionPhase}
        qualityTier={qualityTier}
        renderer={sceneRenderer}
        authoritativeRouteSeconds={routeSeconds}
      />
      <p className="sr-only" aria-live="polite">
        {activeLine ? `${activeLine.speaker}: ${activeLine.text}` : ""}
      </p>
    </main>
  );
}
