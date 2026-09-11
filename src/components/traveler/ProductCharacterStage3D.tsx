"use client";

import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import type { CountryPack } from "@/lib/content/schema";
import { CharacterActor } from "@/lib/characters/actor";
import { CharacterLights } from "@/lib/characters/toon";
import type { CharacterContacts, VisualGrade } from "@/lib/world/visual-grade";
import { CHARACTER_MANIFEST, RESIDENT_TYPES, type ResidentType } from "@/lib/characters/manifest";
import { loadCharacterGltf } from "@/lib/characters/loader";
import { productCharacterSceneAt } from "@/lib/characters/product-timeline";
import { packResidentType, walkerResidentType } from "@/lib/characters/residents";
import { actorLayout } from "@/lib/traveler/actor-layout";
import { frameFitsViewport, type StageFrame } from "@/lib/world/stage-layout";
import { METRES_PER_SECOND, travelerMotionAt } from "@/lib/traveler/motion-clock";
import { wavingWalker } from "@/lib/world/ambient";
import { QUALITY_LIMITS } from "@/lib/world/quality-tier";
import {
  advanceWalker, enterWalker, walkerHasLeft, walkerPassesBetween, walkerPlacement, walkerScreenX,
  type StreetWalker, type WalkerLane, type WalkerPlacement,
} from "@/lib/world/walkers";
import { PresentationClock } from "@/lib/traveler/presentation-clock";
import type { CharacterContact } from "@/lib/world/visual-grade";
import type { TravelerCommand } from "@/lib/traveler/types";
import type { QualityTier, RouteRuntime } from "@/lib/world/types";
import type { ScheduledActionView } from "@/lib/contracts";

const EMPTY_SCHEDULED_ACTIONS: readonly ScheduledActionView[] = [];

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
    // The conversation partner: the resident the current pack names.
    let resident: CharacterActor | undefined;
    let residentType: ResidentType | undefined;
    // Its model. Walkers wait for it, so the partner is never the one left loading.
    let residentGltf: GLTF | undefined;
    // One untouched copy of each resident model. CharacterActor converts materials and
    // adds outlines to the scene it is given, so every actor, the partner included, is
    // built on its own skeleton clone. The other resident downloads the first time a
    // walker needs it, so a device that shows no walkers never fetches it.
    const residentModels = new Map<ResidentType, GLTF | "loading" | "failed">();
    // People passing on his pavement. Each keeps its own street position and is
    // removed only after walking out of view (src/lib/world/walkers.ts).
    type Walker = {
      actor: CharacterActor; anchor: THREE.Group; type: ResidentType; heightMetres: number;
      lane: WalkerLane; placement: WalkerPlacement; street: StreetWalker;
    };
    let walkers: Walker[] = [];
    // The watched second the walkers last moved at; passes start in the interval since.
    let walkerSecond: number | undefined;
    const removeWalker = (walker: Walker) => {
      walkerRoot.remove(walker.anchor);
      walker.actor.dispose();
      disposeModel(walker.anchor);
    };
    let last = 0;
    let lastRender = 0;
    let firstSample = true;
    let previousConversation = false;

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
      } catch {
        if (loadedRoot) disposeModel(loadedRoot);
        latest.current.onTravelerAvailability?.(false);
      }
    };
    void loadTraveler();

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
      clock.accept(state.routeRuntime, state.command?.presenceTtlMs ?? 50_000, now);
      const sample = clock.sample(now, state.scheduledActions ?? EMPTY_SCHEDULED_ACTIONS);
      const motion = travelerMotionAt(
        state.pack,
        sample.rawSeconds,
        sample.distanceMetres,
        state.scheduledActions ?? EMPTY_SCHEDULED_ACTIONS,
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
      );
      const snap = firstSample || cue.conversation !== previousConversation;
      firstSample = false;
      previousConversation = cue.conversation;
      traveler?.sample(cue.traveler, dt, snap);
      void traveler?.setSponsor(state.command?.sponsorPatchUrl);
      void traveler?.setBottle(state.command?.sponsorBottleUrl);
      // The partner follows the pack, including a pack that changes while mounted: the
      // previous city's resident leaves at once rather than standing in for the next.
      const partnerType = packResidentType(state.pack);
      const partnerModel = residentModel(partnerType);
      if (residentType !== partnerType || (!resident && typeof partnerModel === "object")) {
        if (resident) {
          residentRoot.remove(resident.root);
          resident.dispose();
          resident = undefined;
          residentGltf = undefined;
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
            residentGltf = partnerModel;
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
      lights.update(frame.stage, state.grade.current);
      traveler?.toon.viewport.value.set(element.clientWidth, element.clientHeight);
      resident?.toon.viewport.value.set(element.clientWidth, element.clientHeight);
      traveler?.setAppearance(frame.stage, state.grade.current, state.qualityTier);
      resident?.setAppearance(frame.stage, state.grade.current, state.qualityTier);
      const vertical = CHARACTER_MANIFEST.traveler.heightMetres * height / frame.layout.personHeightPx;
      const horizontal = vertical * width / height;
      const defaultAnchor = state.pack.schemaVersion === 3 ? state.pack.route.travelerViewportAnchor : 0.61;
      const mobile = width <= 600;
      const [left, right] = frame.stage.walkableX;
      const travelerAnchor = Math.min(right, Math.max(left,
        cue.conversation ? (mobile ? 0.34 : 0.43) : defaultAnchor,
      ));
      const residentAnchor = Math.min(right, Math.max(left, mobile ? 0.76 : 0.72));
      travelerRoot.position.x = (travelerAnchor - 0.5) * horizontal;
      residentRoot.position.x = (residentAnchor - 0.5) * horizontal;
      travelerRoot.rotation.x = cue.travelerLeanRadians ?? 0;
      travelerRoot.rotation.y = cue.conversation ? Math.PI / 2 : state.command?.facing === "left" ? -0.68 : 0.68;
      residentRoot.rotation.y = -Math.PI / 2;
      residentRoot.visible = cue.showResident && Boolean(resident);
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
      element.dataset.characterSeconds = String(cue.traveler.seconds);
      element.dataset.characterViewportOffset = "0";
      element.dataset.walkTimeScale = String(cue.traveler.timeScale ?? 1);
      element.dataset.forwardLeanDegrees = String((cue.travelerLeanRadians ?? 0) * 180 / Math.PI);
      element.dataset.residentVisible = String(residentRoot.visible);
      // Measured through the actual camera, not just echoed from the input metadata.
      camera.updateMatrixWorld();
      const foot = new THREE.Vector3(travelerRoot.position.x, 0, 0).project(camera);
      const head = new THREE.Vector3(travelerRoot.position.x, 1.78, 0).project(camera);
      element.dataset.footY = String((1 - foot.y) * height / 2);
      element.dataset.personHeight = String((head.y - foot.y) * height / 2);
      element.dataset.characterImageScale = String(frame.layout.characterImageScale);
      element.dataset.zoneId = frame.zoneId;
      element.dataset.outline = String(state.qualityTier !== "low");
      element.dataset.grade = JSON.stringify(state.grade.current);

      // ---- People passing on his pavement. A pass starts on the shared watched clock,
      // enters beyond one edge and is removed only once it has walked out beyond the
      // other: nothing he does, no schedule window and no city hour takes anyone out of
      // the middle of the street. New people set off only while he is plainly walking.
      // The tier is read here, not at mount: this effect has an empty dependency list.
      const walkerLimit = QUALITY_LIMITS[state.qualityTier].walkers;
      const travelerHeight = CHARACTER_MANIFEST.traveler.heightMetres;
      // How fast the pavement moves under everyone: his authoritative rate while he
      // walks, nothing while an action or waiting holds his distance. It decides which
      // way a walker faces, so it is never a per-frame measurement that a heartbeat
      // correction could spike into turning an overtaker round.
      const groundSpeed = sample.traveling && !motion.action
        ? METRES_PER_SECOND * Math.max(0, state.routeRuntime.paceRate)
        : 0;
      // Nobody sets off before the conversation partner's model is in, so a walker's
      // download never leaves the partner still loading.
      const passes = walkerSecond !== undefined && residentGltf && sample.traveling
        && (state.command?.walking ?? true) && !cue.conversation && !motion.action
        ? walkerPassesBetween(
            walkerSecond,
            sample.rawSeconds,
            state.command?.localHour ?? 12,
            state.pack.assetVersion,
            walkerLimit,
          )
        : [];
      walkerSecond = sample.rawSeconds;
      // Reduced motion forces the low tier, which shows nobody, so they stop at once.
      if (walkerLimit <= 0) {
        for (const walker of walkers) removeWalker(walker);
        walkers = [];
      }
      for (const pass of passes) {
        // Never two in one lane, who would walk through each other, and never more
        // walkers than residents, because two are never the same model.
        if (walkers.length >= Math.min(walkerLimit, RESIDENT_TYPES.length)
          || walkers.some((walker) => walker.lane === pass.lane)) continue;
        const type = walkerResidentType(walkers.map((walker) => walker.type), state.pack.assetVersion, pass.startSecond);
        // A model still downloading misses this pass rather than appearing late, mid-street.
        const model = residentModel(type);
        if (typeof model !== "object") continue;
        const heightMetres = CHARACTER_MANIFEST.residents[type].heightMetres;
        const placement = walkerPlacement(pass.lane, heightMetres, travelerHeight);
        const street = enterWalker(pass, placement, sample.distanceMetres, groundSpeed, horizontal);
        if (!street) continue;
        const actor = residentActor(type, model);
        const anchor = new THREE.Group();
        anchor.add(actor.root);
        anchor.scale.setScalar(placement.scale);
        walkerRoot.add(anchor);
        walkers.push({ actor, anchor, type, heightMetres, lane: pass.lane, placement, street });
      }

      // One of them stops and waves back for as long as a crowd wave lasts, chosen from
      // the wave's start second so every viewer sees the same person answer.
      const crowdWave = motion.action?.source === "crowd" && motion.action.kind === "wave" ? motion.action : undefined;
      const waver = crowdWave
        ? wavingWalker(Math.round(sample.rawSeconds - crowdWave.elapsedSeconds), state.pack.assetVersion, walkers.length)
        : -1;
      let wavingBack = false;
      const walkerContacts: CharacterContact[] = [];
      const passing: Walker[] = [];
      walkers.forEach((walker, index) => {
        const waving = index === waver;
        walker.street = advanceWalker(
          walker.street, dt, walker.placement, walker.heightMetres, travelerHeight, groundSpeed, waving,
        );
        if (walkerHasLeft(walker.street, sample.distanceMetres, horizontal)) {
          removeWalker(walker);
          return;
        }
        passing.push(walker);
        // Facing the way they move across the screen, three-quarters to the camera as he
        // is. An overtaker he outpaces turns round here rather than drift backwards.
        walker.anchor.rotation.y = walker.street.direction > 0 ? 0.68 : -0.68;
        wavingBack ||= waving;
        const x = walkerScreenX(walker.street, sample.distanceMetres);
        walker.anchor.position.set(x, walker.placement.footY, walker.placement.z);
        walker.actor.sample(
          waving
            ? { clip: "greet", seconds: crowdWave?.elapsedSeconds ?? 0 }
            // The gait is advanced by their own steps, so it wraps inside the clip and
            // the feet keep pace with the pavement rather than sliding over it.
            : { clip: "walk", seconds: walker.street.gaitSeconds },
          dt,
          false,
          1.8,
        );
        walker.actor.toon.viewport.value.set(width, height);
        walker.actor.setAppearance(frame.stage, state.grade.current, state.qualityTier);
        walkerContacts.push({
          footX: (x / horizontal + 0.5) * width,
          footY: frame.layout.groundY - walker.placement.footY * frame.layout.pxPerMetre,
          scale: frame.layout.pxPerMetre * walker.placement.scale * walker.heightMetres / 1.78,
        });
      });
      walkers = passing;
      element.dataset.walkers = String(walkers.length);
      element.dataset.walkerResidents = walkers.map((walker) => walker.type).join(" ");
      element.dataset.walkerLanes = walkers.map((walker) => walker.lane).join(" ");
      element.dataset.walkerFootX = walkerContacts.map((contact) => contact.footX.toFixed(1)).join(" ");
      element.dataset.walkerWaving = String(wavingBack);

      state.contacts.current = {
        traveler: traveler ? { footX: (foot.x + 1) * width / 2, footY: (1 - foot.y) * height / 2,
          scale: (head.y - foot.y) * height / 2 / 1.78 } : null,
        resident: residentRoot.visible ? { footX: residentAnchor * width, footY: (1 - foot.y) * height / 2,
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

    const lost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      latest.current.contacts.current = { traveler: null, resident: null };
      renderer.domElement.style.visibility = "hidden";
      latest.current.onTravelerAvailability?.(false);
      latest.current.onResidentAvailability?.(false);
    };
    const restored = () => {
      contextLost = false;
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
  }, []);

  return <div ref={host} className="product-character-stage" data-testid="product-character-stage" />;
}
