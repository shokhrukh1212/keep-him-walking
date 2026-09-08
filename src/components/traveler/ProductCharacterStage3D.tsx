"use client";

import { useEffect, useRef, type RefObject } from "react";
import { publicAssetUrl } from "@/lib/assets/url";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { CountryPack } from "@/lib/content/schema";
import { CharacterActor } from "@/lib/characters/actor";
import { CharacterLights } from "@/lib/characters/toon";
import type { CharacterContacts, VisualGrade } from "@/lib/world/visual-grade";
import { CHARACTER_MANIFEST } from "@/lib/characters/manifest";
import { productCharacterSceneAt } from "@/lib/characters/product-timeline";
import { actorLayout } from "@/lib/traveler/actor-layout";
import type { StageFrame } from "@/lib/world/stage-layout";
import { travelerMotionAt } from "@/lib/traveler/motion-clock";
import { PresentationClock } from "@/lib/traveler/presentation-clock";
import type { TravelerCommand } from "@/lib/traveler/types";
import type { QualityTier, RouteRuntime } from "@/lib/world/types";

type Props = {
  pack: CountryPack;
  stageFrame: RefObject<StageFrame | null>;
  contacts: RefObject<CharacterContacts>;
  grade: RefObject<VisualGrade>;
  routeRuntime: RouteRuntime;
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
  useEffect(() => { latest.current = props; }, [props]);

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
    scene.add(travelerRoot, residentRoot);
    const loader = new GLTFLoader();
    const clock = new PresentationClock();
    let traveler: CharacterActor | undefined;
    let resident: CharacterActor | undefined;
    let last = 0;
    let lastRender = 0;
    let firstSample = true;
    let previousConversation = false;

    const load = async (kind: "traveler" | "resident") => {
      let loadedRoot: THREE.Group | undefined;
      try {
        const definition = CHARACTER_MANIFEST[kind];
        const gltf = await loader.loadAsync(publicAssetUrl(definition.url));
        loadedRoot = gltf.scene;
        if (disposed) {
          disposeModel(loadedRoot);
          return;
        }
        const actor = new CharacterActor(gltf, definition.heightMetres, kind === "traveler");
        if (kind === "traveler") {
          traveler = actor;
          travelerRoot.add(actor.root);
          void actor.setSponsor(latest.current.command?.sponsorPatchUrl);
          element.dataset.characterReady = "true";
          latest.current.onTravelerAvailability?.(true);
        } else {
          resident = actor;
          residentRoot.add(actor.root);
          element.dataset.residentReady = "true";
          latest.current.onResidentAvailability?.(true);
        }
      } catch {
        if (loadedRoot) disposeModel(loadedRoot);
        if (kind === "traveler") latest.current.onTravelerAvailability?.(false);
        else latest.current.onResidentAvailability?.(false);
      }
    };
    void load("traveler");
    void load("resident");

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
      const sample = clock.sample(now);
      const motion = travelerMotionAt(state.pack, sample.rawSeconds);
      const cue = productCharacterSceneAt(state.pack, motion, sample.traveling, state.command?.actionReview, now);
      const snap = firstSample || cue.conversation !== previousConversation;
      firstSample = false;
      previousConversation = cue.conversation;
      traveler?.sample(cue.traveler, dt, snap);
      void traveler?.setSponsor(state.command?.sponsorPatchUrl);
      resident?.sample(cue.resident, dt, snap, 1.8);

      const width = Math.max(1, element.clientWidth);
      const height = Math.max(1, element.clientHeight);
      const frame = state.stageFrame.current;
      // Wait for decoded world dimensions; never invent a second layout for the actor.
      if (!frame || frame.assetVersion !== state.pack.assetVersion
        || frame.viewportW !== width || frame.viewportH !== height) {
        state.contacts.current = { traveler: null, resident: null };
        return;
      }
      updateCamera(width, height, frame);
      lights.update(frame.stage);
      traveler?.setAppearance(frame.stage, state.grade.current, state.qualityTier);
      resident?.setAppearance(frame.stage, state.grade.current, state.qualityTier);
      const vertical = CHARACTER_MANIFEST.traveler.heightMetres * height / frame.layout.personHeightPx;
      const horizontal = vertical * width / height;
      const defaultAnchor = state.pack.schemaVersion === 3 ? state.pack.route.travelerViewportAnchor : 0.61;
      const mobile = width <= 600;
      const [left, right] = frame.stage.walkableX;
      const travelerAnchor = Math.min(right, Math.max(left, cue.conversation ? (mobile ? 0.34 : 0.43) : defaultAnchor));
      const residentAnchor = Math.min(right, Math.max(left, mobile ? 0.76 : 0.72));
      travelerRoot.position.x = (travelerAnchor - 0.5) * horizontal;
      residentRoot.position.x = (residentAnchor - 0.5) * horizontal;
      travelerRoot.rotation.y = cue.conversation ? Math.PI / 2 : state.command?.facing === "left" ? -0.68 : 0.68;
      residentRoot.rotation.y = -Math.PI / 2;
      residentRoot.visible = cue.showResident && Boolean(resident);
      element.dataset.characterState = cue.traveler.clip;
      element.dataset.residentVisible = String(residentRoot.visible);
      // Measured through the actual camera, not just echoed from the input metadata.
      camera.updateMatrixWorld();
      const foot = new THREE.Vector3(travelerRoot.position.x, 0, 0).project(camera);
      const head = new THREE.Vector3(travelerRoot.position.x, 1.78, 0).project(camera);
      element.dataset.footY = String((1 - foot.y) * height / 2);
      element.dataset.personHeight = String((head.y - foot.y) * height / 2);
      element.dataset.characterImageScale = String(frame.layout.characterImageScale);
      element.dataset.zoneId = frame.zoneId;
      state.contacts.current = {
        traveler: traveler ? { footX: (foot.x + 1) * width / 2, footY: (1 - foot.y) * height / 2,
          scale: (head.y - foot.y) * height / 2 / 1.78 } : null,
        resident: residentRoot.visible ? { footX: residentAnchor * width, footY: (1 - foot.y) * height / 2,
          scale: frame.layout.pxPerMetre * CHARACTER_MANIFEST.resident.heightMetres / 1.78 } : null,
      };
      element.dataset.outline = String(state.qualityTier !== "low");
      element.dataset.grade = JSON.stringify(state.grade.current);
      renderer.render(scene, camera);
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
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      renderer.domElement.removeEventListener("webglcontextrestored", restored);
      disposeModel(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={host} className="product-character-stage" data-testid="product-character-stage" />;
}
