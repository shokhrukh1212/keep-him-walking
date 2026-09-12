"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import { crowdActionKindOf, travelerMotionAt, visibleStepsBetween, type TravelerMotionSnapshot } from "@/lib/traveler/motion-clock";
import { weatherEffect } from "@/lib/weather/effects";
import { localHourFraction } from "@/lib/world/time-grade";
import { formatTemperature, weatherGlyph } from "@/lib/weather/format";
import { safeDemoSponsorLogo, sponsorPresentation } from "@/lib/traveler/demo-sponsor";
import { formatPriceUsd } from "@/lib/sponsors/pricing";
import { useJourneyAudio } from "@/hooks/useJourneyAudio";
import { useJourneyPresence } from "@/hooks/useJourneyPresence";
import { useMotionPreference } from "@/hooks/useMotionPreference";
import { useQualityTier } from "@/hooks/useQualityTier";
import { useRouteRuntime } from "@/hooks/useRouteRuntime";
import { confirmedWalkingLease, presenceReadIsCurrent, walkingLeaseIsActive } from "@/lib/presence/walking-lease";
import { walkingStatusLabel, type WalkingStatus } from "@/lib/presence/status-label";
import { mergeEncounterLog, playedEncounters, type PlayedEncounter } from "@/lib/journey/encounter-log";
import {
  closePanelStep,
  openPanelStep,
  panelFromSearch,
  type PanelLocation,
  type PanelName,
  type PanelSection,
} from "@/lib/ui/panel-history";
import { worldCommandForEncounter } from "@/lib/world/encounter-timeline";
import { motionPhaseAt, motionSpeedForPhase } from "@/lib/world/motion-machine";
import type { MotionTransition } from "@/lib/world/motion-machine";
import { QUALITY_LIMITS } from "@/lib/world/quality-tier";
import { placeRenditions, renditionRequestFor } from "@/lib/world/scene-assets";
import type { SceneAssetState, WorldDiagnosticsSnapshot } from "@/lib/world/types";
import { SceneStage } from "@/components/scene/SceneStage";
import { EncounterDialogue } from "@/components/dialogue/EncounterDialogue";
import { JourneyHud } from "@/components/hud/JourneyHud";
import { CountryLeaderboardSheet } from "@/components/hud/CountryLeaderboardSheet";
import { ReactionButtons } from "@/components/hud/ReactionButtons";
import { composeDayPhoto } from "@/lib/photos/capture";
import type { CanvasCapture } from "@/components/traveler/ProductCharacterStage3D";
import { SoundToggle } from "@/components/hud/SoundToggle";
import { DailyVote } from "@/components/vote/DailyVote";
import { VoteChip } from "@/components/hud/VoteChip";
import { WorldDiagnostics } from "@/components/debug/WorldDiagnostics";
import { WalkingRuleStatus } from "@/components/hud/WalkingRuleStatus";
import { GoalBar } from "@/components/hud/GoalBar";
import { JourneyPanel } from "@/components/journey/JourneyPanel";
import { OverlayModal } from "@/components/ui/OverlayModal";
import { PostcardButton } from "@/components/postcard/PostcardButton";
import { getCountryPack } from "@/content/countries/registry";
import {REVIEW_ACTIONS,reviewPoseAt,type ActionReview,type ReviewAction} from "@/lib/traveler/action-preview";
import {
  formatWaitDuration,
  formatWaitingLocalTime,
  waitedSecondsSince,
  waitingBehaviorAt,
} from "@/lib/presence/waiting";
import { WakeCard } from "@/components/journey/WakeCard";
import { shareCard } from "@/lib/share/client";
import { launchCountdown } from "@/lib/story-clock/launch";

type Props = {
  initialSnapshot: BootstrapSnapshot;
  previewDemoSponsor?: boolean;
  /** Non-production only: lets a prospect see their own logo on the patch. */
  allowDemoSponsorLogo?: boolean;
  /** The cheapest day still genuinely open, or null when nothing is for sale. */
  sponsorPriceCents?: number | null;
};

type WakeMoment = {
  countryDayId: string;
  waitingSince: string;
  wokeAt: string;
  waitedSeconds: number;
  shareToken: string | null;
};

/** Tomorrow's first painting is fetched only this close to the end of the day. */
const TOMORROW_PRELOAD_MS = 20 * 60_000;

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

const subscribeNever = () => () => {};

export function JourneyExperience({ initialSnapshot, previewDemoSponsor = false, allowDemoSponsorLogo = false, sponsorPriceCents = null }: Props) {
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
  const [sceneAssetState, setSceneAssetState] = useState<SceneAssetState>("loading");
  const [travelerReady, setTravelerReady] = useState(false);
  const [puppetReady, setPuppetReady] = useState(false);
  const [residentReady, setResidentReady] = useState(false);
  const [presentationFrame,setPresentationFrame]=useState<{assetVersion:string;motion:TravelerMotionSnapshot}|null>(null);
  // Modals live in the URL and over the scene; opening one never touches the stage.
  const [panelLocation, setPanelLocation] = useState<PanelLocation>({ panel: null, section: null });
  const openPanel = panelLocation.panel;
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
  const broadcastHint = useRef<() => void>(() => undefined);
  const [loadingLive, setLoadingLive] = useState(true);
  const [bootstrapIssue, setBootstrapIssue] = useState("The live journey is temporarily unavailable. Retrying…");
  const [renderedZone, setRenderedZone] = useState(() => ({
    id: initialSnapshot.assets.route.zones[0]?.id ?? "arrival",
    label: initialSnapshot.assets.route.zones[0]?.label ?? initialSnapshot.countryDay.cityName,
  }));
  const [encounterLog, setEncounterLog] = useState<{ dayId: string; entries: PlayedEncounter[] }>(
    () => ({ dayId: initialSnapshot.countryDay.id, entries: [] }),
  );
  const [motionTransition, setMotionTransition] = useState<MotionTransition>({
    desiredWalking: false,
    changedAtMs: new Date(initialSnapshot.realServerNow ?? initialSnapshot.serverNow).getTime(),
  });
  const [worldDiagnostics, setWorldDiagnostics] = useState<WorldDiagnosticsSnapshot | null>(null);
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
  const preloadedTomorrow = useRef<string | null>(null);
  const [hasWalked, setHasWalked] = useState(false);
  const loadStarted = useRef(0);
  const reducedMotion = useMotionPreference();
  const qualityTier = useQualityTier(reducedMotion);

  const showPanel = useCallback((panel: PanelName, section: PanelSection = null) => {
    const step = openPanelStep(window.location.href, window.history.state, panel);
    if (step.method === "push") window.history.pushState(step.state, "", step.url);
    else if (step.method === "replace") window.history.replaceState(step.state, "", step.url);
    setPanelLocation({ panel, section });
  }, []);
  const closePanel = useCallback(() => {
    const step = closePanelStep(window.location.href, window.history.state);
    setPanelLocation({ panel: null, section: null });
    // Going back over the entry this page added keeps the browser's Back button honest.
    if (step.method === "back") window.history.back();
    else window.history.replaceState(step.state, "", step.url);
  }, []);

  useEffect(() => {
    const read = () => setPanelLocation(panelFromSearch(window.location.search));
    const initial = window.setTimeout(read, 0);
    window.addEventListener("popstate", read);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("popstate", read);
    };
  }, []);

  useEffect(() => {
    loadStarted.current = performance.now();
    trackVisitorEvent("journey_viewed", {
      day: initialSnapshot.countryDay.dayNumber,
      country: initialSnapshot.countryDay.countryCode,
    });
  }, [initialSnapshot.countryDay.countryCode, initialSnapshot.countryDay.dayNumber]);

  // /api/bootstrap is shared by every visitor and held in a cache, so the parts
  // that are about *this* visitor arrive separately and are merged in here.
  const refreshMe = useCallback(async () => {
    try {
      const response = await fetch("/api/me", { cache: "no-store" });
      if (!response.ok) return;
      const me = await response.json() as {
        firstVisit?: boolean;
        passport?: BootstrapSnapshot["passport"];
        postcard?: BootstrapSnapshot["postcard"];
        selectedOptionId?: string | null;
      };
      setSnapshot((current) => ({
        ...current,
        firstVisit: me.firstVisit ?? current.firstVisit,
        passport: me.passport ?? current.passport,
        postcard: me.postcard ?? current.postcard,
        vote: current.vote
          ? { ...current.vote, selectedOptionId: me.selectedOptionId ?? null }
          : current.vote,
      }));
    } catch {
      // The public snapshot already rendered; a missing private slice only means
      // no stamp, no postcard and no highlighted ballot until the next attempt.
    }
  }, []);

  const refreshBootstrap = useCallback(async (): Promise<number> => {
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        setBootstrapIssue(failure.code === "NO_ACTIVE_DAY"
          ? "No journey day is active right now. Retrying…"
          : "The live journey is temporarily unavailable. Retrying…");
        throw new Error("Bootstrap unavailable");
      }
      const next = (await response.json()) as BootstrapSnapshot;
      setSnapshot(current=> next.mode !== "live" && current.mode === "live"
        ? {...current,presence:{...current.presence,status:"reconnecting"},steps:{...current.steps,stale:true}}
        : {...next,assets:current.assets.assetVersion === next.assets.assetVersion ? current.assets : next.assets});
      // A read taken before the newest heartbeat counted fewer people than that heartbeat did.
      if (next.mode === "live" && presenceReadIsCurrent(next.route.authoritativeAt, newestHeartbeat.current)) {
        setWalkingLease(confirmedWalkingLease(
          (next.presence.activeViewers ?? 0) > 0,
          next.presence.ttlSeconds,
          new Date(next.realServerNow ?? next.serverNow).getTime(),
        ));
      }
      setClock(synchronizeClock(next.serverNow, Date.now(), next.storyScale ?? 1));
      setRealClock(synchronizeClock(next.realServerNow ?? next.serverNow));
      if (next.journeyState !== "prelaunch") void refreshMe();
      return Math.max(1_000, Math.min(5 * 60_000, next.refresh.afterMs));
    } catch {
      if (!navigator.onLine) setBootstrapIssue("Your browser is offline. Waiting to reconnect…");
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
  }, [refreshMe]);

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
    }, 1_000);
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
    // This heartbeat committed a new stop for everyone; tell the other viewers now
    // instead of letting them find it on their own next beat.
    if (next.activityScheduled) broadcastHint.current();
    const waitingSinceMs = next.waitingSince ? Date.parse(next.waitingSince) : Number.NaN;
    const wokeAtMs = Date.parse(next.realServerNow ?? next.serverNow);
    if (next.walking && next.activeViewers === 1
      && Number.isFinite(waitingSinceMs) && Number.isFinite(wokeAtMs)) {
      const moment: WakeMoment = {
        countryDayId: snapshot.countryDay.id,
        waitingSince: next.waitingSince!,
        wokeAt: new Date(wokeAtMs).toISOString(),
        waitedSeconds: Math.max(0, (wokeAtMs - waitingSinceMs) / 1_000),
        shareToken: next.firstWatcherShareToken ?? null,
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
  const refreshReactions = useCallback(async () => {
    try {
      const response = await fetch("/api/reactions", { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json() as {
        countryDayId?: string;
        reactions?: BootstrapSnapshot["reactions"];
      };
      if (result.countryDayId !== snapshot.countryDay.id || !result.reactions) return;
      setSnapshot((current) => current.countryDay.id === result.countryDayId
        ? { ...current, reactions: result.reactions! }
        : current);
    } catch {
      // A later heartbeat remains the authoritative fallback.
    }
  }, [snapshot.countryDay.id]);

  const { status: connectionStatus, broadcastReactionHint } = useJourneyPresence({
    snapshot,
    sceneReady: experienceReady,
    onHeartbeat: handleHeartbeat,
    onReactionHint: refreshReactions,
  });
  useEffect(() => { broadcastHint.current = broadcastReactionHint; }, [broadcastReactionHint]);
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
  const lastConfirmedWalking = heartbeatOwnsWaiting
    ? heartbeat?.walking === true
    : snapshot.route.walking === true;
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
  // Only the visitor whose reaction crossed the threshold uploads the frame.
  const worldCapture = useRef<CanvasCapture | null>(null);
  const characterCapture = useRef<CanvasCapture | null>(null);
  const ownedPhotoSecond = useRef<number | null>(null);
  // Stable identities: an inline callback here re-runs the scene's mount effect,
  // which tears down and rebuilds the entire Pixi application.
  const registerWorldCapture = useCallback((capture: CanvasCapture | null) => {
    worldCapture.current = capture;
  }, []);

  const registerCharacterCapture = useCallback((capture: CanvasCapture | null) => {
    characterCapture.current = capture;
  }, []);
  const uploadedPhotoSecond = useRef<number | null>(null);
  const {
    runtime: routeRuntime,
    rawSeconds: routeRawSeconds,
    motion: estimatedMotion,
    seconds: routeSeconds,
    distanceMetres,
    position: routePosition,
    scheduledActions,
    walkingClock,
  } =
    useRouteRuntime(
      snapshot,
      heartbeat,
      Math.min(
        realNowMs,
        walking ? Number.POSITIVE_INFINITY : walkingLease.expiresAtMs,
      ),
    );
  const zoneAudioId = snapshot.assets.route.zones[routePosition.zoneIndex]?.audioIds[0];
  const ambientAudioUrl = snapshot.assets.audio.find((asset) => asset.id === zoneAudioId)?.url;
  const {
    enabled: soundEnabled,
    available: soundAvailable,
    resumesOnTap: soundResumesOnTap,
    toggle: toggleSound,
  } = useJourneyAudio(walking, ambientAudioUrl);
  const motion=puppetReady && presentationFrame?.assetVersion===snapshot.assets.assetVersion ? presentationFrame.motion : estimatedMotion;
  const activeConversation = motion.action?.conversation ?? null;
  const activeLine = activeConversation && motion.action?.dialogueLineIndex !== undefined
    ? activeConversation.lines[motion.action.dialogueLineIndex] ?? null
    : null;
  const encounterPhase = !activeConversation
    ? "none"
    : motion.action?.conversationPhase === "notice"
      ? "notice"
      : motion.action?.conversationPhase === "stop"
        ? "decelerate"
        : motion.action?.conversationPhase === "greet"
          ? "greeting"
          : motion.action?.conversationPhase === "goodbye"
            ? "goodbye"
            : "dialogue";
  const baseWorldCommand = worldCommandForEncounter(encounterPhase, walking);
  const activeRouteZone = snapshot.assets.route.zones[routePosition.zoneIndex];
  const eventStage = activeRouteZone?.eventStage;
  // When the crowd's photograph actually fires, the visitor who triggered it
  // composes the live frame and posts it. Everyone else just sees the flash.
  const weather = heartbeat?.weather ?? snapshot.weather;
  const weatherSky = weather ? weatherEffect(weather.code, weather.windKmh) : null;
  const crowdKind = crowdActionKindOf(motion.action);
  useEffect(() => {
    const owned = ownedPhotoSecond.current;
    if (crowdKind !== "photo" || owned === null) return;
    if (uploadedPhotoSecond.current === owned) return;
    uploadedPhotoSecond.current = owned;
    // He stands at the pack's viewport anchor, on the zone's ground line. Both
    // are normalized, so the crop frames him at any canvas size.
    const focus = {
      x: snapshot.assets.route.travelerViewportAnchor,
      y: snapshot.assets.route.zones[routePosition.zoneIndex]?.stage.groundLineY ?? 0.82,
    };
    void (async () => {
      const [world, character] = await Promise.all([
        worldCapture.current?.() ?? Promise.resolve(null),
        characterCapture.current?.() ?? Promise.resolve(null),
      ]);
      const blob = await composeDayPhoto(world, character, focus);
      if (!blob) return;
      const query = new URLSearchParams({
        atActiveSecond: String(owned),
        atDistanceMetres: String(Math.max(0, Math.round(distanceMetres))),
      });
      await fetch(`/api/day-photos?${query.toString()}`, {
        method: "POST",
        headers: { "content-type": blob.type || "image/webp" },
        body: blob,
      }).catch(() => null);
    })();
  }, [crowdKind, distanceMetres, routePosition.zoneIndex, snapshot.assets]);

  // The last few conversations everyone saw, kept after their rows age out.
  useEffect(() => {
    const played = playedEncounters(snapshot.assets, scheduledActions, routeRawSeconds, walkingClock);
    if (played.length === 0) return;
    const dayId = snapshot.countryDay.id;
    const update = window.setTimeout(() => setEncounterLog((log) => {
      const base = log.dayId === dayId ? log.entries : [];
      const entries = mergeEncounterLog(base, played);
      return entries === log.entries ? log : { dayId, entries };
    }), 0);
    return () => window.clearTimeout(update);
  }, [routeRawSeconds, scheduledActions, snapshot.assets, snapshot.countryDay.id, walkingClock]);
  const encounters = encounterLog.dayId === snapshot.countryDay.id ? encounterLog.entries : [];

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

  // Tomorrow's first place only, and only in the last minutes of today: a visitor
  // who leaves earlier downloads nothing for a city they will not see.
  useEffect(() => {
    const tomorrowDay = snapshot.tomorrow;
    if (!tomorrowDay || !qualityTier) return;
    const endsAtMs = Date.parse(snapshot.countryDay.endsAt);
    if (!Number.isFinite(endsAtMs) || realNowMs >= endsAtMs || endsAtMs - realNowMs > TOMORROW_PRELOAD_MS) return;
    const next = getCountryPack(tomorrowDay.scenePackId);
    const zone = next?.route.zones[0];
    if (!next || !zone || preloadedTomorrow.current === next.assetVersion) return;
    preloadedTomorrow.current = next.assetVersion;
    const resolution = Math.min(window.devicePixelRatio || 1, QUALITY_LIMITS[qualityTier].resolution);
    const choice = placeRenditions(zone, renditionRequestFor(zone, window.innerWidth, window.innerHeight, resolution)).city;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.src = publicAssetUrl(choice.url);
  }, [qualityTier, realNowMs, snapshot.countryDay.endsAt, snapshot.tomorrow]);

  useEffect(() => {
    if (!qualityTier || qualityReported.current) return;
    qualityReported.current = true;
    trackVisitorEvent("world_quality_selected", { tier: qualityTier });
  }, [qualityTier]);

  useEffect(() => {
    if (!qualityTier || !worldDiagnostics || serverNowMs - lastBudgetReport.current < 30_000) return;
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
  // The stamp is earned the moment the server has counted enough seconds; it
  // does not wait for the next bootstrap to say so.
  const collectedToday = snapshot.passport.collectedToday || visitorSeconds >= snapshot.passport.collectSeconds;
  const sponsor = sponsorPresentation(snapshot.sponsor,previewDemoSponsor);
  // Sales tool, non-production only: ?demoSponsorLogo=<https url> paints a prospect's
  // logo on the patch. It never touches the real sponsor disclosure or any storage.
  // Read through the store API so the server renders no logo and the client adds
  // one after hydration, rather than a setState cascade inside an effect.
  const demoLogo = useSyncExternalStore(
    subscribeNever,
    () => (allowDemoSponsorLogo
      ? safeDemoSponsorLogo(new URLSearchParams(window.location.search).get("demoSponsorLogo"))
      : null),
    () => null,
  );

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

  const localHour = localHourFraction(new Date(serverNowMs), snapshot.countryDay.timeZone);
  const waitingBehavior = waitingBehaviorAt(
    reducedMotion ? 0 : waitedSeconds,
    localHour >= 21 || localHour < 5,
  );
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
    motionPhaseSeconds: Math.max(0, (realNowMs - motionTransition.changedAtMs) / 1_000),
    routeRuntime,
    motionSampleUntilMs: walking ? Number.POSITIVE_INFINITY : walkingLease.expiresAtMs,
    reducedMotion,
    presenceTtlMs:snapshot.presence.ttlSeconds*1000,
    waitedSeconds: reducedMotion ? 0 : waitedSeconds,
    localHour,
    raining: weatherSky?.precipitation === "rain",
    wakeElapsedSeconds: waking && wakeBeat
      ? Math.max(0, (realNowMs - Date.parse(wakeBeat.wokeAt)) / 1_000)
      : undefined,
    sponsorPatchUrl: demoLogo ?? sponsor?.logo ?? undefined,
    sponsorBottleUrl: sponsor?.bottle ?? undefined,
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
    // A stamp is no longer written here: the passport is earned by watching, and
    // the server is the only thing that can confirm that.
  }, [experienceReady, sceneRenderer, snapshot.assets.assetVersion]);

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
  const places = useMemo(
    () => snapshot.assets.route.zones.map((zone) => ({ id: zone.id, label: zone.label, description: zone.description })),
    [snapshot.assets.route.zones],
  );

  const share = async () => {
    await shareCard({
      title: "Keep Him Walking",
      text: `He only walks while someone is watching. I’m helping him cross ${snapshot.countryDay.cityName}.`,
      url: window.location.href,
    });
  };
  const shareUrl = async () => {
    await shareCard({ title: "Keep Him Walking", text: "Bring a friend → he walks faster.", url: window.location.href });
  };
  const shareSteps = async () => {
    const response = await fetch("/api/share/steps", { method: "POST" }).catch(() => null);
    if (!response?.ok) return;
    const card = await response.json() as { text: string; url: string; imageUrl: string };
    await shareCard({ title: "My part of Keep Him Walking", text: card.text, url: card.url, imageUrl: card.imageUrl, fileName: "my-walking-steps.png" });
  };
  const shareWake = async (moment: WakeMoment) => {
    const text = `I found him waiting alone in ${snapshot.countryDay.cityName} at ${formatWaitingLocalTime(moment.wokeAt, snapshot.countryDay.timeZone)}. He'd been standing there ${formatWaitDuration(moment.waitedSeconds)}. →`;
    await shareCard({
      title: "I woke him up",
      text,
      url: window.location.href,
      imageUrl: moment.shareToken ? `/api/og/first?token=${encodeURIComponent(moment.shareToken)}` : undefined,
      fileName: "first-watcher.png",
    });
  };
  const startsIn = snapshot.journeyState === "prelaunch"
    ? launchCountdown(Date.parse(snapshot.countryDay.startsAt), realNowMs)
    : null;
  const tomorrow = snapshot.tomorrow ?? null;
  // The status line names the place only once its painting is really on screen.
  const renderedPlaceLabel = sceneRenderer === "static"
    ? activeRouteZone?.label ?? null
    : sceneAssetState === "ready" || sceneAssetState === "retrying"
      ? renderedZone.label
      : null;
  const walkingStatus: WalkingStatus = review
    ? { text: `Preview test · ${review.state.replaceAll("_", " ")}`, tone: review.moving ? "walking" : "stopped" }
    : walkingStatusLabel({
        journeyState: snapshot.journeyState,
        mode: snapshot.mode,
        startsIn,
        wakeCountdown: waking ? wakeCountdown : null,
        walking,
        actionLabel: walking && motion.action ? motion.action.label : null,
        renderedPlaceLabel,
        weatherFragment: weatherSky?.pillFragment ?? null,
        connection: connectionStatus,
        lastConfirmedWalking,
        waitingSinceLocalTime: waitingLocalTime,
        sleeping: waitingBehavior.phase === "sleep",
      });
  const distanceFreshness = snapshot.mode === "live" && connectionStatus !== "live"
    ? "reconnecting" as const
    : distanceMetres > routeRuntime.globalDistanceMetres + 0.001
      ? "extrapolated" as const
      : "last confirmed" as const;
  const sponsorLabel = sponsorPriceCents === null ? "Sponsor a day" : `Sponsor a day · ${formatPriceUsd(sponsorPriceCents)}`;

  const acceptVote = (optionId: string, totalBallots: number) => {
    setSnapshot((current) => ({
      ...current,
      vote: current.vote
        ? { ...current.vote, selectedOptionId: optionId, totalBallots }
        : null,
    }));
  };

  return (
    <main className="journey-shell" data-motion={reducedMotion ? "reduced" : "full"} data-panel={openPanel ?? ""}>
      <SceneStage
        scheduledActions={scheduledActions}
        walkingClock={walkingClock}
        weather={weather}
        // Premium only, and only once the creative is approved and live.
        sponsorSignUrl={sponsor?.bottle ?? null}
        // The latest confirmation wins: the heartbeat may have crossed the
        // hundred since this page's bootstrap was read.
        hundredWatchersAt={heartbeat?.hundredWatchersAt ?? snapshot.milestones.hundredWatchersAt}
        onWorldCaptureReady={registerWorldCapture}
        onCharacterCaptureReady={registerCharacterCapture}
        pack={snapshot.assets}
        routeSeconds={routeSeconds}
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
        onAssetState={setSceneAssetState}
        onDiagnostics={setWorldDiagnostics}
        onWorldFailure={worldDidFail}
        onReady={sceneDidReady}
      />
      <JourneyHud
        day={snapshot.countryDay}
        localTime={localTime}
        weatherLabel={weather
          ? `${formatTemperature(weather.tempC)} ${weatherGlyph(weather.code, weather.isDay)}`
          : null}
        activeViewers={activeViewers}
        status={connectionStatus}
        launchCountdown={startsIn}
        audienceOpen={openPanel === "audience"}
        onAudienceOpen={() => showPanel("audience")}
        onJourneyOpen={() => showPanel("journey")}
      />
      {loadingLive ? <div className="connection-banner">Connecting to the shared journey…</div> : null}
      {snapshot.mode === "offline_preview" && !loadingLive ? (
        <div className="connection-banner offline" role="status">
          {bootstrapIssue} Preview only · live counts, steps and voting are unavailable.
        </div>
      ) : null}

      {/* A single connected idle frame holds the traveler's place until the 3D
          model reports ready. The sprite and Rive renderers it used to sit in
          front of were retired in P18; nothing else remains of that path. */}
      {!puppetReady ? <div className="traveler-loading" role="status">Loading the walk…</div> : null}
      <WalkingRuleStatus
        walking={review ? review.moving : walking}
        label={walkingStatus.text}
        tone={walkingStatus.tone}
      />
      {snapshot.journeyState !== "prelaunch" ? <ReactionButtons
        counts={heartbeat?.reactions.counts ?? snapshot.reactions.counts}
        activeViewers={activeViewers}
        enabled={snapshot.mode === "live" && connectionStatus === "live"}
        activeCrowdKind={crowdKind}
        onScheduled={(kind, atActiveSecond) => {
          if (kind === "photo") ownedPhotoSecond.current = atActiveSecond;
        }}
        onConfirmed={() => {
          void refreshReactions();
          broadcastReactionHint();
        }}
      /> : null}
      {snapshot.journeyState !== "prelaunch" ? <GoalBar
        distanceMetres={distanceMetres}
        dailyGoalMetres={snapshot.assets.dayRouteMetres}
        marathonMetres={snapshot.assets.marathonMetres}
        freshness={distanceFreshness}
        places={places}
        currentPlaceIndex={routePosition.zoneIndex}
        secondsToNextVisit={routePosition.secondsToNextVisit}
        visitSeconds={routePosition.visitSeconds}
      /> : null}
      <EncounterDialogue
        line={review ? ["talk","listen","greet","goodbye"].includes(review.state)
          ? {speaker:review.state==="listen"?"npc":"traveler",text:"Local animation test — this does not change the shared journey.",mood:"neutral"}:null : activeLine}
        speakerLabel={activeLine && activeConversation
          ? activeLine.speaker === "npc" ? activeConversation.speakerName : "Traveler"
          : undefined}
        npcSrc={snapshot.assets.npcAssets[(review?review.state==="listen":activeLine?.speaker === "npc") ? "talk" : "neutral"] ?? snapshot.assets.npcAssets.neutral ?? ""}
        motionSeconds={motion.action?.elapsedSeconds}
        reducedMotion={reducedMotion}
        showNpcImage={!residentReady}
      />

      <section className="compact-dock" data-hud-region="dock" aria-label="Journey controls">
        {sponsor ? <aside className="sponsor-card" data-hud-region="sponsor" aria-label={sponsor.disclosure}>
          {sponsor.logo ? /* eslint-disable-next-line @next/next/no-img-element */
            <img src={sponsor.logo} alt="" width={40} height={40} /> : null}
          <div><small>{sponsor.disclosure}</small><strong>{sponsor.name}</strong>
            {sponsor.href ? <a href={sponsor.href}>{sponsor.cta} ↗</a> : null}</div>
        </aside> : <button className="sponsor-invitation" data-hud-region="sponsor" type="button" aria-haspopup="dialog" aria-label={sponsorLabel} onClick={() => showPanel("sponsor")}>
          <span className="dock-label-long" aria-hidden="true">{sponsorLabel}</span>
          <span className="dock-label-short" aria-hidden="true">Sponsor</span>
        </button>}
        {previewDemoSponsor ? <label className="action-review-select">Preview action
          <select aria-label="Preview action" value={actionReview.action} onChange={event=>{
            const now=performance.now();setReviewNow(now);
            setActionReview({action:event.target.value as ReviewAction,startedAt:now});
          }}>{REVIEW_ACTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
        </label> : null}
        <VoteChip
          vote={snapshot.vote}
          rolloverUtcHour={snapshot.journey.rolloverUtcHour}
          onOpen={() => showPanel("vote")}
        />
        <button className="dock-journey" type="button" aria-haspopup="dialog" onClick={() => showPanel("journey")}>Journey</button>
      </section>
      <SoundToggle
        enabled={soundEnabled}
        available={soundAvailable}
        resumesOnTap={soundResumesOnTap}
        onToggle={() => void toggleSound()}
      />

      <OverlayModal
        open={openPanel === "journey"}
        title="Journey"
        eyebrow={`${snapshot.countryDay.cityName} · Day ${snapshot.countryDay.dayNumber}`}
        onClose={closePanel}
        size="wide"
        testId="journey-modal"
      >
        <JourneyPanel
          section={panelLocation.section}
          places={places}
          currentPlaceIndex={routePosition.zoneIndex}
          secondsToNextVisit={routePosition.secondsToNextVisit}
          visitSeconds={routePosition.visitSeconds}
          distanceMetres={distanceMetres}
          dailyGoalMetres={snapshot.assets.dayRouteMetres}
          marathonMetres={snapshot.assets.marathonMetres}
          freshness={distanceFreshness}
          activeViewers={activeViewers}
          paceRate={routeRuntime.paceRate}
          prelaunch={snapshot.journeyState === "prelaunch"}
          contribution={{
            seconds: visitorSeconds,
            steps: visitorSteps,
            globalSteps: connectionStatus === "live" ? motion.plantIndex : travelerMotionAt(snapshot.assets,heartbeat?.globalActiveSeconds ?? snapshot.route.globalActiveSeconds).plantIndex,
            stale: connectionStatus !== "live" || snapshot.steps.stale,
          }}
          streak={snapshot.passport.streak}
          collectedToday={collectedToday}
          secondsToCollect={snapshot.passport.collectSeconds - visitorSeconds}
          encounters={encounters}
          photos={snapshot.dayPhotos}
          tomorrow={tomorrow}
          ticket={snapshot.ticket ?? null}
          wakeCard={wakeCard?.countryDayId === snapshot.countryDay.id ? (
            <WakeCard
              cityName={snapshot.countryDay.cityName}
              localTime={formatWaitingLocalTime(wakeCard.wokeAt, snapshot.countryDay.timeZone)}
              waitedDuration={formatWaitDuration(wakeCard.waitedSeconds)}
              onShare={() => void shareWake(wakeCard)}
            />
          ) : null}
          postcard={snapshot.journeyState !== "prelaunch" && snapshot.assets.schemaVersion === 3 ? (
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
          onShare={() => void share()}
          onShareSteps={() => void shareSteps()}
          onSponsor={() => showPanel("sponsor")}
        />
      </OverlayModal>

      <OverlayModal
        open={openPanel === "sponsor"}
        title="Sponsor a day"
        eyebrow="Support the journey"
        onClose={closePanel}
        testId="sponsor-modal"
      >
        <div className="sponsor-copy">
          <p>One sponsor can be clearly disclosed on a day of the shared journey.</p>
          <p>Standard includes the disclosed sponsor card and approved traveler patch. Premium is shown only when both the bottle label and café placement can be fulfilled.</p>
          <p>Pricing is based on the previous day’s confirmed audience, within the published floor and cap. It can rise or fall.</p>
          <p className="booking-off"><strong>Public validation:</strong> booking is not accepting payment yet while an eligible advertising payment provider is confirmed.</p>
        </div>
      </OverlayModal>

      <OverlayModal
        open={openPanel === "vote"}
        title={snapshot.vote?.kind === "name" ? "Name him" : "Tomorrow’s vote"}
        eyebrow="Daily vote"
        onClose={closePanel}
        testId="vote-modal"
      >
        <DailyVote vote={snapshot.vote} onAccepted={acceptVote} />
      </OverlayModal>

      <OverlayModal
        open={openPanel === "audience"}
        title="Who is carrying him"
        eyebrow="Today · carried time"
        onClose={closePanel}
        testId="audience-modal"
      >
        <CountryLeaderboardSheet
          todayTop={snapshot.countries.todayTop}
          activeViewers={activeViewers}
          paceRate={routeRuntime.paceRate}
          walking={walking}
          status={connectionStatus}
          waitingSinceLocalTime={waitingLocalTime}
          waitingDuration={formatWaitDuration(waitedSeconds)}
          wakeCountdown={wakeCountdown}
          launchCountdown={startsIn}
          onShare={() => void shareUrl()}
        />
      </OverlayModal>

      <WorldDiagnostics
        snapshot={worldDiagnostics}
        locomotionPhase={locomotionPhase}
        qualityTier={qualityTier}
        renderer={sceneRenderer}
        authoritativeRouteSeconds={routeSeconds}
      />
      <p className="sr-only" aria-live="polite">
        {activeLine && activeConversation
          ? `${activeLine.speaker === "npc" ? activeConversation.speakerName : "Traveler"}: ${activeLine.text}`
          : ""}
      </p>
    </main>
  );
}
