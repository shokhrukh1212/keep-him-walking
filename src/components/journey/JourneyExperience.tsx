"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { publicAssetUrl } from "@/lib/assets/url";
import { trackVisitorEvent } from "@/lib/analytics/client";
import type {
  BootstrapSnapshot,
  HeartbeatResponse,
  ScheduledEventView,
} from "@/lib/contracts";
import type { TravelerState } from "@/lib/content/schema";
import {
  estimatedServerNow,
  synchronizeClock,
} from "@/lib/story-clock";
import type { TravelerCommand } from "@/lib/traveler/types";
import { travelerMotionAt, visibleStepsBetween, type TravelerMotionSnapshot } from "@/lib/traveler/motion-clock";
import { sponsorPresentation } from "@/lib/traveler/demo-sponsor";
import { useJourneyAudio } from "@/hooks/useJourneyAudio";
import { useJourneyPresence } from "@/hooks/useJourneyPresence";
import { useMotionPreference } from "@/hooks/useMotionPreference";
import { useQualityTier } from "@/hooks/useQualityTier";
import { useRouteRuntime } from "@/hooks/useRouteRuntime";
import { useIntroHeadline } from "@/hooks/useIntroHeadline";
import { confirmedWalkingLease, walkingLeaseIsActive } from "@/lib/presence/walking-lease";
import { worldCommandForEncounter } from "@/lib/world/encounter-timeline";
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
import { GoalBar } from "@/components/hud/GoalBar";
import { PostcardButton } from "@/components/postcard/PostcardButton";
import { PASSPORT_KEY } from "@/components/archive/PassportArchive";
import Link from "next/link";
import { getNextCountryPack } from "@/content/countries/registry";
import { TomorrowPreview } from "@/components/hud/TomorrowPreview";
import {REVIEW_ACTIONS,reviewPoseAt,type ActionReview,type ReviewAction} from "@/lib/traveler/action-preview";
import {
  formatWaitDuration,
  formatWaitingLocalTime,
  waitedSecondsSince,
  waitingBehaviorAt,
} from "@/lib/presence/waiting";
import { WakeCard } from "@/components/journey/WakeCard";

type Props = {
  initialSnapshot: BootstrapSnapshot;
  previewDemoSponsor?: boolean;
};

type WakeMoment = {
  countryDayId: string;
  waitingSince: string;
  wokeAt: string;
  waitedSeconds: number;
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

export function JourneyExperience({ initialSnapshot, previewDemoSponsor = false }: Props) {
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
  const [realNowMs, setRealNowMs] = useState(() => new Date(
    initialSnapshot.realServerNow ?? initialSnapshot.serverNow,
  ).getTime());
  const [sceneRenderer, setSceneRenderer] = useState<"pixi" | "static" | null>(null);
  const [travelerReady, setTravelerReady] = useState(false);
  const [puppetReady, setPuppetReady] = useState(false);
  const [residentReady, setResidentReady] = useState(false);
  const [presentationFrame,setPresentationFrame]=useState<{assetVersion:string;motion:TravelerMotionSnapshot}|null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [wakeBeat, setWakeBeat] = useState<WakeMoment | null>(null);
  const [wakeCard, setWakeCard] = useState<WakeMoment | null>(null);
  const [actionReview,setActionReview]=useState<ActionReview>({action:"auto",startedAt:0});
  const [reviewNow,setReviewNow]=useState(0);
  useEffect(()=>{
    if(!previewDemoSponsor||actionReview.action==="auto")return;
    const timer=window.setInterval(()=>setReviewNow(performance.now()),100);
    return ()=>window.clearInterval(timer);
  },[previewDemoSponsor,actionReview]);
  const review=previewDemoSponsor?reviewPoseAt(actionReview,reviewNow):null;
  const [visitorSteps,setVisitorSteps]=useState(0);
  const newestHeartbeat = useRef(-Infinity);
  const confirmedContribution = useRef({day:initialSnapshot.countryDay.id,raw:0,visitor:0,steps:0});
  const [voteOpen, setVoteOpen] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [loadingLive, setLoadingLive] = useState(true);
  const [renderedZone, setRenderedZone] = useState(() => ({
    id: initialSnapshot.assets.route.zones[0]?.id ?? "arrival",
    label: initialSnapshot.assets.route.zones[0]?.label ?? initialSnapshot.countryDay.cityName,
  }));
  const [motionTransition, setMotionTransition] = useState<MotionTransition>({
    desiredWalking: false,
    changedAtMs: new Date(initialSnapshot.realServerNow ?? initialSnapshot.serverNow).getTime(),
  });
  const [worldDiagnostics, setWorldDiagnostics] = useState<WorldDiagnosticsSnapshot | null>(null);
  const [welcomeOriginMs] = useState(() => new Date(initialSnapshot.serverNow).getTime());
  const [walkingLease, setWalkingLease] = useState(() => confirmedWalkingLease(
    (initialSnapshot.presence.activeViewers ?? 0) > 0,
    initialSnapshot.presence.ttlSeconds,
    new Date(initialSnapshot.realServerNow ?? initialSnapshot.serverNow).getTime(),
  ));
  const readyReported = useRef(new Set<string>());
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
  const reducedMotion = useMotionPreference();
  const qualityTier = useQualityTier(reducedMotion);

  useEffect(() => {
    loadStarted.current = performance.now();
    trackVisitorEvent("journey_viewed", {
      day: initialSnapshot.countryDay.dayNumber,
      country: initialSnapshot.countryDay.countryCode,
    });
  }, [initialSnapshot.countryDay.countryCode, initialSnapshot.countryDay.dayNumber]);

  const refreshBootstrap = useCallback(async (): Promise<number> => {
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      if (!response.ok) throw new Error("Bootstrap unavailable");
      const next = (await response.json()) as BootstrapSnapshot;
      setSnapshot(current=> next.mode !== "live" && current.mode === "live"
        ? {...current,presence:{...current.presence,status:"reconnecting"},steps:{...current.steps,stale:true}}
        : {...next,assets:current.assets.assetVersion === next.assets.assetVersion ? current.assets : next.assets});
      if (next.mode === "live") {
        setWalkingLease(confirmedWalkingLease(
          (next.presence.activeViewers ?? 0) > 0,
          next.presence.ttlSeconds,
          new Date(next.realServerNow ?? next.serverNow).getTime(),
        ));
      }
      setClock(synchronizeClock(next.serverNow, Date.now(), next.storyScale ?? 1));
      setRealClock(synchronizeClock(next.realServerNow ?? next.serverNow));
      return Math.max(1_000, Math.min(5 * 60_000, next.refresh.afterMs));
    } catch {
      setSnapshot((current) => current.mode === "live"
        ? {
            ...current,
            presence: { ...current.presence, status: "reconnecting" },
            steps: { ...current.steps, stale: true },
          }
        : current);
      return 5_000;
    } finally {
      setLoadingLive(false);
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    const schedule = (delayMs: number) => {
      timer = window.setTimeout(async () => {
        const nextDelayMs = await refreshBootstrap();
        if (!stopped) schedule(nextDelayMs);
      }, delayMs);
    };
    schedule(0);
    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [refreshBootstrap]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setServerNowMs(estimatedServerNow(clock));
      setRealNowMs(estimatedServerNow(realClock));
    }, 100);
    return () => window.clearInterval(tick);
  }, [clock, realClock]);

  const handleHeartbeat = useCallback((next: HeartbeatResponse) => {
    if (next.countryDayId && next.countryDayId !== snapshot.countryDay.id) return;
    const stamp = Date.parse(next.routeAuthoritativeAt);
    if (stamp < newestHeartbeat.current) return;
    newestHeartbeat.current = stamp;
    const previous=confirmedContribution.current;
    const sameDay=previous.day===snapshot.countryDay.id;
    const contributed=sameDay ? Math.max(0,next.visitorActiveSeconds-previous.visitor) : 0;
    // Only the newly acknowledged interval contributes; never slide an entire
    // session-length window forward through someone else's progress.
    confirmedContribution.current={day:snapshot.countryDay.id,raw:next.globalActiveSeconds,visitor:next.visitorActiveSeconds,
      steps:(sameDay?previous.steps:0)+visibleStepsBetween(snapshot.assets,
        Math.max(sameDay?previous.raw:next.globalActiveSeconds,next.globalActiveSeconds-contributed),next.globalActiveSeconds)};
    setVisitorSteps(confirmedContribution.current.steps);
    setHeartbeat({ countryDayId: snapshot.countryDay.id, response: next });
    const waitingSinceMs = next.waitingSince ? Date.parse(next.waitingSince) : Number.NaN;
    const wokeAtMs = Date.parse(next.realServerNow ?? next.serverNow);
    if (next.walking && next.activeViewers === 1
      && Number.isFinite(waitingSinceMs) && Number.isFinite(wokeAtMs)) {
      const moment: WakeMoment = {
        countryDayId: snapshot.countryDay.id,
        waitingSince: next.waitingSince!,
        wokeAt: new Date(wokeAtMs).toISOString(),
        waitedSeconds: Math.max(0, (wokeAtMs - waitingSinceMs) / 1_000),
      };
      setWakeBeat((current) => current?.waitingSince === moment.waitingSince
        ? current
        : moment);
      if (next.wokeHim) setWakeCard(moment);
    }
    setClock(synchronizeClock(next.serverNow, Date.now(), next.storyScale ?? 1));
    setRealClock(synchronizeClock(next.realServerNow ?? next.serverNow));
    setServerNowMs(new Date(next.serverNow).getTime());
    setRealNowMs(new Date(next.realServerNow ?? next.serverNow).getTime());
    setSnapshot((current) => current.countryDay.id === snapshot.countryDay.id
      ? {
          ...current,
          route: {
            globalActiveSeconds: next.globalActiveSeconds,
            globalDistanceMetres: next.globalDistanceMetres,
            paceRate: next.paceRate,
            authoritativeAt: next.routeAuthoritativeAt,
            walking: next.walking,
          },
        }
      : current);
    setWalkingLease(confirmedWalkingLease(
      next.walking,
      next.ttlSeconds,
      new Date(next.realServerNow ?? next.serverNow).getTime(),
    ));
  }, [snapshot.countryDay.id,snapshot.assets]);

  const experienceReady = sceneRenderer !== null && travelerReady;
  const connectionStatus = useJourneyPresence({
    snapshot,
    sceneReady: experienceReady,
    onHeartbeat: handleHeartbeat,
  });
  const activeViewers = heartbeat?.activeViewers ?? snapshot.presence.activeViewers;
  const authoritativeWalking = snapshot.mode === "live"
    && walkingLeaseIsActive(walkingLease, realNowMs);
  const wakeBeatEndsAtMs = wakeBeat ? Date.parse(wakeBeat.wokeAt) + 3_000 : 0;
  const waking = Boolean(authoritativeWalking
    && wakeBeat?.countryDayId === snapshot.countryDay.id
    && realNowMs < wakeBeatEndsAtMs);
  const walking = authoritativeWalking && !waking;
  const wakeCountdown = waking
    ? Math.max(1, Math.ceil((wakeBeatEndsAtMs - realNowMs) / 1_000))
    : null;
  const heartbeatOwnsWaiting = Boolean(heartbeat
    && Date.parse(heartbeat.routeAuthoritativeAt) >= Date.parse(snapshot.route.authoritativeAt));
  const confirmedWaitingSince = heartbeatOwnsWaiting
    ? heartbeat?.walking === false ? heartbeat.waitingSince : null
    : snapshot.route.walking === false ? snapshot.presence.waitingSince : null;
  const currentWaitingSince = waking
    ? wakeBeat?.waitingSince ?? null
    : !walking
      ? confirmedWaitingSince
      : null;
  const waitedSeconds = waking && wakeBeat
    ? wakeBeat.waitedSeconds
    : waitedSecondsSince(currentWaitingSince, realNowMs);
  const waitingLocalTime = currentWaitingSince
    ? formatWaitingLocalTime(currentWaitingSince, snapshot.countryDay.timeZone)
    : null;
  const initialRoutePosition = routePositionAt(
    snapshot.assets,
    heartbeat?.globalDistanceMetres ?? snapshot.route.globalDistanceMetres,
  );
  const zoneAudioId = snapshot.assets.route.zones[initialRoutePosition.zoneIndex]?.audioIds[0];
  const ambientAudioUrl = snapshot.assets.audio.find((asset) => asset.id === zoneAudioId)?.url;
  const { enabled: soundEnabled, available: soundAvailable, toggle: toggleSound } =
    useJourneyAudio(walking, ambientAudioUrl);

  useEffect(() => {
    if (walking === motionTransition.desiredWalking) return;
    const update = window.setTimeout(() => {
      setMotionTransition({ desiredWalking: walking, changedAtMs: realNowMs });
    }, 0);
    return () => window.clearTimeout(update);
  }, [motionTransition.desiredWalking, realNowMs, walking]);

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
  const locomotionPhase = motionPhaseAt(motionTransition, realNowMs, hasWalked);
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
  const {
    runtime: routeRuntime,
    motion: estimatedMotion,
    seconds: routeSeconds,
    distanceMetres,
    position: routePosition,
  } =
    useRouteRuntime(
      snapshot,
      heartbeat,
      Math.min(
        realNowMs,
        walking ? Number.POSITIVE_INFINITY : walkingLease.expiresAtMs,
      ),
    );
  const motion=puppetReady && presentationFrame?.assetVersion===snapshot.assets.assetVersion ? presentationFrame.motion : estimatedMotion;
  const routeEncounter = snapshot.assets.schemaVersion === 3 && motion.action?.kind === "encounter"
    ? snapshot.assets.encounters[0]
    : null;
  const activeLine = routeEncounter && motion.action?.dialogueLineIndex !== undefined
    ? routeEncounter.lines[motion.action.dialogueLineIndex] ?? null
    : null;
  const encounterPhase = motion.action?.kind !== "encounter"
    ? "none"
    : motion.action.encounterPhase === "notice"
      ? "notice"
      : motion.action.encounterPhase === "slow_walk"
        ? "decelerate"
        : motion.action.encounterPhase === "approach"
          ? "approach"
          : motion.action.encounterPhase === "greet"
            ? "greeting"
            : motion.action.encounterPhase === "goodbye"
              ? "goodbye"
              : motion.action.encounterPhase === "resume_walk"
                ? "restore"
                : "dialogue";
  const introHeadline = useIntroHeadline(walking, welcomeOriginMs, serverNowMs);
  const baseWorldCommand = worldCommandForEncounter(encounterPhase, walking);
  const activeRouteZone = snapshot.assets.route.zones[routePosition.zoneIndex];
  const eventStage = activeRouteZone?.eventStage;
  const worldCommand = {
    ...baseWorldCommand,
    speedFactor: motion.action ? 0 : locomotionSpeed,
    cameraZoom: baseWorldCommand.cameraZoom > 1 ? eventStage?.cameraZoom ?? baseWorldCommand.cameraZoom : 1,
    cameraPan: baseWorldCommand.cameraZoom > 1 ? eventStage?.cameraPan ?? baseWorldCommand.cameraPan : 0,
    backgroundLife: baseWorldCommand.cameraZoom > 1
      ? eventStage?.backgroundLife ?? baseWorldCommand.backgroundLife
      : 1,
    motionSampleUntilMs: walking ? Number.POSITIVE_INFINITY : walkingLease.expiresAtMs,
  };

  useEffect(() => {
    if (!activeRouteZone || lastZone.current === activeRouteZone.id) return;
    lastZone.current = activeRouteZone.id;
    trackVisitorEvent("route_zone_entered", {
      zone: activeRouteZone.id,
      distance_metres: Math.round(distanceMetres),
    });
  }, [activeRouteZone, distanceMetres]);

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
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      image.src = publicAssetUrl(url);
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

  const visitorSeconds = heartbeat?.visitorActiveSeconds ?? 0;
  const sponsor = sponsorPresentation(snapshot.sponsor,previewDemoSponsor);

  useEffect(() => {
    for (const milestone of [30, 60, 120, 300]) {
      if (visitorSeconds >= milestone && !seenMilestones.current.has(milestone)) {
        seenMilestones.current.add(milestone);
        trackVisitorEvent("contribution_milestone", {
          seconds: milestone,
          steps: Math.floor(milestone / 0.6),
          day: snapshot.countryDay.dayNumber,
        });
      }
    }
  }, [snapshot.countryDay.dayNumber, visitorSeconds]);

  const waitingBehavior = waitingBehaviorAt(reducedMotion ? 0 : waitedSeconds);
  const travelerState: TravelerState = walking && motion.action
    ? motion.action.state
    : !walking && locomotionPhase !== "slow_walk" && locomotionPhase !== "stop"
      ? waitingBehavior.state
      : locomotionPhase;
  const command: TravelerCommand = {
    state: travelerState,
    mood: activeLine?.mood ?? "neutral",
    facing: "right",
    walkingSpeed: worldCommand.speedFactor,
    walking,
    routeRuntime,
    motionSampleUntilMs: walking ? Number.POSITIVE_INFINITY : walkingLease.expiresAtMs,
    reducedMotion,
    presenceTtlMs:snapshot.presence.ttlSeconds*1000,
    waitedSeconds: reducedMotion ? 0 : waitedSeconds,
    sponsorPatchUrl: sponsor?.logo ?? undefined,
    actionReview: previewDemoSponsor?actionReview:undefined,
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
    if (!experienceReady || !sceneRenderer || readyReported.current.has(snapshot.assets.assetVersion)) return;
    readyReported.current.add(snapshot.assets.assetVersion);
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
  const shareUrl = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ url });
      else await navigator.clipboard.writeText(url);
    } catch {
      // Dismissed share sheets and blocked clipboard access are non-fatal.
    }
  };
  const displayedZoneLabel = renderedZone.label;
  const displayedZoneIndex = Math.max(
    0,
    snapshot.assets.route.zones.findIndex((zone) => zone.id === renderedZone.id),
  );
  const tomorrowPack = getNextCountryPack(snapshot.assets.assetVersion);

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
        routeDistanceMetres={distanceMetres}
        routeRuntime={routeRuntime}
        command={worldCommand}
        qualityTier={qualityTier}
        reducedMotion={reducedMotion}
        travelerCommand={command}
        onTravelerReady={(ready) => {
          setPuppetReady(ready);
          if (ready) setTravelerReady(true);
        }}
        onResidentReady={setResidentReady}
        onMotionSample={setPresentationFrame}
        onZoneChange={zoneDidChange}
        onDiagnostics={setWorldDiagnostics}
        onWorldFailure={worldDidFail}
        onReady={sceneDidReady}
      />
      <IntroHeadline
        collapsed={waking ? false : introHeadline.collapsed}
        firstArrival={waking && waitingLocalTime && wakeCountdown ? {
          waitingLocalTime,
          waitedDuration: formatWaitDuration(waitedSeconds),
          countdown: wakeCountdown,
        } : null}
      />
      <JourneyHud
        day={snapshot.countryDay}
        localTime={localTime}
        activeViewers={activeViewers}
        paceRate={routeRuntime.paceRate}
        walking={walking}
        status={connectionStatus}
        onShare={() => void shareUrl()}
        wakeCountdown={wakeCountdown}
        waitingSinceLocalTime={waitingLocalTime}
      />
      {loadingLive ? <div className="connection-banner">Connecting to the shared journey…</div> : null}
      {snapshot.mode === "offline_preview" && !loadingLive ? (
        <div className="connection-banner offline" role="status">
          Offline preview · live counts, steps and voting are unavailable
        </div>
      ) : null}

      {!puppetReady ? <Traveler pack={snapshot.assets} command={command} onReady={() => setTravelerReady(true)} /> : null}
      <WalkingRuleStatus
        walking={review?review.moving:walking}
        label={review ? `Preview test · ${review.state.replaceAll("_"," ")}` : waking && wakeCountdown
          ? `Waking up · starts walking in ${wakeCountdown}…`
          : walking && motion.action
          ? motion.action.label
          : walking ? `Walking · ${displayedZoneLabel}`
            : waitingLocalTime
              ? `Waiting for the internet · since ${waitingLocalTime}`
              : "Waiting for the internet"}
      />
      <GoalBar
        distanceMetres={distanceMetres}
        landmarkMetres={snapshot.assets.dayRouteMetres}
        marathonMetres={snapshot.assets.marathonMetres}
        freshness={distanceMetres > routeRuntime.globalDistanceMetres + 0.001
          ? "extrapolated"
          : "last confirmed"}
      />
      {detailsOpen ? <div className="route-status" aria-label={`Current route zone: ${displayedZoneLabel}`}>
        <span>Route {displayedZoneIndex + 1}/{snapshot.assets.route.zones.length}</span>
        <strong>{displayedZoneLabel}</strong>
      </div> : null}
      <EncounterDialogue
        line={review ? ["talk","listen","greet","goodbye"].includes(review.state)
          ? {speaker:review.state==="listen"?"npc":"traveler",text:"Local animation test — this does not change the shared journey.",mood:"neutral"}:null : activeLine}
        locationLabel={routeEncounter?.locationLabel}
        npcSrc={snapshot.assets.npcAssets[(review?review.state==="listen":activeLine?.speaker === "npc") ? "talk" : "neutral"] ?? snapshot.assets.npcAssets.neutral}
        replayAvailable={replayAvailable}
        replayOpen={replayOpen}
        motionSeconds={motion.action?.elapsedSeconds}
        reducedMotion={reducedMotion}
        showNpcImage={!residentReady || (!activeLine && replayOpen)}
        onReplay={() => setReplayOpen(true)}
        onCloseReplay={() => setReplayOpen(false)}
      />

      <section className="compact-dock" aria-label="Journey controls">
        {sponsor ? <aside className="sponsor-card" aria-label={sponsor.disclosure}>
          {sponsor.logo ? /* eslint-disable-next-line @next/next/no-img-element */
            <img src={sponsor.logo} alt="" width={40} height={40} /> : null}
          <div><small>{sponsor.disclosure}</small><strong>{sponsor.name}</strong>
            {sponsor.href ? <a href={sponsor.href}>{sponsor.cta} ↗</a> : null}</div>
        </aside> : <Link className="sponsor-invitation" href="/sponsor">Sponsor a day</Link>}
        {previewDemoSponsor ? <label className="action-review-select">Preview action
          <select aria-label="Preview action" value={actionReview.action} onChange={event=>{
            const now=performance.now();setReviewNow(now);
            setActionReview({action:event.target.value as ReviewAction,startedAt:now});
          }}>{REVIEW_ACTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
        </label> : null}
        <button type="button" onClick={()=>setVoteOpen(true)}>Daily vote</button>
        <button type="button" aria-expanded={detailsOpen} aria-controls="journey-details" onClick={()=>setDetailsOpen(!detailsOpen)}> {detailsOpen ? "Close details" : "Journey details"}</button>
      </section>
      <section id="journey-details" className="journey-details" hidden={!detailsOpen} aria-label="Journey details">
        {wakeCard?.countryDayId === snapshot.countryDay.id ? (
          <WakeCard
            cityName={snapshot.countryDay.cityName}
            localTime={formatWaitingLocalTime(wakeCard.wokeAt, snapshot.countryDay.timeZone)}
            waitedDuration={formatWaitDuration(wakeCard.waitedSeconds)}
            onShare={() => void shareUrl()}
          />
        ) : null}
        <ContributionMeter
          seconds={visitorSeconds}
          steps={visitorSteps}
          globalSteps={connectionStatus === "live" ? motion.plantIndex : travelerMotionAt(snapshot.assets,heartbeat?.globalActiveSeconds ?? snapshot.route.globalActiveSeconds).plantIndex}
          stale={connectionStatus !== "live" || snapshot.steps.stale}
        />
        <div className="primary-controls">
          <button type="button" onClick={() => void share()}>
            <span className="control-icon" aria-hidden="true">↗</span>
            Share
          </button>
          {snapshot.assets.schemaVersion === 3 ? (
            <PostcardButton
              key={snapshot.countryDay.id}
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
          onToggleSound={() => void toggleSound()}
        />
        {tomorrowPack ? <TomorrowPreview cityName={tomorrowPack.cityName} countryName={tomorrowPack.countryName} packId={tomorrowPack.assetVersion} startsAt={snapshot.countryDay.endsAt} /> : null}
        <nav aria-label="Journey links"><Link href="/archive">Passport</Link><Link href="/sponsor">Sponsor a day</Link><Link href="/privacy">Privacy</Link></nav>
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
