"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import type { CountryPack } from "@/lib/content/schema";
import { CharacterActor } from "@/lib/characters/actor";
import { CharacterLights } from "@/lib/characters/appearance";
import type { CharacterContacts, VisualGrade } from "@/lib/world/visual-grade";
import { CHARACTER_MANIFEST, RESIDENT_TYPES, type ResidentType } from "@/lib/characters/manifest";
import { loadCharacterGltf } from "@/lib/characters/loader";
import { CONTEXT_RESTORE_ATTEMPTS, MAX_STAGE_REBUILDS, characterRetryDelayMs } from "@/lib/characters/retry";
import { productCharacterSceneAt } from "@/lib/characters/product-timeline";
import { packResidentType, walkerResidentType } from "@/lib/characters/residents";
import { actorLayout } from "@/lib/traveler/actor-layout";
import { frameFitsViewport, type StageFrame } from "@/lib/world/stage-layout";
import { travelerMotionAt } from "@/lib/traveler/motion-clock";
import { wavingWalker } from "@/lib/world/ambient";
import { QUALITY_LIMITS } from "@/lib/world/quality-tier";
import {
  advanceWalker, enterWalker, walkerCanFollow, walkerHasLeft, walkerMustWait, walkerPassesBetween,
  walkerPlacement, walkerSpeedMetresPerSecond, walkerTakeMetresPerSecond,
  type StreetWalker, type WalkerPlacement,
} from "@/lib/world/walkers";
import { PresentationClock } from "@/lib/traveler/presentation-clock";
import type { CharacterContact } from "@/lib/world/visual-grade";
import type { TravelerCommand } from "@/lib/traveler/types";
import type { QualityTier, RouteRuntime, WalkingClock } from "@/lib/world/types";
import type { ScheduledActionView } from "@/lib/contracts";
import { activityWindow, conversationResident, conversationScript } from "@/lib/world/activities";

const EMPTY_SCHEDULED_ACTIONS: readonly ScheduledActionView[] = [];
/** Nobody new sets off this close to a stop, so a pass never crowds a conversation or an action. */
const WALKER_STOP_CLEARANCE_SECONDS = 12;
/** A conversation's resident starts downloading once its stop is this close. */
const PARTNER_PRELOAD_SECONDS = 90;

/** Hands the parent a way to copy this canvas at a point where it is intact. */
/** Copies this canvas at a point where its drawing buffer is known to be intact. */
export type CanvasCapture = () => Promise<HTMLCanvasElement | null>;

function copyCanvas(source: HTMLCanvasElement): HTMLCanvasElement | null {
  if (source.width === 0 || source.height === 0) return null;
  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  const context = copy.getContext("2d");
  if (!context) return null;
  context.drawImage(source, 0, 0);
  return copy;
}

type Props = {
  pack: CountryPack;
  stageFrame: RefObject<StageFrame | null>;
  contacts: RefObject<CharacterContacts>;
  grade: RefObject<VisualGrade>;
  routeRuntime: RouteRuntime;
  scheduledActions?: readonly ScheduledActionView[];
  walkingClock?: WalkingClock | null;
  onCaptureReady?: (capture: CanvasCapture | null) => void;
  command?: TravelerCommand;
  qualityTier: QualityTier;
  onTravelerAvailability?: (available: boolean) => void;
  onResidentAvailability?: (available: boolean) => void;
};

function disposeModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
    if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

export function ProductCharacterStage3D(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  // Bumped only when a lost context refuses to come back: the effect below then
  // tears the renderer down and builds a new one, which reloads him into it.
  const [stageBuild, setStageBuild] = useState(0);
  const rebuilds = useRef(0);
  const captureWaiters = useRef<Array<(frame: HTMLCanvasElement | null) => void>>([]);
  useEffect(() => { latest.current = props; }, [props]);
  const onCaptureReady = props.onCaptureReady;
  useEffect(() => {
    if (!onCaptureReady) return;
    // Asking for a frame waits for the next draw. If the loop is paused — a
    // hidden tab, a lost context — the request resolves empty instead of hanging.
    onCaptureReady(() => new Promise((resolve) => {
      let settled = false;
      const settle = (frame: HTMLCanvasElement | null) => {
        if (settled) return;
        settled = true;
        resolve(frame);
      };
      captureWaiters.current.push(settle);
      window.setTimeout(() => settle(null), 1_000);
    }));
    return () => onCaptureReady(null);
  }, [onCaptureReady]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let raf = 0;
    let contextLost = false;
    let renderer: THREE.WebGLRenderer;
    element.dataset.mountCount = String(Number(element.dataset.mountCount ?? "0") + 1);
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: latest.current.qualityTier !== "low",
        powerPreference: "high-performance",
      });
    } catch {
      latest.current.onTravelerAvailability?.(false);
      return;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, latest.current.qualityTier === "high" ? 1.5 : 1.25));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.domElement.setAttribute("aria-hidden", "true");
    element.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-2, 2, 2, -1, 0.01, 40);
    const lights = new CharacterLights();
    scene.add(lights);

    const travelerRoot = new THREE.Group();
    const residentRoot = new THREE.Group();
    // Walkers live behind both of them and compute their own anchors: the
    // traveler's eight-second viewport drift is his, and must not be inherited.
    const walkerRoot = new THREE.Group();
    scene.add(travelerRoot, residentRoot, walkerRoot);
    const loader = new GLTFLoader();
    const clock = new PresentationClock();
    let traveler: CharacterActor | undefined;
    // The conversation partner: the resident the current script (or pack) names.
    let resident: CharacterActor | undefined;
    let residentType: ResidentType | undefined;
    // One untouched copy of each resident model. CharacterActor converts materials and
    // adds outlines to the scene it is given, so every actor, the partner included, is
    // built on its own skeleton clone. The other resident downloads the first time a
    // walker or a conversation needs it, so a device that shows neither never fetches it.
    const residentModels = new Map<ResidentType, GLTF | "loading" | "failed">();
    // People passing on his pavement. Each keeps its own street position and is
    // removed only after walking out of view (src/lib/world/walkers.ts).
    type Walker = {
      actor: CharacterActor; anchor: THREE.Group; type: ResidentType; heightMetres: number;
      placement: WalkerPlacement; street: StreetWalker;
    };
    let walkers: Walker[] = [];
    // The walking second the walkers last moved at; passes start in the interval since.
    let walkerSecond: number | undefined;
    // Diagnostics for the pavement: how many passes this session has scheduled, how many
    // of them actually put someone on the street, and why a frame is starting nobody.
    // A pass that is dropped leaves no other trace, which is what made an empty pavement
    // impossible to tell apart from a quiet one.
    let passesSeen = 0;
    let passesSpawned = 0;
    let passesDropped = "";
    const removeWalker = (walker: Walker) => {
      walkerRoot.remove(walker.anchor);
      walker.actor.dispose();
      disposeModel(walker.anchor);
    };
    let last = 0;
    let lastRender = 0;
    let firstSample = true;
    let previousConversation = false;

    // A download that fails is not the end of the walk. One unlucky request used
    // to leave the pavement empty for the rest of the session, because nothing
    // ever asked for him again.
    let travelerAttempt = 0;
    let travelerRetry: number | null = null;
    const retryTraveler = () => {
      // A hidden tab is not a fault to fix: the visibility listener starts it again.
      if (disposed || traveler || travelerRetry !== null || document.hidden) return;
      const delay = characterRetryDelayMs(travelerAttempt);
      travelerAttempt += 1;
      element.dataset.characterAttempts = String(travelerAttempt + 1);
      travelerRetry = window.setTimeout(() => {
        travelerRetry = null;
        void loadTraveler();
      }, delay);
    };
    const loadTraveler = async () => {
      let loadedRoot: THREE.Group | undefined;
      try {
        const definition = CHARACTER_MANIFEST.traveler;
        const gltf = await loadCharacterGltf(loader, definition);
        loadedRoot = gltf.scene;
        if (disposed) {
          disposeModel(loadedRoot);
          return;
        }
        const actor = new CharacterActor(gltf, definition.heightMetres, true);
        traveler = actor;
        travelerRoot.add(actor.root);
        void actor.setSponsor(latest.current.command?.sponsorPatchUrl);
        void actor.setBottle(latest.current.command?.sponsorBottleUrl);
        element.dataset.characterReady = "true";
        latest.current.onTravelerAvailability?.(true);
        // He is in, so the people who pass can download now, behind him and never
        // beside him. A pass whose model is still coming is missed rather than shown
        // late mid-street, and passes are two or three walking minutes apart, so
        // fetching them on demand meant a visitor could watch for minutes and see
        // nobody. A tier that shows no walkers still fetches nobody.
        if (QUALITY_LIMITS[latest.current.qualityTier].walkers > 0) {
          for (const type of RESIDENT_TYPES) residentModel(type);
        }
      } catch {
        if (loadedRoot) disposeModel(loadedRoot);
        latest.current.onTravelerAvailability?.(false);
        retryTraveler();
      }
    };
    const retryWhenVisible = () => {
      if (!document.hidden) retryTraveler();
    };
    document.addEventListener("visibilitychange", retryWhenVisible);
    element.dataset.characterAttempts = "1";
    void loadTraveler();

    // A resident download that fails is asked for again, exactly as his is. Until
    // 2026-09-18 it was not: one interrupted request left `failed` in the map for the
    // rest of the session, and nothing ever looked at that type again — no conversation
    // partner, and, because nobody sets off before the partner is in, an empty pavement
    // for as long as the tab stayed open. Measured on production: `resident-b.glb`
    // answered 200 and then died mid-body, and the stage sat at `walker-gate:
    // resident-loading` for the whole watch.
    const residentAttempts = new Map<ResidentType, number>();
    const residentRetries = new Map<ResidentType, number>();
    const retryResident = (type: ResidentType) => {
      if (disposed || residentRetries.has(type)) return;
      const attempt = residentAttempts.get(type) ?? 0;
      residentAttempts.set(type, attempt + 1);
      residentRetries.set(type, window.setTimeout(() => {
        residentRetries.delete(type);
        if (disposed || typeof residentModels.get(type) === "object") return;
        // Clear the answer first, or the request is never made again.
        residentModels.delete(type);
        residentModel(type);
      }, characterRetryDelayMs(attempt)));
    };
    /** Starts a resident's download once, and reports where it stands. */
    const residentModel = (type: ResidentType) => {
      const known = residentModels.get(type);
      if (known) return known;
      residentModels.set(type, "loading");
      loadCharacterGltf(loader, CHARACTER_MANIFEST.residents[type]).then((gltf) => {
        if (disposed) disposeModel(gltf.scene);
        else residentModels.set(type, gltf);
      }, () => {
        residentModels.set(type, "failed");
        retryResident(type);
      });
      return "loading" as const;
    };
    const residentActor = (type: ResidentType, gltf: GLTF) => new CharacterActor(
      { ...gltf, scene: cloneSkinned(gltf.scene) as THREE.Group },
      CHARACTER_MANIFEST.residents[type].heightMetres,
      false,
    );
    // The first pack's resident downloads beside the traveler, not on the first frame.
    residentModel(packResidentType(latest.current.pack));

    const resize = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
    };
    const updateCamera = (width: number, height: number, frame: StageFrame) => {
      const layout = actorLayout(height, frame.layout);
      const vertical = CHARACTER_MANIFEST.traveler.heightMetres * height / layout.height;
      const aspect = width / height;
      const centerY = vertical / 2 - layout.bottom * vertical / height;
      camera.left = -vertical * aspect / 2;
      camera.right = vertical * aspect / 2;
      camera.top = vertical / 2;
      camera.bottom = -vertical / 2;
      camera.position.set(0, centerY, 6);
      camera.lookAt(0, centerY, 0);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();

    const draw = (now: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(draw);
      if (document.hidden || contextLost) { last = now; return; }
      const state = latest.current;
      const minimumFrameMs = state.qualityTier === "low" ? 1000 / 30 : 1000 / 60;
      if (now - lastRender < minimumFrameMs - 1) return;
      const dt = last ? Math.min(0.1, Math.max(0, (now - last) / 1000)) : 0;
      last = now;
      lastRender = now;
      const rows = state.scheduledActions ?? EMPTY_SCHEDULED_ACTIONS;
      clock.accept(state.routeRuntime, state.command?.presenceTtlMs ?? 50_000, now);
      const sample = clock.sample(now, rows);
      const motion = travelerMotionAt(
        state.pack,
        sample.rawSeconds,
        sample.distanceMetres,
        rows,
        state.walkingClock ?? null,
      );
      const cue = productCharacterSceneAt(
        state.pack,
        motion,
        sample.traveling && (state.command?.walking ?? true),
        state.command?.actionReview,
        now,
        state.routeRuntime.paceRate,
        state.command?.waitedSeconds,
        state.command?.localHour,
        state.command?.raining,
        state.command?.wakeElapsedSeconds,
        state.command?.state,
        state.command?.motionPhaseSeconds,
        // Prelaunch only: the local monologue controller, sampled on this frame's clock.
        state.command?.preview?.sample(now),
      );
      const snap = firstSample || cue.conversation !== previousConversation;
      firstSample = false;
      previousConversation = cue.conversation;
      traveler?.sample(cue.traveler, dt, snap);
      void traveler?.setSponsor(state.command?.sponsorPatchUrl);
      void traveler?.setBottle(state.command?.sponsorBottleUrl);
      // Start downloading an upcoming conversation's resident before it arrives.
      for (const row of rows) {
        const window = activityWindow(row);
        if (!window || row.kind !== "conversation" || window[1] <= sample.rawSeconds
          || window[0] - sample.rawSeconds > PARTNER_PRELOAD_SECONDS) continue;
        residentModel(conversationResident(state.pack, conversationScript(state.pack, row.variant)));
      }
      // The partner follows the conversation's script, then the pack, including a pack that
      // changes while mounted: the previous resident leaves at once rather than standing in.
      const partnerType = cue.guestType ?? (cue.conversation && cue.residentType ? cue.residentType : packResidentType(state.pack));
      const partnerModel = residentModel(partnerType);
      if (residentType !== partnerType || (!resident && typeof partnerModel === "object")) {
        if (resident) {
          residentRoot.remove(resident.root);
          resident.dispose();
          resident = undefined;
          delete element.dataset.residentReady;
          state.onResidentAvailability?.(false);
        }
        if (partnerModel !== "loading") {
          residentType = partnerType;
          element.dataset.residentType = partnerType;
          if (partnerModel === "failed") {
            state.onResidentAvailability?.(false);
          } else {
            resident = residentActor(partnerType, partnerModel);
            residentRoot.add(resident.root);
            element.dataset.residentReady = "true";
            state.onResidentAvailability?.(true);
          }
        }
      }
      resident?.sample(cue.resident, dt, snap, 1.8);

      const width = Math.max(1, element.clientWidth);
      const height = Math.max(1, element.clientHeight);
      const frame = state.stageFrame.current;
      // Wait for decoded world dimensions; never invent a second layout for the actor.
      // An exact size match never happens on a scaled screen, because Pixi rounds to
      // device pixels, and every frame returned here leaves the people frozen or gone.
      if (!frame || frame.assetVersion !== state.pack.assetVersion
        || !frameFitsViewport(frame, width, height)) {
        state.contacts.current = { traveler: null, resident: null };
        return;
      }
      updateCamera(width, height, frame);
      lights.update(frame.stage);
      traveler?.setAppearance(state.grade.current);
      resident?.setAppearance(state.grade.current);
      const vertical = CHARACTER_MANIFEST.traveler.heightMetres * height / frame.layout.personHeightPx;
      const horizontal = vertical * width / height;
      const mobile = width <= 600;
      const [left, right] = frame.stage.walkableX;
      // Panels are overlays: opening one never moves him.
      const travelerAnchor = Math.min(right, Math.max(left, 0.5));
      const residentAnchor = Math.min(right, Math.max(left, mobile ? 0.76 : 0.72));
      const residentScreenAnchor = residentAnchor + (cue.residentOffset ?? 0) * 0.36;
      travelerRoot.position.x = (travelerAnchor - 0.5) * horizontal;
      residentRoot.position.x = (residentScreenAnchor - 0.5) * horizontal;
      travelerRoot.rotation.x = cue.travelerLeanRadians ?? 0;
      // Facing the camera turns only his root group; the bones keep sampling their take untouched.
      travelerRoot.rotation.y = cue.conversation
        ? Math.PI / 2
        : state.command?.facing === "camera" ? 0 : state.command?.facing === "left" ? -0.68 : 0.68;
      residentRoot.rotation.y = cue.guestType ? -0.75
        : motion.action?.conversationPhase === "depart" ? Math.PI / 2 : -Math.PI / 2;
      residentRoot.visible = cue.showResident && Boolean(resident) && residentType === partnerType;
      if (cue.conversation && traveler && resident) {
        traveler.gazeAt(resident.headPosition(), .6);
        resident.gazeAt(traveler.headPosition(), .6);
      } else if (cue.traveler.clip === "phone" && traveler) {
        traveler.gazeAt(traveler.devicePosition(), .6);
      } else if (motion.action?.source === "crowd" && motion.action.kind === "wave"
        && motion.action.elapsedSeconds < .8 && traveler) {
        traveler.gazeAt(camera.position.clone(), .6);
      }
      element.dataset.characterState = traveler?.resolvedClip(cue.traveler.clip) ?? cue.traveler.clip;
      element.dataset.residentState = resident?.resolvedClip(cue.resident.clip) ?? cue.resident.clip;
      // Diagnostic of the accepted command path. The sewn neutral patch remains
      // if a remote sponsor texture fails, so this does not claim the image loaded.
      element.dataset.sponsorCommanded = String(Boolean(state.command?.sponsorPatchUrl));
      element.dataset.characterSeconds = String(cue.traveler.seconds);
      element.dataset.characterViewportOffset = "0";
      element.dataset.walkTimeScale = String(cue.traveler.timeScale ?? 1);
      element.dataset.forwardLeanDegrees = String((cue.travelerLeanRadians ?? 0) * 180 / Math.PI);
      element.dataset.residentVisible = String(residentRoot.visible);
      element.dataset.residentOffset = String(cue.residentOffset ?? 0);
      element.dataset.activityKind = motion.action?.kind ?? "";
      element.dataset.travelerYaw = String(travelerRoot.rotation.y);
      // Which preview take he is in ("idle" or "talk"); empty outside the prelaunch preview.
      element.dataset.preview = state.command?.preview ? cue.traveler.clip : "";
      // Measured through the actual camera, not just echoed from the input metadata.
      camera.updateMatrixWorld();
      const foot = new THREE.Vector3(travelerRoot.position.x, 0, 0).project(camera);
      const head = new THREE.Vector3(travelerRoot.position.x, 1.78, 0).project(camera);
      element.dataset.footX = String((foot.x + 1) * width / 2);
      element.dataset.footY = String((1 - foot.y) * height / 2);
      element.dataset.personHeight = String((head.y - foot.y) * height / 2);
      element.dataset.characterImageScale = String(frame.layout.characterImageScale);
      element.dataset.zoneId = frame.zoneId;
      element.dataset.grade = JSON.stringify(state.grade.current);

      // ---- People passing on his pavement. A pass starts on the shared walking clock,
      // enters beyond one edge and is removed only once it has walked out beyond the
      // other: nothing he does, no schedule window and no city hour takes anyone out of
      // the middle of the street. New people set off only while he is plainly walking
      // and no stop is about to begin.
      // The tier is read here, not at mount: this effect has an empty dependency list.
      const walkerLimit = QUALITY_LIMITS[state.qualityTier].walkers;
      const travelerHeight = CHARACTER_MANIFEST.traveler.heightMetres;
      const stopSoon = rows.some((row) => {
        const window = activityWindow(row);
        return window !== null && window[1] > sample.rawSeconds
          && window[0] - sample.rawSeconds < WALKER_STOP_CLEARANCE_SECONDS;
      });
      // Why this frame is starting nobody, in one word, for the same reason every other
      // state on this page is nameable.
      const gate = walkerLimit <= 0 ? "tier"
        : walkerSecond === undefined ? "first-frame"
          : partnerModel === "loading" ? "resident-loading"
            : !sample.traveling ? "not-traveling"
              : !(state.command?.walking ?? true) ? "not-walking"
                : cue.conversation ? "conversation"
                  : motion.action ? `action-${motion.action.kind}`
                    : stopSoon ? "stop-soon"
                      : "open";
      element.dataset.walkerGate = gate;
      element.dataset.walkerSecond = String(Math.round(motion.routeSeconds));
      // Nobody sets off while the conversation partner's model is still downloading, so
      // a walker's download never leaves the partner still loading. A partner whose
      // download failed is being asked for again; that must not hold the street empty
      // until it lands, which is what waiting on the built partner used to do for ever.
      const passes = walkerSecond !== undefined && partnerModel !== "loading" && sample.traveling
        && (state.command?.walking ?? true) && !cue.conversation && !motion.action && !stopSoon
        ? walkerPassesBetween(
            walkerSecond,
            motion.routeSeconds,
            state.command?.localHour ?? 12,
            state.pack.assetVersion,
            walkerLimit,
          )
        : [];
      walkerSecond = motion.routeSeconds;
      passesSeen += passes.length;
      // Reduced motion forces the low tier, which shows nobody, so they stop at once.
      if (walkerLimit <= 0) {
        for (const walker of walkers) removeWalker(walker);
        walkers = [];
      }
      for (const pass of passes) {
        // Never more walkers than residents, because two are never the same model.
        if (walkers.length >= Math.min(walkerLimit, RESIDENT_TYPES.length)) { passesDropped = "full"; continue; }
        const type = walkerResidentType(walkers.map((walker) => walker.type), state.pack.assetVersion, pass.startSecond);
        // A model still downloading misses this pass rather than appearing late, mid-street.
        const model = residentModel(type);
        if (typeof model !== "object") { passesDropped = `model-${model}`; continue; }
        const heightMetres = CHARACTER_MANIFEST.residents[type].heightMetres;
        const placement = walkerPlacement(heightMetres, travelerHeight);
        const speed = walkerSpeedMetresPerSecond(type);
        // Everyone strolls in the one lane behind him, so someone sets off only if they
        // can never catch up with the person furthest back before that person has left.
        const rearmost = walkers.reduce<Walker | undefined>(
          (back, walker) => (back === undefined || walker.street.x > back.street.x ? walker : back),
          undefined,
        );
        if (!walkerCanFollow(rearmost?.street, speed, placement, horizontal)) { passesDropped = "gap"; continue; }
        const street = enterWalker(speed, walkerTakeMetresPerSecond(type), horizontal);
        if (!street) { passesDropped = "entry"; continue; }
        passesSpawned += 1;
        const actor = residentActor(type, model);
        const anchor = new THREE.Group();
        anchor.add(actor.root);
        anchor.scale.setScalar(placement.scale);
        walkerRoot.add(anchor);
        walkers.push({ actor, anchor, type, heightMetres, placement, street });
      }

      // One of them stops and waves back for as long as a crowd wave lasts, chosen from
      // the wave's start second so every viewer sees the same person answer.
      const crowdWave = motion.action?.source === "crowd" && motion.action.kind === "wave" ? motion.action : undefined;
      const waver = crowdWave
        ? walkers[wavingWalker(Math.round(sample.rawSeconds - crowdWave.elapsedSeconds), state.pack.assetVersion, walkers.length)]
        : undefined;
      let wavingBack = false;
      const walkerContacts: CharacterContact[] = [];
      const passing = new Set<Walker>();
      // Front to back, so each person measures the gap to the one ahead after that one moved.
      let ahead: StreetWalker | undefined;
      for (const walker of [...walkers].sort((left, right) => left.street.x - right.street.x)) {
        const waving = walker === waver;
        // Someone who comes up behind a person waving back waits instead of walking through them.
        const waiting = !waving && walkerMustWait(walker.street, ahead);
        walker.street = {
          ...advanceWalker(walker.street, dt, walker.placement, waving || waiting),
          waiting,
        };
        if (walkerHasLeft(walker.street, horizontal)) {
          removeWalker(walker);
          continue;
        }
        ahead = walker.street;
        passing.add(walker);
        wavingBack ||= waving;
        const x = walker.street.x;
        walker.anchor.position.set(x, walker.placement.footY, walker.placement.z);
        // Every passer-by approaches from the right and faces the way they move.
        walker.anchor.rotation.y = -0.68;
        walker.actor.sample(
          waving
            ? { clip: "greet", seconds: crowdWave?.elapsedSeconds ?? 0 }
            : waiting
              ? { clip: "idle", seconds: 0 }
              // The gait is advanced by their own steps, so it wraps inside the clip and
              // the feet stay planted on the painted street rather than sliding over it.
              : { clip: "walk", seconds: walker.street.gaitSeconds },
          dt,
          false,
          1.8,
        );
        walker.actor.setAppearance(state.grade.current);
        walkerContacts.push({
          footX: (x / horizontal + 0.5) * width,
          footY: frame.layout.groundY - walker.placement.footY * frame.layout.pxPerMetre,
          scale: frame.layout.pxPerMetre * walker.placement.scale * walker.heightMetres / 1.78,
        });
      }
      // Arrival order is kept, because the person who waves back is chosen by it.
      walkers = walkers.filter((walker) => passing.has(walker));
      element.dataset.walkers = String(walkers.length);
      element.dataset.walkerPasses = `${passesSpawned}/${passesSeen}`;
      element.dataset.walkerDropped = passesDropped;
      element.dataset.walkerResidents = walkers.map((walker) => walker.type).join(" ");
      element.dataset.walkerFootX = walkerContacts.map((contact) => contact.footX.toFixed(1)).join(" ");
      element.dataset.walkerWaving = String(wavingBack);

      state.contacts.current = {
        traveler: traveler ? { footX: (foot.x + 1) * width / 2, footY: (1 - foot.y) * height / 2,
          scale: (head.y - foot.y) * height / 2 / 1.78 } : null,
        resident: residentRoot.visible ? { footX: residentScreenAnchor * width, footY: (1 - foot.y) * height / 2,
          scale: frame.layout.pxPerMetre * CHARACTER_MANIFEST.residents[residentType ?? "resident-a"].heightMetres / 1.78 } : null,
        walkers: walkerContacts,
      };

      renderer.render(scene, camera);
      // The drawing buffer is only guaranteed here, immediately after the draw,
      // so the copy is taken synchronously rather than with preserveDrawingBuffer.
      if (captureWaiters.current.length > 0) {
        const frame = copyCanvas(renderer.domElement);
        const waiters = captureWaiters.current;
        captureWaiters.current = [];
        for (const waiter of waiters) waiter(frame);
      }
    };
    raf = requestAnimationFrame(draw);

    // The browser reclaims a context whenever it likes — a long day on one tab,
    // another page wanting the GPU. Preventing the default keeps this canvas
    // restorable, but nothing restores it on its own, so ask, and if the answer
    // never comes, build a new stage around a new context.
    let restoreAttempt = 0;
    let restoreTimer: number | null = null;
    const askForContext = () => {
      if (disposed || !contextLost || restoreTimer !== null) return;
      if (restoreAttempt >= CONTEXT_RESTORE_ATTEMPTS) {
        if (rebuilds.current >= MAX_STAGE_REBUILDS) return;
        rebuilds.current += 1;
        setStageBuild((build) => build + 1);
        return;
      }
      const delay = characterRetryDelayMs(restoreAttempt);
      restoreAttempt += 1;
      restoreTimer = window.setTimeout(() => {
        restoreTimer = null;
        if (disposed || !contextLost) return;
        element.dataset.contextRestoreAttempts = String(restoreAttempt);
        // The browser may refuse outright; the next attempt, or the rebuild, answers that.
        try { renderer.forceContextRestore(); } catch { /* handled by the next attempt */ }
        askForContext();
      }, delay);
    };
    const lost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      latest.current.contacts.current = { traveler: null, resident: null };
      renderer.domElement.style.visibility = "hidden";
      latest.current.onTravelerAvailability?.(false);
      latest.current.onResidentAvailability?.(false);
      askForContext();
    };
    const restored = () => {
      contextLost = false;
      restoreAttempt = 0;
      if (restoreTimer !== null) window.clearTimeout(restoreTimer);
      restoreTimer = null;
      last = 0;
      renderer.domElement.style.visibility = "visible";
      latest.current.onTravelerAvailability?.(Boolean(traveler));
      latest.current.onResidentAvailability?.(Boolean(resident));
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    renderer.domElement.addEventListener("webglcontextrestored", restored);

    return () => {
      disposed = true;
      latest.current.contacts.current = { traveler: null, resident: null };
      cancelAnimationFrame(raf);
      if (travelerRetry !== null) window.clearTimeout(travelerRetry);
      for (const timer of residentRetries.values()) window.clearTimeout(timer);
      residentRetries.clear();
      if (restoreTimer !== null) window.clearTimeout(restoreTimer);
      document.removeEventListener("visibilitychange", retryWhenVisible);
      observer.disconnect();
      latest.current.onTravelerAvailability?.(false);
      latest.current.onResidentAvailability?.(false);
      traveler?.dispose();
      resident?.dispose();
      for (const walker of walkers) walker.actor.dispose();
      walkers = [];
      for (const model of residentModels.values()) if (typeof model === "object") disposeModel(model.scene);
      residentModels.clear();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      renderer.domElement.removeEventListener("webglcontextrestored", restored);
      disposeModel(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [stageBuild]);

  return <div ref={host} className="product-character-stage" data-testid="product-character-stage" />;
}
