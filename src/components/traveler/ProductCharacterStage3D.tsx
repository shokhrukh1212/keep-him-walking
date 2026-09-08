"use client";

import { useEffect, useRef } from "react";
import { publicAssetUrl } from "@/lib/assets/url";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { CountryPack } from "@/lib/content/schema";
import { CharacterActor } from "@/lib/characters/actor";
import { CHARACTER_MANIFEST } from "@/lib/characters/manifest";
import { productCharacterSceneAt } from "@/lib/characters/product-timeline";
import { actorLayout } from "@/lib/traveler/actor-layout";
import { travelerMotionAt } from "@/lib/traveler/motion-clock";
import { PresentationClock } from "@/lib/traveler/presentation-clock";
import type { TravelerCommand } from "@/lib/traveler/types";
import type { QualityTier, RouteRuntime } from "@/lib/world/types";

type Props = {
  pack: CountryPack;
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = latest.current.qualityTier !== "low";
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-hidden", "true");
    element.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-2, 2, 2, -1, 0.01, 40);
    scene.add(new THREE.HemisphereLight(0xe8f3ff, 0x6f6046, 1.55));
    const key = new THREE.DirectionalLight(0xffead5, 2.35);
    key.position.set(-3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(latest.current.qualityTier === "high" ? 1024 : 512, latest.current.qualityTier === "high" ? 1024 : 512);
    Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.1, far: 12 });
    key.shadow.normalBias = 0.003;
    key.shadow.bias = -0.0001;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9bc8dc, 0.8);
    fill.position.set(4, 2, 3);
    scene.add(fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.2 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.004;
    floor.receiveShadow = true;
    scene.add(floor);

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
      const layout = actorLayout(width, height);
      const vertical = CHARACTER_MANIFEST.traveler.heightMetres / Math.max(0.1, layout.height / height);
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
      const layout = actorLayout(width, height);
      const vertical = CHARACTER_MANIFEST.traveler.heightMetres / Math.max(0.1, layout.height / height);
      const horizontal = vertical * width / height;
      const defaultAnchor = state.pack.schemaVersion === 3 ? state.pack.route.travelerViewportAnchor : 0.61;
      const mobile = width <= 600;
      const travelerAnchor = cue.conversation ? (mobile ? 0.34 : 0.43) : defaultAnchor;
      const residentAnchor = mobile ? 0.76 : 0.72;
      travelerRoot.position.x = (travelerAnchor - 0.5) * horizontal;
      residentRoot.position.x = (residentAnchor - 0.5) * horizontal;
      travelerRoot.rotation.y = cue.conversation ? Math.PI / 2 : state.command?.facing === "left" ? -0.68 : 0.68;
      residentRoot.rotation.y = -Math.PI / 2;
      residentRoot.visible = cue.showResident && Boolean(resident);
      element.dataset.characterState = cue.traveler.clip;
      element.dataset.residentVisible = String(residentRoot.visible);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(draw);

    const lost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
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
      cancelAnimationFrame(raf);
      observer.disconnect();
      latest.current.onTravelerAvailability?.(false);
      latest.current.onResidentAvailability?.(false);
      traveler?.dispose();
      resident?.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      renderer.domElement.removeEventListener("webglcontextrestored", restored);
      disposeModel(scene);
      key.shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={host} className="product-character-stage" data-testid="product-character-stage" />;
}
